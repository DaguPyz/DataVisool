/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
export type BPNodeEnableLike = {
    enabled?: boolean;
} | null | undefined;

export const BLUEPRINT_NODE_DISABLED_TITLE_BG_COLOR = "#8a8f98";

/**
 * 判断蓝图节点是否启用。
 * 仅当显式传入 false 时才视为禁用。
 */
export const isBlueprintNodeEnabled = (config?: BPNodeEnableLike): boolean => {
    return config?.enabled !== false;
};

/**
 * 规范化节点配置，确保 enabled 字段默认存在且默认为 true。
 */
export const normalizeBlueprintNodeConfig = <T extends { enabled?: boolean }>(config?: T | null): T | null => {
    if (!config)
        return config ?? null;
    if (config.enabled === undefined)
        config.enabled = true;
    return config;
};

export const getBlueprintNodeTitleBgColor = (baseColor: string, enabled?: boolean): string => {
    return enabled === false ? BLUEPRINT_NODE_DISABLED_TITLE_BG_COLOR : baseColor;
};
