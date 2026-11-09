/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createElement} from "react";
import {cloneDeep, isEqual} from "lodash";
import {globalModal} from "@datavisool/ui";
import {FrontendEffectClientError, sanitizeFrontendEffectDetails, serializeFrontendEffectError} from "@/frontend-effect/FrontendEffectClientError.ts";
import {canvasRevision, runIdempotentCanvasOperation} from "@/frontend-effect/CanvasOperationJournal.ts";
import {deleteLayersByIds} from "@/designer/operate-provider/selection/SelectionCommands.ts";

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
export function runConfirmCanvasDeletionTool(payload: unknown, signal?: AbortSignal): Promise<{confirmed: boolean}> {
    const targets = normalizeTargets(payload);
    const layers = window.DATAVISOOL_ENV?.currentManager?.layerManager?.layerConfigs ?? {};
    const targetLabels = targets.map((target) => {
        const name = typeof layers[target.componentId]?.name === "string" ? layers[target.componentId]?.name?.trim() : "";
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
export async function runDeleteCanvasComponentsTool(payload: unknown): Promise<DeleteResult> {
    requireApprovalTicket(payload);
    return runIdempotentCanvasOperation(payload, () => deleteComponents(payload), (result) => result.failed.length === 0);
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

function deleteComponents(payload: unknown): DeleteResult {
    const {targets, expectedSnapshots} = normalizeDeletePayload(payload);
    const layerManager = window.DATAVISOOL_ENV?.currentManager?.layerManager;
    const baseRevision = canvasRevision(expectedSnapshots);
    const failures = targets.flatMap((target, index) => {
        const current = layerManager?.layerConfigs?.[target.componentId];
        if (!current) {
            return [deleteFailure(target, "component_not_found", "目标组件已不存在，删除目标已满足", {
                actualValue: null, expectedValue: "组件存在时才能执行删除",
            })];
        }
        if (current.type !== target.componentType) {
            return [deleteFailure(target, "component_type_mismatch", `目标组件类型已变化：期望 ${target.componentType}，实际 ${current.type ?? "unknown"}`, {
                actualValue: current.type ?? null, expectedValue: target.componentType, fieldPath: "componentType",
            })];
        }
        if (!isEqual(current, expectedSnapshots[index].layer)) {
            const changedPaths = diffSnapshot(expectedSnapshots[index].layer, current, "layer");
            return [deleteFailure(target, "component_revision_conflict", `目标组件读取后以下字段已变化：${changedPaths.map((item) => item.fieldPath).join("、")}`, {
                fieldPath: changedPaths[0]?.fieldPath, changedPaths,
            })];
        }
        return [];
    });
    if (failures.length > 0) {
        return {deletedComponentIds: [], failed: failures, baseRevision, resultRevision: baseRevision};
    }

    const targetIds = targets.map((target) => target.componentId);
    let operationError: Record<string, unknown> | undefined;
    try {
        deleteLayersByIds(targetIds);
    } catch (error) {
        operationError = serializeFrontendEffectError(error);
    }

    // deleteLayersByIds destroys targets sequentially, so an exception does not imply
    // that nothing changed. Re-read every target before creating the idempotent receipt.
    const actualState = readDeleteActualState(targetIds);
    const deletedComponentIds = actualState.filter((item) => item.state === "deleted").map((item) => item.componentId);
    const failed: DeleteResult["failed"] = actualState.flatMap((item) => {
        if (item.state === "deleted")
            return [];
        const target = targets.find((candidate) => candidate.componentId === item.componentId)!;
        const knownPresent = item.state === "present";
        return [deleteFailure(
            target,
            knownPresent ? (operationError ? "delete_operation_failed" : "delete_verification_failed") : "delete_state_unknown",
            knownPresent
                ? operationError
                    ? `批量删除遇到错误，组件仍存在：${String(operationError.message ?? "未知错误")}`
                    : "删除后目标组件仍存在"
                : `批量删除后无法确认组件状态${operationError ? `：${String(operationError.message ?? "未知错误")}` : ""}`,
            {
                fieldPath: `layer.${item.componentId}`,
                actualValue: item.state === "present" ? cloneDeep(item.layer) : "unknown",
                expectedValue: null,
                actualState: item.state,
                ...(operationError ? {cause: operationError} : item.verificationError ? {cause: item.verificationError} : {}),
                ...(item.verificationError ? {verificationError: item.verificationError} : {}),
            },
        )];
    });
    const cleanupStateUnknown = Boolean(operationError);
    if (operationError && failed.length === 0) {
        failed.push({
            componentId: "$operation",
            code: "delete_execution_failed",
            message: String(operationError.message ?? "删除后清理执行失败"),
            fieldPath: "execution",
            actualValue: operationError,
            expectedValue: "所有目标删除且关联清理均完成",
            cause: operationError,
            actualState: "targets deleted; cleanup status unknown",
        });
    }
    const actualStateUnknown = actualState.some((item) => item.state === "unknown") || cleanupStateUnknown;
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

function readDeleteActualState(componentIds: string[]): Array<{
    componentId: string;
    state: "deleted" | "present" | "unknown";
    layer?: unknown;
    verificationError?: Record<string, unknown>;
}> {
    try {
        const layers = window.DATAVISOOL_ENV?.currentManager?.layerManager?.layerConfigs;
        if (!isRecord(layers)) {
            const verificationError = {
                code: "delete_state_unavailable",
                message: "无法读取删除后的组件状态",
                fieldPath: "currentManager.layerManager.layerConfigs",
                actualValue: layers === undefined ? null : layers,
                actualType: layers === undefined ? "missing" : layers === null ? "null" : typeof layers,
                expectedValue: "object containing current component configurations",
            };
            return componentIds.map((componentId) => ({componentId, state: "unknown", verificationError}));
        }
        return componentIds.map((componentId) => Object.prototype.hasOwnProperty.call(layers, componentId)
            ? {componentId, state: "present", layer: cloneDeep(layers[componentId])}
            : {componentId, state: "deleted"});
    } catch (error) {
        const verificationError = serializeFrontendEffectError(error);
        return componentIds.map((componentId) => ({componentId, state: "unknown", verificationError}));
    }
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
