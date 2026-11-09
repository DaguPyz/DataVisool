/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep} from "lodash";
import {
  type DataSourceType,
  getDataSourceStrategy,
  getDataSourceStrategyList,
  inferDataSourceType,
} from "@/util/DataSourceConfigUtil.ts";

/** AI 数据源字段允许的基础值类型。 */
export type DataSourceAiFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "any";

/** 单个 AI 可写数据源字段规则。 */
export interface DataSourceAiFieldRule {
  /** 字段名，作用于对应数据源分支对象下。 */
  name: string;
  /** 字段允许的数据类型。 */
  type: DataSourceAiFieldType;
  /** 可选枚举值，存在时 AI 只能从这些值中选择。 */
  enumValues?: unknown[];
}

/** 敏感字段脱敏后的状态描述，不包含真实值。 */
export interface SensitiveFieldState {
  /** 固定为 true，表示真实值已被本地隐藏。 */
  redacted: true;
  /** 原配置中是否存在该敏感字段值。 */
  exists: boolean;
  /** 缺少该字段时，是否需要用户手动补充。 */
  requiresUserInput?: boolean;
}

/** 组件 data 转换成 AI 安全上下文后的结果。 */
export interface SafeDataShapeResult {
  /** 给 AI 使用的安全数据源上下文。 */
  dataShape: Record<string, unknown>;
  /** 当前组件最终 value 的压缩样例。 */
  valueShape: unknown;
  /** 本次脱敏发现的敏感字段状态。 */
  sensitiveFields: Record<string, SensitiveFieldState>;
}

/** 应用 dataPatch 前发现的用户补充信息需求。 */
export interface DataPatchUserInputRequirement {
  /** 是否必须由用户补充后才能应用补丁。 */
  required: boolean;
  /** 缺失字段路径。 */
  path?: string;
  /** 给前端或用户展示的提示信息。 */
  message?: string;
}

/** 当前系统支持的数据源分支字段名列表。 */
const SOURCE_BRANCH_KEYS = getDataSourceStrategyList().map(
  (strategy) => strategy.branchKey
);

/** 各数据源允许 AI 写入的字段白名单和类型规则。 */
const FIELD_RULES: Record<DataSourceType, DataSourceAiFieldRule[]> = {
  static: [{name: "value", type: "any"}],
  api: [
    {name: "url", type: "string"},
    {name: "method", type: "string", enumValues: ["get", "post", "put", "delete"]},
    {name: "headers", type: "object"},
    {name: "params", type: "object"},
    {name: "autoFlush", type: "boolean"},
    {name: "frequency", type: "number"},
  ],
  commonApi: [
    {name: "commonApiId", type: "string"},
    {name: "autoFlush", type: "boolean"},
    {name: "frequency", type: "number"},
  ],
  database: [
    {name: "targetDb", type: "string"},
    {name: "sql", type: "string"},
    {name: "autoFlush", type: "boolean"},
    {name: "frequency", type: "number"},
  ],
  globalVariable: [{name: "gvId", type: "string"}],
  webSocket: [
    {name: "url", type: "string"},
    {name: "protocols", type: "string"},
  ],
  mqtt: [
    {name: "host", type: "string"},
    {name: "port", type: "number"},
    {name: "path", type: "string"},
    {name: "clientId", type: "string"},
    {name: "username", type: "string"},
    {name: "topics", type: "string"},
    {name: "qos", type: "number", enumValues: [0, 1, 2]},
    {name: "connectTimeout", type: "number"},
    {name: "keepalive", type: "number"},
    {name: "clean", type: "boolean"},
    {name: "reconnectPeriod", type: "number"},
    {name: "protocolVersion", type: "number"},
  ],
};

/** 切换到指定数据源时，可能需要用户在本地补充的字段。 */
const USER_INPUT_FIELDS: Record<DataSourceType, string[]> = {
  static: [],
  api: [],
  commonApi: ["commonApi.commonApiId"],
  database: ["database.targetDb"],
  globalVariable: ["globalVariable.gvId"],
  webSocket: [],
  mqtt: ["mqtt.password"],
};

/** 读取指定数据源的 AI 可写字段规则。 */
export const getDataSourceAiFieldRules = (
  sourceType: DataSourceType
): DataSourceAiFieldRule[] => {
  return FIELD_RULES[sourceType] ?? FIELD_RULES.static;
};

/** 获取全部数据源分支字段名。 */
export const getDataSourceBranchKeys = (): string[] => [...SOURCE_BRANCH_KEYS];

/** 将真实 data 配置转换成可提供给 AI 的安全数据上下文。 */
export const buildSafeDataShape = (
  data: unknown,
  minimizeValue: (value: unknown, path: string) => unknown
): SafeDataShapeResult => {
  const dataObject = isRecord(data) ? data : {};
  const sourceType = inferDataSourceType(dataObject, null);
  const branchKey = getDataSourceStrategy(sourceType).branchKey;
  const branch = isRecord(dataObject[branchKey]) ? dataObject[branchKey] : {};
  const sensitiveFields: Record<string, SensitiveFieldState> = {};
  const safeBranch = redactSensitiveValue(branch, branchKey, sensitiveFields);
  const minimizedValue = Object.prototype.hasOwnProperty.call(dataObject, "value")
    ? minimizeValue(dataObject.value, "data.value")
    : null;
  const valueShape = redactSensitiveValue(
    minimizedValue,
    "data.value",
    sensitiveFields
  );

  markMissingUserInputFields(sourceType, safeBranch, branchKey, sensitiveFields);

  return {
    dataShape: {
      sourceType,
      dataSource: {
        [branchKey]: safeBranch,
      },
      valueShape,
    },
    valueShape,
    sensitiveFields,
  };
};

/** 在 AI 输出的 dataPatch 中查找不允许出现的敏感字段或敏感 query。 */
export const findSensitiveFieldInPatch = (
  patch: Record<string, unknown>
): string | null => {
  return findSensitiveFieldInValue(patch, "");
};

/** 在 AI 输出的 dataPatch 中查找函数、表达式和非法字面值。 */
export const findInvalidExpressionInPatch = (
  patch: Record<string, unknown>
): string | null => {
  return findInvalidExpressionInValue(patch, "");
};

/** 判断补丁应用前是否需要用户补充认证、ID 等本地信息。 */
export const getDataPatchUserInputRequirement = (
  currentData: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): DataPatchUserInputRequirement => {
  const sourceType = inferDataSourceType(patch, currentData ?? null);
  const branchKey = getDataSourceStrategy(sourceType).branchKey;
  const branchPatch = isRecord(patch[branchKey]) ? patch[branchKey] : {};
  const currentBranch = isRecord(currentData?.[branchKey])
    ? currentData?.[branchKey] as Record<string, unknown>
    : {};
  const mergedBranch = {...currentBranch, ...branchPatch};

  if (sourceType === "mqtt" && hasText(mergedBranch.username)) {
    if (!hasText(mergedBranch.password)) {
      return {
        required: true,
        path: "mqtt.password",
        message: "MQTT 用户名已配置，但缺少密码，需要用户补充",
      };
    }
  }

  for (const path of USER_INPUT_FIELDS[sourceType]) {
    if (path === "mqtt.password") {
      continue;
    }
    const value = readPath({...(currentData ?? {}), [branchKey]: mergedBranch}, path);
    if (!hasText(value)) {
      return {
        required: true,
        path,
        message: `缺少 ${path}，需要用户补充`,
      };
    }
  }

  return {required: false};
};

/** 递归脱敏对象或数组中的敏感字段，并记录脱敏状态。 */
function redactSensitiveValue(
  value: unknown,
  path: string,
  sensitiveFields: Record<string, SensitiveFieldState>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      redactSensitiveValue(item, `${path}[${index}]`, sensitiveFields)
    );
  }
  if (!isRecord(value)) {
    if (typeof value === "string" && hasSensitiveQuery(value)) {
      sensitiveFields[`${path}?query`] = {redacted: true, exists: true};
      return redactSensitiveQuery(value);
    }
    return cloneDeep(value);
  }

  const result: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, child]) => {
    const childPath = joinPath(path, key);
    if (isSensitiveKey(key)) {
      sensitiveFields[childPath] = {
        redacted: true,
        exists: child !== undefined && child !== null && child !== "",
      };
      result[key] = sensitiveFields[childPath];
      return;
    }
    result[key] = redactSensitiveValue(child, childPath, sensitiveFields);
  });
  return result;
}

/** 标记当前数据源缺少、但运行时可能需要用户补充的敏感字段。 */
function markMissingUserInputFields(
  sourceType: DataSourceType,
  safeBranch: unknown,
  branchKey: string,
  sensitiveFields: Record<string, SensitiveFieldState>
): void {
  if (sourceType !== "mqtt" || !isRecord(safeBranch) || !hasText(safeBranch.username)) {
    return;
  }
  const path = `${branchKey}.password`;
  if (!sensitiveFields[path]) {
    sensitiveFields[path] = {
      redacted: true,
      exists: false,
      requiresUserInput: true,
    };
    safeBranch.password = sensitiveFields[path];
  }
}

/** 递归查找补丁中不允许由 AI 写入的敏感字段。 */
function findSensitiveFieldInValue(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const hit = findSensitiveFieldInValue(value[index], `${path}[${index}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (!isRecord(value)) {
    if (typeof value === "string" && hasSensitiveQuery(value)) {
      return path ? `${path}?query` : "query";
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = joinPath(path, key);
    if (isSensitiveKey(key)) {
      return childPath;
    }
    const hit = findSensitiveFieldInValue(child, childPath);
    if (hit) return hit;
  }
  return null;
}

/** 递归查找补丁中的函数、表达式和非法字面值。 */
function findInvalidExpressionInValue(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const hit = findInvalidExpressionInValue(value[index], `${path}[${index}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const hit = findInvalidExpressionInValue(child, joinPath(path, key));
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (
    trimmed === "undefined" ||
    trimmed === "NaN" ||
    trimmed === "Infinity" ||
    trimmed.startsWith("function ") ||
    trimmed.startsWith("async function ") ||
    trimmed.includes("=>") ||
    trimmed.includes("${") ||
    trimmed.includes("#{")
  ) {
    return path || "value";
  }
  return null;
}

/** 判断字段名是否命中敏感信息规则。 */
function isSensitiveKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return (
    normalized.includes("password") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("credential") ||
    normalized === "key" ||
    normalized.endsWith("key") ||
    normalized.includes("-key") ||
    normalized.includes("_key")
  );
}

/** 判断 URL 字符串中是否带有疑似认证用途的 query 参数。 */
function hasSensitiveQuery(value: string): boolean {
  const queryStart = value.indexOf("?");
  if (queryStart < 0) {
    return false;
  }
  const query = value.slice(queryStart + 1).split("#")[0];
  return query
    .split("&")
    .map((part) => part.split("=")[0] ?? "")
    .some((key) => isSensitiveKey(decodeURIComponentSafe(key)));
}

/** 将 URL 中疑似敏感的 query 参数值替换为占位符。 */
function redactSensitiveQuery(value: string): string {
  const [beforeHash, hash = ""] = value.split("#", 2);
  const queryStart = beforeHash.indexOf("?");
  if (queryStart < 0) {
    return value;
  }
  const base = beforeHash.slice(0, queryStart);
  const query = beforeHash.slice(queryStart + 1);
  const redactedQuery = query
    .split("&")
    .map((part) => {
      const [rawKey, ...rest] = part.split("=");
      if (!isSensitiveKey(decodeURIComponentSafe(rawKey))) {
        return part;
      }
      return `${rawKey}=${rest.length > 0 ? "[REDACTED]" : ""}`;
    })
    .join("&");
  return `${base}?${redactedQuery}${hash ? `#${hash}` : ""}`;
}

/** 安全执行 URL decode，避免非法转义导致脱敏流程中断。 */
function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 按点分路径读取对象字段。 */
function readPath(object: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!isRecord(acc)) {
      return undefined;
    }
    return acc[key];
  }, object);
}

/** 拼接点分路径。 */
function joinPath(parentPath: string, key: string): string {
  return parentPath ? `${parentPath}.${key}` : key;
}

/** 判断值是否为非空字符串。 */
function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** 判断未知值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
