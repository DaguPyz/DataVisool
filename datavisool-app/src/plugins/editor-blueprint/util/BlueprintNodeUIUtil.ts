/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export const BLUEPRINT_NODE_DISABLED_TITLE_BG_COLOR = '#8a8f98';

/** Normalize view-owned config defaults before writing to the scene model. */
export const normalizeBlueprintNodeConfig = <T extends {enabled?: boolean}>(config?: T | null): T | null => {
    if (!config) return config ?? null;
    if (config.enabled === undefined) config.enabled = true;
    return config;
};

export const getBlueprintNodeTitleBgColor = (baseColor: string, enabled?: boolean): string =>
    enabled === false ? BLUEPRINT_NODE_DISABLED_TITLE_BG_COLOR : baseColor;
