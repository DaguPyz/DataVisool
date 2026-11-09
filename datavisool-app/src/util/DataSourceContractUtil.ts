/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep} from "lodash";
import {
    getDataSourceAiFieldRules,
    type DataSourceAiFieldRule,
} from "@/util/DataSourceAiPolicy.ts";
import {
    getDataSourceStrategy,
    getDataSourceStrategyList,
    type DataSourceType,
} from "@/util/DataSourceConfigUtil.ts";

export const COMPONENT_DATA_CONTRACT_VERSION = "component-data-contract/v1" as const;

export const COMPONENT_DATA_FIELD_MAPPING_KEYS = [
    "xField",
    "yField",
    "seriesField",
    "angleField",
    "colorField",
    "sizeField",
    "shapeField",
    "wordField",
    "weightField",
    "groupField",
] as const;

export interface DataSourceRuntimeContract {
    dataPath: "config.data";
    patchPath: "dataPatch";
    sourceType: DataSourceType;
    branch: string;
    structure: Record<string, unknown>;
    fieldRules: DataSourceAiFieldRule[];
    rules: string[];
    examplePatch: Record<string, unknown>;
}

export interface DataConfigContractIssue {
    code: string;
    message: string;
    path?: string;
}

export interface DataConfigContractValidation {
    valid: boolean;
    sourceType: DataSourceType | null;
    issues: DataConfigContractIssue[];
}

const SOURCE_TYPES = getDataSourceStrategyList().map((strategy) => strategy.sourceType);
const SOURCE_BRANCHES = getDataSourceStrategyList().map((strategy) => strategy.branchKey);

/** 判断未知值是否为系统支持的数据源类型。 */
export function isSupportedDataSourceType(value: unknown): value is DataSourceType {
    return typeof value === "string" && SOURCE_TYPES.includes(value as DataSourceType);
}

/** 返回 Agent 本次指定的单个数据源契约；未指定时只返回静态数据源。 */
export function buildDataSourceRuntimeContract(sourceType: DataSourceType = "static"): DataSourceRuntimeContract {
    const strategy = getDataSourceStrategy(sourceType);
    const fieldRules = cloneDeep(getDataSourceAiFieldRules(sourceType));
    return {
        dataPath: "config.data",
        patchPath: "dataPatch",
        sourceType,
        branch: strategy.branchKey,
        structure: buildStructure(sourceType, strategy.branchKey, fieldRules),
        fieldRules,
        rules: [
            "config.data 必须是普通对象",
            `dataPatch.sourceType 必须为 ${sourceType}`,
            `本次只能写入 ${strategy.branchKey} 分支`,
            sourceType === "static"
                ? "静态数据必须写入 staticData.value"
                : "动态数据源只写连接配置，运行结果由宿主同步到 value",
            ...userInputRules(sourceType),
        ],
        examplePatch: buildExamplePatch(sourceType),
    };
}

/**
 * 检查完整 config.data 的根结构和活动分支。
 * 当前样例即使无效也不抛错，便于说明书继续返回修复建议。
 */
export function validateDataConfigContract(data: unknown): DataConfigContractValidation {
    if (!isRecord(data)) {
        return invalid(null, {
            code: "component.data.invalid_root_type",
            message: `config.data 必须是普通对象，实际为 ${valueKind(data)}`,
            path: "config.data",
        });
    }

    if (!isSupportedDataSourceType(data.sourceType)) {
        return invalid(null, {
            code: "component.data.invalid_source_type",
            message: "config.data.sourceType 缺失或不受支持",
            path: "config.data.sourceType",
        });
    }

    const sourceType = data.sourceType;
    const branch = getDataSourceStrategy(sourceType).branchKey;
    const issues: DataConfigContractIssue[] = [];
    Object.keys(data).forEach((key) => {
        if (key !== "sourceType" && key !== "value"
            && !SOURCE_BRANCHES.includes(key as (typeof SOURCE_BRANCHES)[number])) {
            issues.push({
                code: "component.data.unexpected_field",
                message: `config.data 包含 DataConfigType 未定义的字段：${key}`,
                path: `config.data.${key}`,
            });
        }
    });
    if (!isRecord(data[branch])) {
        issues.push({
            code: "component.data.active_branch_missing",
            message: `sourceType=${sourceType} 时 ${branch} 必须是对象`,
            path: `config.data.${branch}`,
        });
    }
    SOURCE_BRANCHES.forEach((candidate) => {
        if (candidate !== branch && Object.prototype.hasOwnProperty.call(data, candidate)) {
            issues.push({
                code: "component.data.unexpected_branch",
                message: `sourceType=${sourceType} 时不能同时保留 ${candidate}`,
                path: `config.data.${candidate}`,
            });
        }
    });
    if (sourceType === "static" && isRecord(data.staticData)
        && !Object.prototype.hasOwnProperty.call(data.staticData, "value")) {
        issues.push({
            code: "component.data.static_value_missing",
            message: "静态数据缺少 staticData.value",
            path: "config.data.staticData.value",
        });
    }
    return {valid: issues.length === 0, sourceType, issues};
}

/** 使用完整运行时 value 校验图表字段映射，不能以截断样例代替。 */
export function validateComponentFieldMappings(
    style: unknown,
    value: unknown,
): DataConfigContractIssue[] {
    if (!isRecord(style))
        return [];
    const issues: DataConfigContractIssue[] = [];
    const mappings: Array<[string, string]> = [];
    COMPONENT_DATA_FIELD_MAPPING_KEYS.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(style, key))
            return;
        const dataKey = style[key];
        if (typeof dataKey !== "string" || !dataKey.trim()) {
            issues.push({
                code: "component.data.invalid_field_mapping",
                message: `${key} 必须是非空字符串`,
                path: `config.style.${key}`,
            });
            return;
        }
        mappings.push([key, dataKey.trim()]);
    });
    if (mappings.length === 0 || issues.length > 0)
        return issues;

    const items = Array.isArray(value) ? value : [value];
    if (items.length === 0)
        return issues;
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!isRecord(item)) {
            issues.push({
                code: "component.data.field_mapping_value_type_mismatch",
                message: "有字段映射的组件数据必须是对象或对象数组",
                path: "config.data.value",
            });
            break;
        }
        mappings.forEach(([mappingKey, dataKey]) => {
            if (!Object.prototype.hasOwnProperty.call(item, dataKey)) {
                issues.push({
                    code: "component.data.field_mapping_missing_property",
                    message: `第 ${index + 1} 项缺少 ${mappingKey} 指向的属性 ${dataKey}`,
                    path: `config.data.value[${index}].${dataKey}`,
                });
            }
        });
    }
    return issues;
}

function buildStructure(
    sourceType: DataSourceType,
    branch: string,
    fieldRules: DataSourceAiFieldRule[],
): Record<string, unknown> {
    const branchShape = Object.fromEntries(fieldRules.map((rule) => [rule.name, fieldTypeLabel(rule)]));
    if (sourceType === "static")
        branchShape.value = "由组件数据格式要求决定";
    return {sourceType, [branch]: branchShape};
}

function fieldTypeLabel(rule: DataSourceAiFieldRule): string {
    const type = rule.type === "any" ? "由组件数据格式要求决定" : rule.type;
    return rule.enumValues ? `${type}: ${rule.enumValues.join(" | ")}` : type;
}

function buildExamplePatch(sourceType: DataSourceType): Record<string, unknown> {
    switch (sourceType) {
        case "static":
            return {sourceType, staticData: {value: []}};
        case "api":
            return {sourceType, apiData: {url: "https://example.com/data", method: "get", headers: {}, params: {}, autoFlush: false}};
        case "commonApi":
            return {sourceType, commonApi: {commonApiId: "", autoFlush: false}};
        case "database":
            return {sourceType, database: {targetDb: "", sql: "select * from table_name", autoFlush: false}};
        case "globalVariable":
            return {sourceType, globalVariable: {gvId: ""}};
        case "webSocket":
            return {sourceType, webSocket: {url: "wss://example.com/data", protocols: ""}};
        case "mqtt":
            return {sourceType, mqtt: {host: "wss://example.com", port: 443, topics: "device/status", qos: 0}};
    }
}

function userInputRules(sourceType: DataSourceType): string[] {
    switch (sourceType) {
        case "commonApi":
            return ["commonApi.commonApiId 必须由用户选择，不能猜测"];
        case "database":
            return ["database.targetDb 必须由用户选择，不能猜测"];
        case "globalVariable":
            return ["globalVariable.gvId 必须由用户选择，不能猜测"];
        case "mqtt":
            return ["配置 MQTT 用户名时，密码必须由用户在本地补充，Agent 不得读取或写入密码"];
        default:
            return [];
    }
}

function invalid(sourceType: DataSourceType | null, issue: DataConfigContractIssue): DataConfigContractValidation {
    return {valid: false, sourceType, issues: [issue]};
}

function valueKind(value: unknown): string {
    if (Array.isArray(value))
        return "array";
    if (value === null)
        return "null";
    return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
