/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
export type BPNodeEnableLike = {
    enabled?: boolean;
} | null | undefined;

/**
 * 判断蓝图节点是否启用。
 * 仅当显式传入 false 时才视为禁用。
 */
export const isBlueprintNodeEnabled = (config?: BPNodeEnableLike): boolean => {
    return config?.enabled !== false;
};
