/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep} from "lodash";
import {FrontendEffectClientError} from "@/frontend-effect/FrontendEffectClientError.ts";
import {aiDrivenDevWarn} from "@/designer/ai-driven/AiDrivenDevLogger.ts";
import {buildSafeDataShape} from "@/util/DataSourceAiPolicy.ts";
import {
    buildDataSourceRuntimeContract,
    COMPONENT_DATA_CONTRACT_VERSION,
    COMPONENT_DATA_FIELD_MAPPING_KEYS,
    isSupportedDataSourceType,
    validateDataConfigContract,
} from "@/util/DataSourceContractUtil.ts";
import {getDataSourceStrategyList, type DataSourceType} from "@/util/DataSourceConfigUtil.ts";
import {getLoadedComponentDocumentIdentity} from "@/frontend-effect/component-docs/ComponentDocumentVersions.ts";

interface LayerManagerDataContractReader {
    layerConfigs?: Record<string, Record<string, unknown> | undefined>;
    controllers?: Record<string, {getConfig?: () => unknown} | undefined>;
}

const DATA_EXAMPLE_ARRAY_LIMIT = 3;
/** 返回目标组件的单数据源契约、专属数据说明和当前样例。 */
export function runGetComponentDataContractTool(payload: unknown) {
    const {componentIds, sourceType} = normalizePayload(payload);
    const layerManager = window.DATAVISOOL_ENV?.currentManager?.layerManager as unknown as LayerManagerDataContractReader | undefined;
    const components: Record<string, unknown>[] = [];
    const missingComponentIds: string[] = [];

    componentIds.forEach((componentId) => {
        const layer = layerManager?.layerConfigs?.[componentId];
        if (!layer) {
            missingComponentIds.push(componentId);
            return;
        }
        const config = readComponentConfig(layerManager, componentId);
        const configObject = isRecord(config) ? config : {};
        const base = isRecord(configObject.base) ? configObject.base : {};
        const componentType = text(base.type) || text(layer.type);
        const componentName = text(base.name) || text(layer.name) || undefined;
        const warnings: string[] = [];
        const example = buildCurrentDataExample(configObject, warnings);
        const validation = validateDataConfigContract(configObject.data);

        components.push({
            componentId,
            componentType,
            componentName,
            documentIdentity: getLoadedComponentDocumentIdentity(componentType),
            currentData: {
                sourceType: validation.sourceType,
                valueExample: example.valueShape,
                validation,
                sensitiveFields: example.sensitiveFields,
            },
            fieldMapping: example.fieldMapping,
            recommendedPatch: buildDataSourceRuntimeContract(sourceType).examplePatch,
            warnings: [...new Set(warnings)],
        });
    });

    return {
        schemaVersion: COMPONENT_DATA_CONTRACT_VERSION,
        sourceContract: buildDataSourceRuntimeContract(sourceType),
        components,
        missingComponentIds,
    };
}

function buildCurrentDataExample(config: Record<string, any>, warnings: string[]) {
    if (config.data == null)
        warnings.push("current_data_missing");
    const safeData = buildSafeDataShape(
        config.data,
        (value, path) => minimizeDataValue(value, path, warnings),
    );
    return {
        valueShape: safeData.valueShape,
        sensitiveFields: safeData.sensitiveFields,
        fieldMapping: buildFieldMapping(isRecord(config.style) ? config.style : null, warnings),
    };
}

function minimizeDataValue(value: unknown, path: string, warnings: string[]): unknown {
    if (Array.isArray(value))
        return selectRepresentativeArrayItems(value, path, warnings)
            .map((item, index) => minimizeDataValue(item, `${path}[${index}]`, warnings));
    if (!isRecord(value))
        return cloneDeep(value);
    return Object.fromEntries(Object.entries(value)
        .map(([key, child]) => [key, minimizeDataValue(child, `${path}.${key}`, warnings)]));
}

function selectRepresentativeArrayItems(items: unknown[], path: string, warnings: string[]): unknown[] {
    if (items.length === 0) {
        warnings.push(`${path}_empty_array`);
        return [];
    }
    if (new Set(items.map(valueKind)).size > 1)
        warnings.push(`${path}_array_item_type_inconsistent`);
    const objectItems = items
        .map((item, index) => ({item, index}))
        .filter((entry): entry is {item: Record<string, unknown>; index: number} => isRecord(entry.item));
    if (objectItems.length !== items.length)
        return items.slice(0, DATA_EXAMPLE_ARRAY_LIMIT);
    if (new Set(objectItems.map(({item}) => Object.keys(item).sort().join("\u0000"))).size > 1)
        warnings.push(`${path}_object_array_fields_inconsistent`);
    return objectItems
        .map(({item, index}) => ({item, index, score: Object.keys(item).length}))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, DATA_EXAMPLE_ARRAY_LIMIT)
        .sort((left, right) => left.index - right.index)
        .map(({item}) => item);
}

function buildFieldMapping(style: Record<string, unknown> | null, warnings: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    if (!style)
        return mapping;
    COMPONENT_DATA_FIELD_MAPPING_KEYS.forEach((key) => {
        const value = style[key];
        if (typeof value === "string" && value.trim())
            mapping[key] = value.trim();
        else if (Array.isArray(value))
            warnings.push(`${key}_array_mapping_unsupported`);
    });
    return mapping;
}

function normalizePayload(payload: unknown): {componentIds: string[]; sourceType: DataSourceType} {
    if (!isRecord(payload))
        throw new FrontendEffectClientError("invalid_payload", "组件数据说明书查询入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });
    if (!Array.isArray(payload.componentIds))
        throw new FrontendEffectClientError("invalid_payload", "componentIds 必须是数组", {
            fieldPath: "componentIds", actualValue: payload.componentIds, expectedValue: "string[]",
        });
    const componentIds = [...new Set(payload.componentIds
        .map((componentId) => text(componentId))
        .filter(Boolean))];
    if (componentIds.length === 0 || componentIds.length > 4)
        throw new FrontendEffectClientError("invalid_payload", "componentIds 数量必须在 1–4", {
            fieldPath: "componentIds", actualValue: payload.componentIds, actualCount: componentIds.length,
            expectedValue: {type: "array", minItems: 1, maxItems: 4},
        });
    const sourceType = payload.sourceType ?? "static";
    if (!isSupportedDataSourceType(sourceType))
        throw new FrontendEffectClientError("invalid_payload", `sourceType 不受支持：${String(sourceType)}`, {
            fieldPath: "sourceType", actualValue: sourceType,
            allowedValues: getDataSourceStrategyList().map((item) => item.sourceType),
        });
    return {componentIds, sourceType};
}

function readComponentConfig(
    layerManager: LayerManagerDataContractReader | undefined,
    componentId: string,
): unknown {
    try {
        const controllerConfig = layerManager?.controllers?.[componentId]?.getConfig?.();
        if (controllerConfig != null)
            return controllerConfig;
    } catch (error) {
        aiDrivenDevWarn("Component data contract config read failed:", error);
    }
    return undefined;
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueKind(value: unknown): string {
    if (Array.isArray(value))
        return "array";
    if (value === null)
        return "null";
    return typeof value;
}
