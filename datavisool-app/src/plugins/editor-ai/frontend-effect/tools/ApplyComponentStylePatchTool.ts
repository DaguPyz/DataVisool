/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep} from "lodash";
import {FrontendEffectClientError} from "@/plugins/editor-ai/frontend-effect/FrontendEffectClientError.ts";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";

/** 统一样式补丁协议：顶层只能包含非空 style。 */
interface ComponentStylePatch {
    style: Record<string, unknown>;
}

/**
 * 单个组件样式补丁请求。
 */
interface ApplyComponentStylePatchItem {
    /** 目标组件 id。 */
    componentId: string;
    /** 目标组件类型，必须与当前画布组件类型一致。 */
    componentType: string;
    /** 只包含 style 根字段的完整组件配置补丁。 */
    stylePatch: ComponentStylePatch;
    /** AI 生成该补丁的简短原因。 */
    reason?: string;
}

/**
 * 批量组件样式补丁请求。
 */
interface ApplyComponentStylePatchPayload {
    /** 本次工具调用要应用的补丁列表。 */
    patches: ApplyComponentStylePatchItem[];
    /** 服务端从 inspect_current_page 结果保存的只读并发基线。 */
    expectedSnapshots?: ExpectedComponentStyleSnapshot[];
}

interface ExpectedComponentStyleSnapshot {
    componentId: string;
    componentType: string;
    style: unknown;
}

/**
 * 单个组件样式补丁应用成功结果。
 */
interface ApplyComponentStylePatchSuccess {
    /** 目标组件 id。 */
    componentId: string;
    /** 目标组件类型。 */
    componentType: string;
    /** 应用后的组件 style 快照。 */
    style: unknown;
}

/**
 * 单个组件样式补丁应用失败结果。
 */
interface ApplyComponentStylePatchFailure {
    /** 目标组件 id。 */
    componentId: string;
    /** 目标组件类型。 */
    componentType?: string;
    /** 稳定错误码。 */
    code: string;
    /** 错误说明。 */
    message: string;
    fieldPath?: string;
    actualValue?: unknown;
    expectedValue?: unknown;
    changedPaths?: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}>;
}

/**
 * 批量组件样式补丁应用结果。
 */
interface ApplyComponentStylePatchResult {
    /** 成功应用的组件结果。 */
    applied: ApplyComponentStylePatchSuccess[];
    /** 应用失败的组件结果。 */
    failed: ApplyComponentStylePatchFailure[];
    partial?: boolean;
    partiallyApplied?: Array<{componentId: string; componentType: string; style: unknown}>;
    rollbackFailedComponentIds?: string[];
}

/**
 * 执行组件样式补丁应用工具。
 */
export function runApplyComponentStylePatchTool(payload: unknown, session: EditorAiEditingSession): ApplyComponentStylePatchResult {
    const {patches, expectedSnapshots} = normalizePayload(payload);
    const result = session.applyComponentStylePatch(patches, expectedSnapshots?.map(item => ({
        componentId: item.componentId,
        componentType: item.componentType,
        style: item.style,
    })));
    const after = session.readComponents(patches.map(item => item.componentId), ['config']);
    const configById = new Map(after.components.map(item => [item.id, item.config]));
    return {
        applied: result.applied.map(item => ({
            ...item,
            style: cloneDeep(configById.get(item.componentId)?.style),
        })),
        failed: result.failed.map(item => ({...item})),
        ...(result.partial === true ? {partial: true} : {}),
        ...(Array.isArray(result.partiallyApplied) ? {partiallyApplied: result.partiallyApplied as ApplyComponentStylePatchResult['partiallyApplied']} : {}),
        ...(Array.isArray(result.rollbackFailedComponentIds) ? {rollbackFailedComponentIds: result.rollbackFailedComponentIds as string[]} : {}),
    };
}

/**
 * 归一化并校验工具入参。
 */
function normalizePayload(payload: unknown): {
    patches: ApplyComponentStylePatchItem[];
    expectedSnapshots?: ExpectedComponentStyleSnapshot[];
} {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new FrontendEffectClientError("invalid_payload", "样式补丁工具入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });
    }

    const rawPayload = payload as ApplyComponentStylePatchPayload;
    if (!Array.isArray(rawPayload.patches) || rawPayload.patches.length === 0) {
        throw new FrontendEffectClientError("invalid_payload", "样式补丁列表必须是非空数组", {
            fieldPath: "patches", actualValue: rawPayload.patches,
            ...(Array.isArray(rawPayload.patches) ? {actualCount: rawPayload.patches.length} : {}),
            expectedValue: {type: "array", minItems: 1},
        });
    }

    const patches = rawPayload.patches.map((patch, index) => {
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
            throw new FrontendEffectClientError("invalid_patch", `第 ${index + 1} 个样式补丁必须是对象`, {
                fieldPath: `patches[${index}]`, actualValue: patch, expectedValue: "object",
            });
        }
        const componentId = typeof patch.componentId === "string" ? patch.componentId.trim() : "";
        if (!componentId) {
            throw new FrontendEffectClientError("invalid_patch", `patches[${index}].componentId 必须是非空字符串`, {
                fieldPath: `patches[${index}].componentId`, actualValue: patch.componentId, expectedValue: "非空字符串",
            });
        }
        const componentType = typeof patch.componentType === "string" ? patch.componentType.trim() : "";
        if (!componentType) {
            throw new FrontendEffectClientError("invalid_patch", `patches[${index}].componentType 必须是非空字符串`, {
                componentId, fieldPath: `patches[${index}].componentType`, actualValue: patch.componentType, expectedValue: "非空字符串",
            });
        }
        return {
            componentId,
            componentType,
            stylePatch: normalizeStylePatch(patch.stylePatch, index),
            reason: patch.reason,
        };
    });
    return {
        patches,
        expectedSnapshots: normalizeExpectedSnapshots(rawPayload.expectedSnapshots, patches),
    };
}

function normalizeExpectedSnapshots(
    value: unknown,
    patches: ApplyComponentStylePatchItem[],
): ExpectedComponentStyleSnapshot[] | undefined {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.length === 0)
        throw new FrontendEffectClientError("invalid_payload", "expectedSnapshots 必须是非空数组", {
            fieldPath: "expectedSnapshots", actualValue: value,
            ...(Array.isArray(value) ? {actualCount: value.length} : {}),
            expectedValue: {type: "array", minItems: 1},
        });
    const snapshots = value.map((snapshot, index) => {
        if (!isRecord(snapshot) || typeof snapshot.componentId !== "string" || !snapshot.componentId.trim()
            || typeof snapshot.componentType !== "string" || !snapshot.componentType.trim()
            || !Object.prototype.hasOwnProperty.call(snapshot, "style")) {
            throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}] 必须提供 componentId、componentType 和 style`, {
                fieldPath: `expectedSnapshots[${index}]`, actualValue: snapshot,
                expectedValue: {componentId: "non-empty string", componentType: "non-empty string", style: "snapshot"},
            });
        }
        return {
            componentId: snapshot.componentId.trim(),
            componentType: snapshot.componentType.trim(),
            style: cloneDeep(snapshot.style),
        };
    });
    const targetIds = new Set(patches.map((patch) => patch.componentId));
    const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.componentId));
    if (snapshots.length !== snapshotIds.size || snapshotIds.size !== targetIds.size
        || [...snapshotIds].some((componentId) => !targetIds.has(componentId))) {
        throw new FrontendEffectClientError("invalid_payload", "expectedSnapshots 的 componentId 必须与补丁目标唯一且一一对应", {
            fieldPath: "expectedSnapshots[].componentId",
            actualValue: {patchComponentIds: patches.map((patch) => patch.componentId), snapshotComponentIds: snapshots.map((snapshot) => snapshot.componentId)},
            expectedValue: "每个补丁目标对应且仅对应一个同 componentId 的基线",
        });
    }
    return snapshots;
}

/** 校验统一样式补丁协议，不兼容旧的扁平格式。 */
function normalizeStylePatch(value: unknown, index: number): ComponentStylePatch {
    if (!isRecord(value))
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].stylePatch 必须是对象`, {
            fieldPath: `patches[${index}].stylePatch`, actualValue: value, expectedValue: "object",
        });
    const rootKeys = Object.keys(value);
    if (rootKeys.length !== 1 || rootKeys[0] !== "style")
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].stylePatch 顶层只能包含 style`, {
            fieldPath: `patches[${index}].stylePatch`, actualValue: rootKeys, expectedValue: ["style"],
        });
    if (!isRecord(value.style) || Object.keys(value.style).length === 0)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].stylePatch.style 必须是非空对象`, {
            fieldPath: `patches[${index}].stylePatch.style`, actualValue: value.style, expectedValue: "non-empty object",
        });
    return {style: value.style};
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

