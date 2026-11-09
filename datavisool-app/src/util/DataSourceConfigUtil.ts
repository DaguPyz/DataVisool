/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import { cloneDeep } from "lodash";
import type {
  DataConfigType,
  IStaticData,
} from "@datavisool/sdk/types";
import {ObjectUtil} from "@datavisool/sdk";
import DataUtil from "@/util/DataUtil.ts";

export type DataSourceType = NonNullable<DataConfigType["sourceType"]>;

export interface DataSourceStrategyMeta {
  sourceType: DataSourceType;
  label: string;
  branchKey:
    | "staticData"
    | "apiData"
    | "commonApi"
    | "database"
    | "globalVariable"
    | "webSocket"
    | "mqtt";
  summary: string;
  editableFields: string[];
  promptTs: string;
}

const hasOwn = (value: Record<string, any>, key: string) => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const EXECUTABLE_PATCH_KEYS = new Set([
  "filter",
  "customCode",
  "customDataUpdateCode",
  "handler",
]);

const JSON_STRING_ONLY_PATCH_KEYS = new Set([
  "headers",
  "params",
]);

const FUNCTION_LIKE_STRING_PATTERN =
  /^\s*(?:async\s+)?function\b|^\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;

const isExecutablePatchValue = (value: unknown): boolean => {
  return (
    typeof value === "function" ||
    (typeof value === "string" && FUNCTION_LIKE_STRING_PATTERN.test(value))
  );
};

const isUnsafeDynamicStringValue = (key: string, value: unknown): boolean => {
  if (!JSON_STRING_ONLY_PATCH_KEYS.has(key) || typeof value !== "string") {
    return false;
  }
  const text = value.trim();
  if (!text) {
    return false;
  }
  try {
    JSON.parse(text);
    return false;
  } catch {
    return true;
  }
};

const DATA_SOURCE_STRATEGIES: Record<DataSourceType, DataSourceStrategyMeta> = {
  static: {
    sourceType: "static",
    label: "静态数据",
    branchKey: "staticData",
    summary: "适合测试数据、模拟列表、补齐字段和离线预览。",
    editableFields: ["value", "filter"],
    promptTs: `
export interface IStaticData {
    value: any;
    /**
     * filter 必须是一个名为 filter 的 JS 方法字符串，支持 async。
     * 允许形式：
     * async function filter(data) { ... }
     * function filter(data) { ... }
     * 不要使用箭头函数、匿名函数或省略函数名。
     */
    filter?: string;
}
`.trim(),
  },
  api: {
    sourceType: "api",
    label: "接口(API)",
    branchKey: "apiData",
    summary:
      "适合直接接入 REST 接口，通过 url / method / params / headers 获取动态数据。",
    editableFields: [
      "url",
      "method",
      "headers",
      "params",
      "autoFlush",
      "frequency",
      "filter",
    ],
    promptTs: `
export interface APIConfig {
    url?: string;
    method?: 'get' | 'post' | 'put' | 'delete';
    headers?: Record<string, string> | string | (() => Promise<Record<string, string>> | Record<string, string>);
    params?: Record<string, any> | string | (() => Promise<any> | any);
    autoFlush?: boolean;
    frequency?: number;
    /**
     * filter 必须是一个名为 filter 的 JS 方法字符串，支持 async。
     * 允许形式：
     * async function filter(data) { ... }
     * function filter(data) { ... }
     * 不要使用箭头函数、匿名函数或省略函数名。
     */
    filter?: string;
}
`.trim(),
  },
  commonApi: {
    sourceType: "commonApi",
    label: "公共API",
    branchKey: "commonApi",
    summary: "适合复用已维护的公共 API，通过 commonApiId 选择共享接口。",
    editableFields: ["commonApiId", "autoFlush", "frequency", "filter"],
    promptTs: `
export interface ICommonApi {
    commonApiId?: string;
    autoFlush?: boolean;
    frequency?: number;
    /**
     * filter 必须是一个名为 filter 的 JS 方法字符串，支持 async。
     * 允许形式：
     * async function filter(data) { ... }
     * function filter(data) { ... }
     * 不要使用箭头函数、匿名函数或省略函数名。
     */
    filter?: string;
}
`.trim(),
  },
  database: {
    sourceType: "database",
    label: "数据库",
    branchKey: "database",
    summary: "适合通过 SQL 从数据库读取结构化数据。",
    editableFields: ["targetDb", "sql", "autoFlush", "frequency", "filter"],
    promptTs: `
export interface IDatabase {
    runtimeDataSourceId?: string;
    targetDb?: string;
    sql?: string;
    autoFlush?: boolean;
    frequency?: number;
    /**
     * filter 必须是一个名为 filter 的 JS 方法字符串，支持 async。
     * 允许形式：
     * async function filter(data) { ... }
     * function filter(data) { ... }
     * 不要使用箭头函数、匿名函数或省略函数名。
     */
    filter?: string;
}
`.trim(),
  },
  globalVariable: {
    sourceType: "globalVariable",
    label: "全局变量",
    branchKey: "globalVariable",
    summary: "适合直接绑定项目内已有全局变量。",
    editableFields: ["gvId", "filter"],
    promptTs: `
export interface IGlobalVariableDataConfigType {
    gvId?: string;
    /**
     * filter 必须是一个名为 filter 的 JS 方法字符串，支持 async。
     * 允许形式：
     * async function filter(data) { ... }
     * function filter(data) { ... }
     * 不要使用箭头函数、匿名函数或省略函数名。
     */
    filter?: string;
}
`.trim(),
  },
  webSocket: {
    sourceType: "webSocket",
    label: "WebSocket",
    branchKey: "webSocket",
    summary: "适合接入实时推送数据源。",
    editableFields: ["url", "protocols", "filter"],
    promptTs: `
export interface IWebSocketConfig {
    url?: string;
    protocols?: string;
    /**
     * filter 必须是一个名为 filter 的 JS 方法字符串，支持 async。
     * 允许形式：
     * async function filter(data) { ... }
     * function filter(data) { ... }
     * 不要使用箭头函数、匿名函数或省略函数名。
     */
    filter?: string;
}
`.trim(),
  },
  mqtt: {
    sourceType: "mqtt",
    label: "MQTT",
    branchKey: "mqtt",
    summary: "适合接入物联网消息、主题订阅和实时广播数据。",
    editableFields: [
      "host",
      "port",
      "path",
      "clientId",
      "username",
      "password",
      "topics",
      "qos",
      "connectTimeout",
      "keepalive",
      "clean",
      "reconnectPeriod",
      "protocolVersion",
      "filter",
    ],
    promptTs: `
export interface IMQTTConfig {
    host?: string;
    port?: number;
    topics?: string;
    /**
     * filter 必须是一个名为 filter 的 JS 方法字符串，支持 async。
     * 允许形式：
     * async function filter(data) { ... }
     * function filter(data) { ... }
     * 不要使用箭头函数、匿名函数或省略函数名。
     */
    filter?: string;
    path?: string;
    clientId?: string;
    username?: string;
    password?: string;
    qos?: 0 | 1 | 2;
    connectTimeout?: number;
    keepalive?: number;
    clean?: boolean;
    reconnectPeriod?: number;
    protocolVersion?: number;
}
`.trim(),
  },
};

const SOURCE_TYPE_ORDER: DataSourceType[] = [
  "static",
  "api",
  "commonApi",
  "database",
  "globalVariable",
  "webSocket",
  "mqtt",
];

const SOURCE_TYPE_HINT_KEYS: Record<DataSourceType, string[]> = {
  static: ["staticData", "value"],
  api: [
    "apiData",
    "url",
    "method",
    "headers",
    "params",
    "autoFlush",
    "frequency",
  ],
  commonApi: ["commonApi", "commonApiId"],
  database: ["database", "targetDb", "sql"],
  globalVariable: ["globalVariable", "gvId"],
  webSocket: ["webSocket", "url", "protocols"],
  mqtt: ["mqtt", "host", "port", "topics", "path", "clientId"],
};

export const getDataSourceStrategy = (
  sourceType?: string | null
): DataSourceStrategyMeta => {
  if (sourceType && hasOwn(DATA_SOURCE_STRATEGIES, sourceType)) {
    return DATA_SOURCE_STRATEGIES[sourceType as DataSourceType];
  }
  return DATA_SOURCE_STRATEGIES.static;
};

export const getDataSourceStrategyList = (): DataSourceStrategyMeta[] => {
  return SOURCE_TYPE_ORDER.map(
    (sourceType) => DATA_SOURCE_STRATEGIES[sourceType]
  );
};

export const buildDataSourceStrategyCatalogText = (): string => {
  return getDataSourceStrategyList()
    .map(
      (strategy) =>
        `- ${strategy.sourceType}（${strategy.label}）：${
          strategy.summary
        } 可编辑字段：${strategy.editableFields.join("、")}`
    )
    .join("\n");
};

export const inferDataSourceType = (
  patch?: Record<string, any> | null,
  fallback?: Record<string, any> | null
): DataSourceType => {
  const patchSourceType = patch?.sourceType;
  if (
    typeof patchSourceType === "string" &&
    hasOwn(DATA_SOURCE_STRATEGIES, patchSourceType)
  ) {
    return patchSourceType as DataSourceType;
  }

  const dynamicOrder: DataSourceType[] = [
    "api",
    "commonApi",
    "database",
    "globalVariable",
    "webSocket",
    "mqtt",
  ];
  for (const sourceType of dynamicOrder) {
    const hints = SOURCE_TYPE_HINT_KEYS[sourceType];
    const hit =
      !!patch &&
      hints.some((key) => hasOwn(patch, key) || isPlainObject(patch[key]));
    if (hit) {
      return sourceType;
    }
  }

  const staticHints = SOURCE_TYPE_HINT_KEYS.static;
  const hasStaticHint =
    !!patch &&
    staticHints.some((key) => hasOwn(patch, key) || isPlainObject(patch[key]));
  if (hasStaticHint) {
    return "static";
  }

  const fallbackSourceType = fallback?.sourceType;
  if (
    typeof fallbackSourceType === "string" &&
    hasOwn(DATA_SOURCE_STRATEGIES, fallbackSourceType)
  ) {
    return fallbackSourceType as DataSourceType;
  }

  return "static";
};

export const sanitizeDataConfigPatch = (
  patch: unknown
): Record<string, any> => {
  if (!isPlainObject(patch)) {
    return {};
  }

  const blockedKeys = new Set([
    "dataPatch",
    "patch",
    "data",
    "summary",
    "reason",
    "componentPatches",
    "patches",
    "results",
    "targetId",
    "componentName",
    "componentType",
    "changedFields",
    "usage",
    "reply",
    "reasoningContent",
    "rawResponse",
    "prompt",
    "modelId",
    "provider",
    "baseUrl",
    "base",
    "style",
    "status",
    "layer",
    "children",
    "pid",
    "prev",
    "next",
    "childHeader",
    "childTail",
  ]);

  const sanitizeArray = (items: unknown[]): unknown[] => {
    return items.reduce<unknown[]>((acc, item) => {
      if (isExecutablePatchValue(item)) {
        return acc;
      }
      if (isPlainObject(item)) {
        acc.push(sanitizeDataConfigPatch(item));
        return acc;
      }
      if (Array.isArray(item)) {
        acc.push(sanitizeArray(item));
        return acc;
      }
      acc.push(cloneDeep(item));
      return acc;
    }, []);
  };

  return Object.entries(patch).reduce((acc, [key, value]) => {
    if (
      blockedKeys.has(key) ||
      EXECUTABLE_PATCH_KEYS.has(key) ||
      isExecutablePatchValue(value) ||
      isUnsafeDynamicStringValue(key, value)
    ) {
      return acc;
    }
    if (isPlainObject(value)) {
      acc[key] = sanitizeDataConfigPatch(value);
      return acc;
    }
    if (Array.isArray(value)) {
      acc[key] = sanitizeArray(value);
      return acc;
    }
    acc[key] = cloneDeep(value);
    return acc;
  }, {} as Record<string, any>);
};

const extractBranchPatch = (
  sourceType: DataSourceType,
  patch: Record<string, any>
) => {
  const strategy = getDataSourceStrategy(sourceType);
  const branchPatch = isPlainObject(patch[strategy.branchKey])
    ? cloneDeep(patch[strategy.branchKey])
    : {};

  strategy.editableFields.forEach((field) => {
    if (field === "value" && sourceType !== "static") {
      return;
    }
    if (field === "value" && sourceType === "static") {
      /**
       * 静态数据的 branch.value 必须优先保留编辑器里的原始值。
       * 顶层 patch.value 在保存链路里表示“测试结果”，不能覆盖 raw staticData.value。
       */
      if (!hasOwn(branchPatch, "value") && hasOwn(patch, "value")) {
        branchPatch.value = cloneDeep(patch.value);
      }
      return;
    }
    if (hasOwn(patch, field)) {
      branchPatch[field] = cloneDeep(patch[field]);
    }
  });

  return branchPatch;
};

const pruneUnusedBranches = (
  data: Record<string, any>,
  sourceType: DataSourceType
) => {
  SOURCE_TYPE_ORDER.forEach((candidate) => {
    if (candidate === sourceType) {
      return;
    }
    delete data[getDataSourceStrategy(candidate).branchKey];
  });
};

export const normalizeDataConfig = (
  currentData: Record<string, any> | null | undefined,
  patch: Record<string, any>
): DataConfigType => {
  const base = isPlainObject(currentData) ? cloneDeep(currentData) : {};
  const normalizedPatch = isPlainObject(patch) ? cloneDeep(patch) : {};
  const sourceType = inferDataSourceType(normalizedPatch, base);
  const strategy = getDataSourceStrategy(sourceType);
  const next = ObjectUtil.merge(base, { sourceType });
  const branchPatch = extractBranchPatch(sourceType, normalizedPatch);

  if (Object.keys(branchPatch).length > 0) {
    next[strategy.branchKey] = ObjectUtil.merge(
      isPlainObject(next[strategy.branchKey])
        ? cloneDeep(next[strategy.branchKey])
        : {},
      branchPatch
    );
  }

  if (hasOwn(normalizedPatch, "value")) {
    next.value = cloneDeep(normalizedPatch.value);
  }

  pruneUnusedBranches(next, sourceType);

  if (sourceType === "static") {
    const staticData = isPlainObject(next.staticData) ? next.staticData : {};
    if (!hasOwn(staticData, "value")) {
      if (hasOwn(branchPatch, "value")) {
        staticData.value = cloneDeep(branchPatch.value);
      } else if (hasOwn(normalizedPatch, "value")) {
        staticData.value = cloneDeep(normalizedPatch.value);
      } else if (hasOwn(base, "value")) {
        staticData.value = cloneDeep(base.value);
      }
    }
    next.staticData = staticData as IStaticData;
    next.value = hasOwn(staticData, "value")
      ? DataUtil.getStaticData(staticData as IStaticData)
      : undefined;
  } else {
    if (hasOwn(normalizedPatch, "value")) {
      next.value = cloneDeep(normalizedPatch.value);
    } else {
      next.value = undefined;
    }
  }

  return next as DataConfigType;
};

export const normalizeDataConfigAsync = async (
  currentData: Record<string, any> | null | undefined,
  patch: Record<string, any>
): Promise<DataConfigType> => {
  const base = isPlainObject(currentData) ? cloneDeep(currentData) : {};
  const normalizedPatch = isPlainObject(patch) ? cloneDeep(patch) : {};
  const sourceType = inferDataSourceType(normalizedPatch, base);
  const strategy = getDataSourceStrategy(sourceType);
  const next = ObjectUtil.merge(base, { sourceType });
  const branchPatch = extractBranchPatch(sourceType, normalizedPatch);

  if (Object.keys(branchPatch).length > 0) {
    next[strategy.branchKey] = ObjectUtil.merge(
      isPlainObject(next[strategy.branchKey])
        ? cloneDeep(next[strategy.branchKey])
        : {},
      branchPatch
    );
  }

  if (hasOwn(normalizedPatch, "value")) {
    next.value = cloneDeep(normalizedPatch.value);
  }

  pruneUnusedBranches(next, sourceType);

  if (sourceType === "static") {
    const staticData = isPlainObject(next.staticData) ? next.staticData : {};
    if (!hasOwn(staticData, "value")) {
      if (hasOwn(branchPatch, "value")) {
        staticData.value = cloneDeep(branchPatch.value);
      } else if (hasOwn(normalizedPatch, "value")) {
        staticData.value = cloneDeep(normalizedPatch.value);
      } else if (hasOwn(base, "value")) {
        staticData.value = cloneDeep(base.value);
      }
    }
    next.staticData = staticData as IStaticData;
    next.value = hasOwn(staticData, "value")
      ? await DataUtil.getStaticDataAsync(staticData as IStaticData)
      : undefined;
  } else {
    if (hasOwn(normalizedPatch, "value")) {
      next.value = cloneDeep(normalizedPatch.value);
    } else {
      next.value = undefined;
    }
  }

  return next as DataConfigType;
};

export const buildDataSourcePromptTs = (sourceType?: string | null): string => {
  return getDataSourceStrategy(sourceType).promptTs;
};

export const buildDataSourcePromptCatalog = (): string => {
  return buildDataSourceStrategyCatalogText();
};
