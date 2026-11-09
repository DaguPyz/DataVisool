/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createElement} from "react";
import {globalModal} from "@datavisool/ui";
import {FrontendEffectClientError} from "@/frontend-effect/FrontendEffectClientError.ts";

interface PatchSummary {
    componentId: string;
    fields: string[];
}

/** R2/R3 画布修改的逐次确认。确认结果只会触发 Rust 签发一次性票据。 */
export function runConfirmCanvasPatchTool(payload: unknown, signal?: AbortSignal): Promise<{confirmed: boolean}> {
    const {risk, patches} = normalize(payload);
    return new Promise((resolve, reject) => {
        const modalApi = globalModal.modalApi;
        if (!modalApi) {
            reject(new FrontendEffectClientError("modal_unavailable", "全局弹窗尚未初始化", {
                fieldPath: "globalModal.modalApi", actualValue: null, expectedValue: "initialized modal API",
            }));
            return;
        }
        let settled = false;
        const finish = (value: {confirmed: boolean} | FrontendEffectClientError, failed = false) => {
            if (settled)
                return;
            settled = true;
            failed ? reject(value) : resolve(value as {confirmed: boolean});
        };
        const detail = patches.map((patch) => `${patch.componentId}：${patch.fields.join("、")}`).join("；");
        const modalId = modalApi.confirm({
            title: risk === "r3" ? "确认高风险画布修改" : "确认画布修改",
            content: createElement("div", {style: {lineHeight: "22px"}}, `将修改 ${patches.length} 个组件：${detail}`),
            okText: "确认修改",
            cancelText: "取消",
            maskClosable: false,
            onOk: async () => {
                finish({confirmed: true});
                return true;
            },
            onCancel: () => finish({confirmed: false}),
            afterClose: () => finish({confirmed: false}),
        });
        const abort = () => {
            finish(new FrontendEffectClientError("effect_cancelled", "任务已停止等待修改确认"), true);
            modalApi.destroy(modalId);
        };
        signal?.addEventListener("abort", abort, {once: true});
        if (signal?.aborted)
            abort();
    });
}

function normalize(payload: unknown): {risk: string; patches: PatchSummary[]} {
    if (!isRecord(payload) || !Array.isArray(payload.patches) || payload.patches.length === 0)
        throw new FrontendEffectClientError("invalid_payload", "修改确认缺少有效组件补丁", {
            fieldPath: "patches", actualValue: isRecord(payload) ? payload.patches : payload,
            expectedValue: "至少 1 个组件补丁对象",
        });
    const risk = text(payload.risk).toLowerCase();
    if (risk !== "r2" && risk !== "r3")
        throw new FrontendEffectClientError("invalid_payload", "修改确认缺少有效风险等级", {
            fieldPath: "risk", actualValue: payload.risk, allowedValues: ["r2", "r3"],
        });
    const patches = payload.patches.map((patch, index) => {
        if (!isRecord(patch) || !text(patch.componentId))
            throw new FrontendEffectClientError("invalid_payload", `第 ${index + 1} 个修改目标无效`, {
                fieldPath: `patches[${index}]`, actualValue: patch,
                expectedValue: "对象且包含非空 componentId",
            });
        const fields = ["stylePatch", "dataPatch", "layerPatch", "filterPatch"].filter((field) => patch[field] !== undefined);
        if (fields.length === 0)
            throw new FrontendEffectClientError("invalid_payload", `第 ${index + 1} 个修改缺少字段`, {
                componentId: text(patch.componentId), fieldPath: `patches[${index}]`, actualValue: Object.keys(patch),
                expectedValue: "至少一个可写字段：stylePatch、dataPatch、layerPatch、filterPatch",
            });
        return {componentId: text(patch.componentId), fields};
    });
    return {risk, patches};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}
