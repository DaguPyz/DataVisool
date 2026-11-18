/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */


/**
 * 配置对象片段
 */
export interface ConfigureObjectFragments {
    [key: string]: ConfigureObjectFragments | string | number | null | undefined;
}

function isPlainObject(value: any): value is Record<string, any> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export default class ObjectUtil {
    /**
     * 合并两个对象，将newData中的属性合并到originalData中
     * @param originalData
     * @param newData
     */
    public static merge(originalData: any, newData: any): any {
        if (!originalData && !newData)
            return null;
        if (!originalData && newData)
            return newData;
        if (originalData && !newData)
            return originalData;
        Object.keys(newData).forEach(key => {
            const newValue = newData[key];
            if (Object.prototype.hasOwnProperty.call(originalData, key)) {
                if (Array.isArray(newValue)) {
                    originalData[key] = newValue;
                } else if (isPlainObject(newValue)
                    && Object.keys(newValue).length > 0
                    && isPlainObject(originalData[key])) {
                    ObjectUtil.merge(originalData[key], newValue);
                } else {
                    originalData[key] = newValue;
                }
            } else {
                originalData[key] = newValue;
            }
        });
        return originalData;
    }

    /**
     * 获取原始对象中的属性值
     */
    public static getOriginValue(originObj: ConfigureObjectFragments, newObj: ConfigureObjectFragments): ConfigureObjectFragments {
        function findAndExtract(original: ConfigureObjectFragments, updated: ConfigureObjectFragments): ConfigureObjectFragments {
            const result: ConfigureObjectFragments = {};
            for (const key in updated) {
                if (typeof updated[key] === 'object' && !Array.isArray(updated[key]) && original[key]) {
                    if (original[key]) {
                        result[key] = findAndExtract(original[key] as ConfigureObjectFragments, updated[key] as ConfigureObjectFragments);
                    }
                } else {
                    result[key] = original[key];
                }
            }
            return result;
        }

        return findAndExtract(originObj, newObj);
    }

    /**
     * 删除对象中的空值属性
     * @param obj
     */
    public static removeEmptyKeys(obj: Record<string, any>): Record<string, any> {
        //将对象中的空值属性删除
        Object.keys(obj).forEach(key => {
            if (obj[key] === null || obj[key] === undefined || obj[key] === "" || (typeof obj[key] === 'string' && obj[key].trim() === '')) {
                delete obj[key];
            }
        })
        return obj;
    }

    /**
     * 将 JS 对象转换为 JS 代码字符串（可在浏览器运行，保留函数原样）
     * @param obj JS对象
     */
    public static objToCodeStr(obj: Record<string, any>): string {
        let jsonStr = JSON.stringify(obj, (key, value) => {
            if (typeof value === 'function')
                return value.toString();
            return value;
        }, 2);
        jsonStr = jsonStr.replace(/(['"])([a-zA-Z_$][\w$]*)\1\s*:/g, '$2:');
        //将函数字符串还原为编辑器中的函数代码格式
        jsonStr = jsonStr.replace(/(["'])(function\s*\w*\s*\([^)]*\)\s*\{[\s\S]*?}|\([^)]*\)\s*=>\s*\{[\s\S]*?})(["'])/g, (_, quoteStart, fnBody: string, quoteEnd) => {
            return fnBody
                // 常规控制字符
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\b/g, '\b')
                .replace(/\\f/g, '\f')
                .replace(/\\v/g, '\v')

                // 必须先处理反斜杠（避免冲突）
                .replace(/\\\\/g, '\\')

                // 引号和模板字符串
                .replace(/\\"/g, '"')
                .replace(/\\'/g, '\'')
                .replace(/\\`/g, '`')

                // Unicode
                .replace(/\\u([\dA-Fa-f]{4})/g, (_: any, hex: any) =>
                    String.fromCharCode(parseInt(hex, 16))
                )
                .trim();
        });
        return jsonStr;
    }

}
