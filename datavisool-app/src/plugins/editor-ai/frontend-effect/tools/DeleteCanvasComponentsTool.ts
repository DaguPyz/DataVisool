/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createElement} from "react";
import {cloneDeep, isEqual} from "lodash";
import {globalModal} from "@datavisool/ui";
import {FrontendEffectClientError, sanitizeFrontendEffectDetails, serializeFrontendEffectError} from "@/plugins/editor-ai/frontend-effect/FrontendEffectClientError.ts";
import {canvasRevision, type CanvasOperationJournal} from "@/plugins/editor-ai/frontend-effect/CanvasOperationJournal.ts";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";

interface DeleteTarget {
    componentId: string;
    componentType: string;
}

interface ExpectedSnapshot extends DeleteTarget {
    layer: unknown;
}

interface DeletePayload {
    targets: DeleteTarget[];
    expectedSnapshots: ExpectedSnapshot[];
}

interface DeleteResult {
    deletedComponentIds: string[];
    failed: Array<{
        componentId: string;
        code: string;
        message: string;
        fieldPath?: string;
        changedPaths?: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}>;
        actualValue?: unknown;
        expectedValue?: unknown;
        cause?: Record<string, unknown>;
        actualState?: string;
    }>;
    baseRevision: string;
    resultRevision: string;
    partial?: boolean;
    actualStateUnknown?: boolean;
    actualState?: Array<{componentId: string; state: "deleted" | "present" | "unknown"; layer?: unknown; verificationError?: Record<string, unknown>}>;
    cleanupStateUnknown?: boolean;
    operationError?: Record<string, unknown>;
}

/** 删除前的强制用户确认。 */
export function runConfirmCanvasDeletionTool(payload: unknown, session: EditorAiEditingSession, signal?: AbortSignal): Promise<{confirmed: boolean}> {
    const targets = normalizeTargets(payload);
    const layers = new Map(session.readComponents(targets.map(target => target.componentId), ["layer"]).components.map(component => [component.id, component]));
    const targetLabels = targets.map((target) => {
        const name = layers.get(target.componentId)?.name?.trim() ?? "";
        return `${name || target.componentId}（${target.componentType}）`;
    });
    return new Promise((resolve, reject) => {
        const modalApi = globalModal.modalApi;
        if (!modalApi) {
            reject(new FrontendEffectClientError("modal_unavailable", "全局弹窗尚未初始化", {
                fieldPath: "globalModal.modalApi", actualValue: null, expectedValue: "initialized modal API",
            }));
            return;
        }
        let settled = false;
        const finish = (result: {confirmed: boolean} | FrontendEffectClientError, isError = false) => {
            if (settled)
                return;
            settled = true;
            signal?.removeEventListener("abort", abort);
            isError ? reject(result) : resolve(result as {confirmed: boolean});
        };
        const modalId = modalApi.confirm({
            title: "确认删除画布组件",
            content: createElement(
                "div",
                {style: {lineHeight: "22px"}},
                `将删除 ${targets.length} 个组件：${targetLabels.join("、")}`,
            ),
            okText: "确认删除",
            cancelText: "取消",
            okType: "danger",
            maskClosable: false,
            onOk: async () => {
                finish({confirmed: true});
                return true;
            },
            onCancel: () => finish({confirmed: false}),
            afterClose: () => finish({confirmed: false}),
        });
        const abort = () => {
            finish(new FrontendEffectClientError("effect_cancelled", "任务已停止等待删除确认"), true);
            modalApi.destroy(modalId);
        };
        signal?.addEventListener("abort", abort, {once: true});
        if (signal?.aborted)
            abort();
    });
}

/** 使用读取基线保护并幂等执行删除。 */
export async function runDeleteCanvasComponentsTool(payload: unknown, session: EditorAiEditingSession, journal: CanvasOperationJournal): Promise<DeleteResult> {
    requireApprovalTicket(payload);
    return journal.run(payload, () => deleteComponents(payload, session), result => result.failed.length === 0);
}

function requireApprovalTicket(payload: unknown): void {
    const ticket = isRecord(payload) ? payload.approvalTicket : undefined;
    if (!isRecord(ticket) || !text(ticket.approvalId) || !text(ticket.nonce))
        throw new FrontendEffectClientError("approval_ticket_missing", "删除组件必须携带服务端签发的审批票据", {
            fieldPath: "approvalTicket",
            actualValue: isRecord(ticket) ? {providedFields: Object.keys(ticket)} : ticket ?? null,
            expectedValue: {approvalId: "non-empty string", nonce: "non-empty string"},
        });
}

function deleteComponents(payload: unknown, session: EditorAiEditingSession): DeleteResult {
    const {targets, expectedSnapshots} = normalizeDeletePayload(payload);
    if (!session.isActive())
        throw new FrontendEffectClientError("agent_workspace_changed", "AI 编辑目标工作空间已失效", {fieldPath: "agentScope.workspaceScope"});
    const baseRevision = canvasRevision(expectedSnapshots);
    const current = session.readComponents(targets.map(target => target.componentId), ["layer"]);
    const currentById = new Map(current.components.map(component => [component.id, component]));
    const failures = targets.flatMap((target, index) => {
        const component = currentById.get(target.componentId);
        if (!component)
            return [deleteFailure(target, "component_not_found", "目标组件已不存在", {actualValue: null, expectedValue: "组件存在时才能执行删除"})];
        if (component.type !== target.componentType)
            return [deleteFailure(target, "component_type_mismatch", `目标组件类型已变化：期望 ${target.componentType}，实际 ${component.type ?? "unknown"}`, {
                actualValue: component.type ?? null, expectedValue: target.componentType, fieldPath: "componentType",
            })];
        if (!isEqual(component.layer, expectedSnapshots[index].layer)) {
            const changedPaths = diffSnapshot(expectedSnapshots[index].layer, component.layer, "layer");
            return [deleteFailure(target, "component_revision_conflict", `目标组件读取后以下字段已变化：${changedPaths.map(item => item.fieldPath).join("、")}`, {
                fieldPath: changedPaths[0]?.fieldPath, changedPaths,
            })];
        }
        return [];
    });
    if (failures.length)
        return {deletedComponentIds: [], failed: failures, baseRevision, resultRevision: baseRevision};

    let mutation: ReturnType<EditorAiEditingSession["deleteComponents"]> | undefined;
    let operationError: Record<string, unknown> | undefined;
    try {
        mutation = session.deleteComponents(targets.map((target, index) => ({...target, layer: expectedSnapshots[index].layer})));
    } catch (error) {
        operationError = serializeFrontendEffectError(error);
    }
    if (!session.isActive())
        throw new FrontendEffectClientError("agent_workspace_changed_after_delete", "画布在删除后已切换，拒绝读取新画布状态", {fieldPath: "agentScope.workspaceScope"});
    let actualById: Map<string, {id: string; layer: Record<string, unknown>}> | undefined;
    let verificationError: Record<string, unknown> | undefined;
    try {
        const actual = session.readComponents(targets.map(target => target.componentId), ["layer"]);
        actualById = new Map(actual.components.map(component => [component.id, component as {id: string; layer: Record<string, unknown>}]));
    } catch (error) {
        verificationError = serializeFrontendEffectError(error);
    }
    const failedById = new Map((mutation?.failed ?? []).map(item => [item.componentId, item]));
    const actualState = targets.map(target => {
        const component = actualById?.get(target.componentId);
        return component
            ? {componentId: target.componentId, state: "present" as const, layer: cloneDeep(component.layer)}
            : actualById
                ? {componentId: target.componentId, state: "deleted" as const}
                : {componentId: target.componentId, state: "unknown" as const, verificationError};
    });
    const deletedComponentIds = actualState.filter(item => item.state === "deleted").map(item => item.componentId);
    const failed: DeleteResult["failed"] = actualState.flatMap(item => {
        const mutationFailure = failedById.get(item.componentId);
        if (item.state === "deleted" && !mutationFailure) return [];
        const target = targets.find(candidate => candidate.componentId === item.componentId)!;
        const knownPresent = item.state === "present";
        const code = item.state === "unknown" ? "delete_state_unknown"
            : operationError ? "delete_operation_failed"
                : mutationFailure?.code ?? "delete_verification_failed";
        const message = item.state === "unknown" ? "删除后无法确认目标组件状态"
            : operationError ? `批量删除遇到错误：${String(operationError.message ?? "未知错误")}`
                : mutationFailure?.message ?? (knownPresent ? "删除后目标组件仍存在" : "删除后的关联清理报告失败");
        return [deleteFailure(target, code, message, {
            fieldPath: `layer.${item.componentId}`,
            actualValue: item.state === "present" ? cloneDeep(item.layer) : item.state,
            expectedValue: null,
            actualState: item.state,
            ...(operationError ? {cause: operationError} : mutationFailure ? {cause: mutationFailure} : {}),
            ...(item.verificationError ? {verificationError: item.verificationError} : {}),
        })];
    });
    if (operationError && failed.length === 0) {
        failed.push({componentId: "$operation", code: "delete_execution_failed",
            message: String(operationError.message ?? "删除后清理执行失败"), fieldPath: "execution",
            actualValue: operationError, expectedValue: "所有目标删除且关联清理均完成", cause: operationError,
            actualState: "targets deleted; cleanup status unknown"});
    }
    const cleanupStateUnknown = Boolean(operationError);
    const actualStateUnknown = actualState.some(item => item.state === "unknown") || cleanupStateUnknown;
    const partial = deletedComponentIds.length > 0 && (failed.length > 0 || cleanupStateUnknown);
    return {
        deletedComponentIds,
        failed,
        baseRevision,
        resultRevision: canvasRevision(actualState),
        partial,
        actualStateUnknown,
        actualState,
        cleanupStateUnknown,
        ...(operationError ? {operationError} : {}),
    };
}

function normalizeDeletePayload(payload: unknown): DeletePayload {
    const targets = normalizeTargets(payload);
    if (!isRecord(payload) || !Array.isArray(payload.expectedSnapshots) || payload.expectedSnapshots.length !== targets.length) {
        throw new FrontendEffectClientError("invalid_payload", "expectedSnapshots 数量必须与删除目标一致", {
            fieldPath: "expectedSnapshots",
            actualValue: isRecord(payload) ? payload.expectedSnapshots : undefined,
            ...(isRecord(payload) && Array.isArray(payload.expectedSnapshots) ? {actualCount: payload.expectedSnapshots.length} : {}),
            expectedValue: {type: "array", exactItems: targets.length},
        });
    }
    const expectedSnapshots = payload.expectedSnapshots.map((value, index) => {
        const target = targets[index];
        if (!isRecord(value))
            throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}] 必须是对象`, {
                componentId: target.componentId, fieldPath: `expectedSnapshots[${index}]`, actualValue: value, expectedValue: "object",
            });
        if (text(value.componentId) !== target.componentId)
            throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}].componentId 与删除目标不匹配`, {
                componentId: target.componentId, fieldPath: `expectedSnapshots[${index}].componentId`,
                actualValue: value.componentId, expectedValue: target.componentId,
            });
        if (text(value.componentType) !== target.componentType)
            throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}].componentType 与删除目标不匹配`, {
                componentId: target.componentId, fieldPath: `expectedSnapshots[${index}].componentType`,
                actualValue: value.componentType, expectedValue: target.componentType,
            });
        if (!Object.prototype.hasOwnProperty.call(value, "layer"))
            throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}] 缺少 layer 基线`, {
                componentId: target.componentId, fieldPath: `expectedSnapshots[${index}].layer`,
                actualValue: value.layer, presentFields: Object.keys(value), expectedValue: "layer 快照字段",
            });
        return {...target, layer: cloneDeep(value.layer)};
    });
    return {targets, expectedSnapshots};
}

function normalizeTargets(payload: unknown): DeleteTarget[] {
    if (!isRecord(payload) || !Array.isArray(payload.targets) || payload.targets.length === 0 || payload.targets.length > 100)
        throw new FrontendEffectClientError("invalid_payload", "targets 数量必须在 1–100", {
            fieldPath: "targets", actualValue: isRecord(payload) ? payload.targets : undefined,
            ...(isRecord(payload) && Array.isArray(payload.targets) ? {actualCount: payload.targets.length} : {}),
            expectedValue: {type: "array", minItems: 1, maxItems: 100},
        });
    const targets = payload.targets.map((value, index) => {
        if (!isRecord(value))
            throw new FrontendEffectClientError("invalid_payload", `targets[${index}] 必须是对象`, {
                fieldPath: `targets[${index}]`, actualValue: value, expectedValue: "object with componentId and componentType",
            });
        const componentId = text(value.componentId);
        const componentType = text(value.componentType);
        if (!componentId || !componentType || componentType === "group")
            throw new FrontendEffectClientError("invalid_payload", `targets[${index}] 缺少有效组件身份或目标类型为 group`, {
                fieldPath: !componentId ? `targets[${index}].componentId` : `targets[${index}].componentType`,
                actualValue: !componentId ? value.componentId : componentType,
                expectedValue: !componentId ? "非空组件 id" : "非空组件类型且不能是 group",
            });
        return {componentId, componentType};
    });
    if (new Set(targets.map((target) => target.componentId)).size !== targets.length)
        throw new FrontendEffectClientError("invalid_payload", "删除目标 componentId 不能重复", {
            fieldPath: "targets[].componentId", actualValue: targets.map((target) => target.componentId),
            expectedValue: "唯一组件 id",
            duplicateComponentIds: targets.map((target) => target.componentId).filter((id, index, ids) => ids.indexOf(id) !== index),
        });
    return targets;
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deleteFailure(target: DeleteTarget, code: string, message: string, details: Record<string, unknown>) {
    return {
        componentId: target.componentId,
        code,
        message,
        ...sanitizeFrontendEffectDetails(details),
    };
}

function diffSnapshot(expected: unknown, current: unknown, path: string): Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> {
    if (isEqual(expected, current))
        return [];
    if (isRecord(expected) && isRecord(current)) {
        return [...new Set([...Object.keys(expected), ...Object.keys(current)])].sort()
            .flatMap((key) => diffSnapshot(expected[key], current[key], `${path}.${key}`));
    }
    if (Array.isArray(expected) && Array.isArray(current)) {
        const changes: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> = [];
        if (expected.length !== current.length)
            changes.push({fieldPath: `${path}.length`, expectedValue: expected.length, currentValue: current.length});
        for (let index = 0; index < Math.max(expected.length, current.length); index += 1)
            changes.push(...diffSnapshot(expected[index], current[index], `${path}[${index}]`));
        return changes;
    }
    return [{fieldPath: path, expectedValue: expected, currentValue: current}];
}
