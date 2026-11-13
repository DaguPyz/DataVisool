/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
/**
 * Agent 运行诊断日志只在开发构建输出；生产构建不会保留这些 console 调用。
 */
export const aiDrivenDevLog = (...args: unknown[]) => {
    if (import.meta.env.DEV)
        console.debug("[ai-driven]", ...args);
};

export const aiDrivenDevWarn = (...args: unknown[]) => {
    if (import.meta.env.DEV)
        console.warn("[ai-driven]", ...args);
};

export const aiDrivenDevError = (...args: unknown[]) => {
    if (import.meta.env.DEV)
        console.error("[ai-driven]", ...args);
};
