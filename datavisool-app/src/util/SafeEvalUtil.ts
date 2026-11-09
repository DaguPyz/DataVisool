/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * SecureEvaluator - 安全表达式执行工具
 * 支持：对象 / 函数 / 基础类型的安全执行与类型校验
 */
export interface SafeEvalOptions {
    /** 出错时是否返回 null（否则抛出异常） */
    returnNullOnError?: boolean;
    /** 允许的返回类型 */
    allowTypes?: Array<'object' | 'function' | 'string' | 'number' | 'boolean'>;
}

export class SafeEvalUtil {
    /**
     * 安全执行表达式
     * @param expression - 要执行的字符串表达式
     * @param options - 可选配置项
     * @returns 执行结果或 null
     */
    public static run<T = unknown>(expression: unknown, options: SafeEvalOptions = {}): T | null {
        const {
            returnNullOnError = true,
            allowTypes = ['object', 'function', 'string', 'number', 'boolean'],
        } = options;

        try {
            if (typeof expression !== 'string') {
                const directType = typeof expression;
                if (expression != null && allowTypes.includes(directType as any))
                    return expression as T;
                throw new Error(`表达式不能为空或非字符串, 当前值: ${expression}`);
            }

            if (!expression.trim())
                throw new Error(`表达式不能为空或非字符串, 当前值: ${expression}`);

            const code = expression.trim();

            // 禁止执行明显的危险关键字
            const forbiddenPatterns = /(eval)/;
            if (forbiddenPatterns.test(code))
                throw new Error(`表达式中包含禁止的关键字, 当前值: ${code}`);

            // 执行表达式（包裹括号，保证对象字面量等可正常解析）
            const result = eval(`(${code})`);

            // 检查结果类型
            const type = typeof result;
            if (!allowTypes.includes(type as any))
                throw new Error(`不允许的返回类型: ${type}`);

            return result as T;
        } catch (err: any) {
            console.error(`[SafeEvalUtil] 执行失败: ${err.message}`);
            if (returnNullOnError)
                return null;
            throw err;
        }
    }
}
