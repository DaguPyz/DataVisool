/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {
  DataConfigType,
  IStaticData,
} from "@datavisool/sdk/types";
import { SafeEvalUtil } from "@/util/SafeEvalUtil.ts";

export default class DataUtil {
  private static isPromiseLike(value: unknown): value is PromiseLike<any> {
    return (
      !!value &&
      (typeof value === "object" || typeof value === "function") &&
      typeof (value as PromiseLike<any>).then === "function"
    );
  }

  public static isAsyncFunction(func: unknown): boolean {
    return (
      typeof func === "function" && func.constructor?.name === "AsyncFunction"
    );
  }

  public static applyFilter(data: any, filter?: string) {
    if (!filter) return data;
    try {
      const func = SafeEvalUtil.run(filter);
      if (typeof func !== "function") return data;
      if (DataUtil.isAsyncFunction(func)) return data;
      const value = func(data);
      if (DataUtil.isPromiseLike(value)) {
        value.then(undefined, (error) =>
          console.error("[DataUtil] async filter execution failed:", error)
        );
        return data;
      }
      return value;
    } catch (error) {
      console.error("[DataUtil] filter execution failed:", error);
      return data;
    }
  }

  public static async applyFilterAsync(data: any, filter?: string) {
    if (!filter) return data;
    try {
      const func = SafeEvalUtil.run(filter);
      if (typeof func !== "function") return data;
      if (DataUtil.isAsyncFunction(func)) return await func(data);
      const value = func(data);
      return DataUtil.isPromiseLike(value) ? await value : value;
    } catch (error) {
      console.error("[DataUtil] filter execution failed:", error);
      return data;
    }
  }

  public static getStaticData(staticData?: IStaticData) {
    if (!staticData) return null;
    if (typeof staticData === "object" && "value" in staticData) {
      const rawValue = staticData.value;
      return DataUtil.applyFilter(rawValue, staticData.filter);
    }
    return null;
  }

  public static async getStaticDataAsync(staticData?: IStaticData) {
    if (!staticData) return null;
    if (typeof staticData === "object" && "value" in staticData) {
      const rawValue = staticData.value;
      return await DataUtil.applyFilterAsync(rawValue, staticData.filter);
    }
    return null;
  }

  public static getStaticDataConfig(config?: DataConfigType) {
    const staticData = config?.staticData;
    if (
      !staticData ||
      typeof staticData !== "object" ||
      !("value" in staticData)
    ) {
      return {
        value: config?.value,
        filter: undefined,
      };
    } else {
      return config.staticData;
    }
  }

  /**
   * 解析 Headers，支持对象、JSON字符串、函数（同步/异步）
   * @param headers
   */
  static async resolveHeaders(headers: any): Promise<Record<string, string>> {
    return this.resolveDynamicValue(headers, {});
  }

  /**
   * 解析 Params，支持对象、JSON字符串、函数（同步/异步）
   * @param params
   */
  static async resolveParams(params: any): Promise<any> {
    return this.resolveDynamicValue(params, {});
  }

  /**
   * 通用动态值解析方法
   * @param value 输入值（字符串、函数、对象）
   * @param defaultValue 默认值
   * @private
   */
  private static async resolveDynamicValue<T>(
    value: any,
    defaultValue: T
  ): Promise<T> {
    if (!value) return defaultValue;

    try {
      // 1. 如果是字符串，尝试解析为对象或函数
      if (typeof value === "string") {
        value = value.trim();
        if (value.startsWith("{") || value.startsWith("[")) {
          // JSON 字符串
          try {
            return JSON.parse(value);
          } catch (e) {
            console.warn("JSON parse failed, trying SafeEvalUtil", e);
            // 如果 JSON 解析失败，尝试用 SafeEvalUtil 运行（可能是 JS 对象字面量字符串）
            const result = SafeEvalUtil.run(value);
            return typeof result === "object" &&
              result !== null &&
              !Array.isArray(result)
              ? (result as unknown as T)
              : defaultValue;
          }
        } else {
          // 函数字符串
          const func = SafeEvalUtil.run(value);
          if (typeof func === "function") {
            const result = await func();
            return typeof result === "object" && result !== null
              ? result
              : defaultValue;
          }
          return defaultValue;
        }
      }

      // 2. 如果是函数，直接执行
      if (typeof value === "function") {
        const result = await value();
        return typeof result === "object" && result !== null
          ? result
          : defaultValue;
      }

      // 3. 如果已经是对象，直接返回
      if (typeof value === "object") {
        return value;
      }
    } catch (e) {
      console.error("Failed to resolve dynamic value:", e);
    }

    return defaultValue;
  }
}
