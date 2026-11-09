/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {FrontendEffectClientError} from "@/frontend-effect/FrontendEffectClientError.ts";
import {toSerializableSnapshot} from "@/frontend-effect/SerializableSnapshot.ts";
import {aiDrivenDevWarn} from "@/designer/ai-driven/AiDrivenDevLogger.ts";

export const SNAPSHOT_FIELDS = ["layer", "config", "base", "style", "data", "filter"] as const;

/** 组件快照可读取字段。 */
type ComponentSnapshotField = typeof SNAPSHOT_FIELDS[number];

/** 组件配置子字段。 */
type ComponentConfigField = Exclude<ComponentSnapshotField, "layer" | "config">;

/**
 * 组件快照查询请求。
 */
interface GetComponentSnapshotsPayload {
    /** 需要读取快照的组件 id 列表。 */
    componentIds?: string[];
    /** 需要返回的字段列表。 */
    fields: ComponentSnapshotField[];
    /** 是否从当前页面完整组件清单中分页读取。 */
    allPage?: boolean;
    /** 全页面读取起始位置。 */
    offset?: number;
    /** 全页面单页数量，上限 100。 */
    limit?: number;
}

/**
 * 单个组件快照。
 */
interface ComponentSnapshot {
    /** 组件 id。 */
    id: string;
    /** 组件类型。 */
    type?: string;
    /** 组件名称。 */
    name?: string;
    /** 图层快照。 */
    layer?: unknown;
    /** 完整组件配置。 */
    config?: unknown;
    /** 组件 base 配置。 */
    base?: unknown;
    /** 组件 style 配置。 */
    style?: unknown;
    /** 组件 data 配置。 */
    data?: unknown;
    /** 组件 filter 配置。 */
    filter?: unknown;
}

/**
 * 组件快照查询结果。
 */
interface GetComponentSnapshotsResult {
    /** 成功读取到的组件快照列表。 */
    components: ComponentSnapshot[];
    /** 当前画布中未找到的组件 id 列表。 */
    missingComponentIds: string[];
    /** 全页面读取时的组件总数。 */
    totalComponents?: number;
    /** 当前页之后是否还有组件。 */
    hasMore?: boolean;
    /** 当前页起始位置。 */
    offset?: number;
}

/**
 * 画布图层管理器最小读取接口。
 */
interface LayerManagerSnapshotReader {
    /** 图层配置映射。 */
    layerConfigs?: Record<string, Record<string, unknown> | undefined>;
    /** 组件配置缓存映射。 */
    elemConfigs?: Record<string, unknown> | null;
    /** 组件控制器映射。 */
    controllers?: Record<string, { getConfig?: () => unknown } | undefined>;
}

/**
 * 执行组件快照查询工具。
 */
export function runGetComponentSnapshotsTool(payload: unknown): GetComponentSnapshotsResult {
    const layerManager = window.DATAVISOOL_ENV?.currentManager?.layerManager as unknown as LayerManagerSnapshotReader | undefined;
    const {componentIds, fields, allPage, offset, totalComponents} = normalizePayload(payload, layerManager);
    const components: ComponentSnapshot[] = [];
    const missingComponentIds: string[] = [];

    componentIds.forEach((componentId) => {
        const layer = layerManager?.layerConfigs?.[componentId];
        if (!layer) {
            missingComponentIds.push(componentId);
            return;
        }

        components.push(buildComponentSnapshot(componentId, layerManager, layer, fields));
    });

    if (!allPage)
        return {components, missingComponentIds};
    return {
        components,
        missingComponentIds,
        totalComponents,
        hasMore: offset + componentIds.length < totalComponents,
        offset,
    };
}

/**
 * 构造单个组件快照。
 */
function buildComponentSnapshot(
    componentId: string,
    layerManager: LayerManagerSnapshotReader | undefined,
    layer: Record<string, unknown>,
    fields: ComponentSnapshotField[],
): ComponentSnapshot {
    const snapshot: ComponentSnapshot = {id: componentId};
    const type = textOrUndefined(layer.type);
    const name = textOrUndefined(layer.name);
    if (type)
        snapshot.type = type;
    if (name)
        snapshot.name = name;

    const needsConfig = fields.some((field) => field !== "layer");
    const config = needsConfig ? readComponentConfig(layerManager, componentId) : undefined;
    fields.forEach((field) => {
        if (field === "layer") {
            snapshot.layer = toSerializableSnapshot(layer);
            return;
        }
        if (field === "config") {
            snapshot.config = toSerializableSnapshot(config ?? null);
            return;
        }
        snapshot[field] = toSerializableSnapshot(readConfigField(config, field));
    });

    return snapshot;
}

/**
 * 优先读取 controller 最新配置，失败时回退到 layerManager.elemConfigs。
 */
function readComponentConfig(
    layerManager: LayerManagerSnapshotReader | undefined,
    componentId: string,
): unknown {
    try {
        const controllerConfig = layerManager?.controllers?.[componentId]?.getConfig?.();
        if (controllerConfig != null)
            return controllerConfig;
    } catch (error) {
        aiDrivenDevWarn("Component snapshot config read failed:", error);
    }
    return layerManager?.elemConfigs?.[componentId];
}

/**
 * 读取组件配置下的单个子字段。
 */
function readConfigField(config: unknown, field: ComponentConfigField): unknown {
    if (!isRecord(config))
        return null;
    return config[field] ?? null;
}

/**
 * 归一化并校验工具入参。
 */
function normalizePayload(
    payload: unknown,
    layerManager: LayerManagerSnapshotReader | undefined,
): GetComponentSnapshotsPayload & {componentIds: string[]; allPage: boolean; offset: number; totalComponents: number} {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new FrontendEffectClientError("invalid_payload", "组件快照查询入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });
    }

    const rawPayload = payload as GetComponentSnapshotsPayload;
    const fields = normalizeFields(rawPayload.fields);
    const allPage = rawPayload.allPage === true;
    if (!allPage) {
        const componentIds = normalizeComponentIds(rawPayload.componentIds);
        return {componentIds, fields, allPage, offset: 0, totalComponents: componentIds.length};
    }
    const offset = integerInRange(rawPayload.offset, 0, Number.MAX_SAFE_INTEGER, 0, "offset");
    const limit = integerInRange(rawPayload.limit, 1, 100, 50, "limit");
    const allComponentIds = Object.entries(layerManager?.layerConfigs ?? {})
        .filter(([, layer]) => !!layer)
        .sort((left, right) => layerOrder(left[1]) - layerOrder(right[1]) || left[0].localeCompare(right[0]))
        .map(([componentId]) => componentId);
    return {
        componentIds: allComponentIds.slice(offset, offset + limit),
        fields,
        allPage,
        offset,
        limit,
        totalComponents: allComponentIds.length,
    };
}

function integerInRange(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
    field: string,
): number {
    if (value === undefined)
        return fallback;
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
        throw new FrontendEffectClientError("invalid_payload", `${field} 超出允许范围 ${min}–${max}`, {
            fieldPath: field,
            actualValue: value,
            expectedValue: {type: "integer", minimum: min, maximum: max},
        });
    return value as number;
}

function layerOrder(layer: Record<string, unknown> | undefined): number {
    return typeof layer?.order === "number" && Number.isFinite(layer.order) ? layer.order : Number.MAX_SAFE_INTEGER;
}

/**
 * 归一化组件 id 列表。
 */
function normalizeComponentIds(componentIds: unknown): string[] {
    if (!Array.isArray(componentIds)) {
        throw new FrontendEffectClientError("invalid_payload", "componentIds 必须是数组", {
            fieldPath: "componentIds", actualValue: componentIds, expectedValue: "string[]",
        });
    }

    // 去重并清理空 id，避免重复读取同一个组件。
    const normalized = [...new Set(componentIds
        .map((componentId) => typeof componentId === "string" ? componentId.trim() : "")
        .filter(Boolean))];
    if (normalized.length === 0) {
        throw new FrontendEffectClientError("invalid_payload", "componentIds 不能为空", {
            fieldPath: "componentIds", actualValue: componentIds, expectedValue: "至少 1 个非空组件 id",
        });
    }
    return normalized;
}

/**
 * 归一化快照字段列表。
 */
function normalizeFields(fields: unknown): ComponentSnapshotField[] {
    if (!Array.isArray(fields)) {
        throw new FrontendEffectClientError("invalid_payload", snapshotFieldsHelp(), {
            fieldPath: "fields", actualValue: fields, allowedValues: SNAPSHOT_FIELDS,
        });
    }

    const normalized: ComponentSnapshotField[] = [];
    fields.forEach((field, index) => {
        const value = typeof field === "string" ? field.trim() : "";
        if (!isSnapshotField(value)) {
            throw new FrontendEffectClientError(
                "invalid_payload",
                `fields 包含不支持的字段：${value || "unknown"}。${snapshotFieldsHelp()}`,
                {fieldPath: `fields[${index}]`, actualValue: field, allowedValues: SNAPSHOT_FIELDS},
            );
        }
        if (!normalized.includes(value))
            normalized.push(value);
    });
    if (normalized.length === 0) {
        throw new FrontendEffectClientError("invalid_payload", snapshotFieldsHelp(), {
            fieldPath: "fields", actualValue: normalized, allowedValues: SNAPSHOT_FIELDS,
        });
    }
    return normalized;
}

function snapshotFieldsHelp(): string {
    return `fields 必须是非空数组，仅允许 ${SNAPSHOT_FIELDS.join("、")}；id/type/name 自动返回。示例：fields=["layer"]`;
}

/**
 * 判断字段是否是支持的组件快照字段。
 */
function isSnapshotField(value: string): value is ComponentSnapshotField {
    return (SNAPSHOT_FIELDS as readonly string[]).includes(value);
}

/**
 * 判断未知值是否是普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * 将未知值转换为可选文本。
 */
function textOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
}
