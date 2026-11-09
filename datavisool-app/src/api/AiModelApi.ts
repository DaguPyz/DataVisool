/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {IPage, IPageParam} from "@datavisool/sdk/types";
import type {IAiModel} from "@/pages/home/ai-model-management/AiModelManagementStore.ts";
import AuthFetchUtil, {type AuthRequestInit} from "@/util/AuthFetchUtil.ts";

export interface IAiModelCatalogModel {
    modelName?: string;
    label?: string;
    isDefault?: boolean;
}

export interface IAiModelCatalogProvider {
    provider?: string;
    providerLabel?: string;
    models?: IAiModelCatalogModel[];
}

export interface IAiModelConfiguredListItem {
    /** 模型配置记录 id。 */
    id?: string;
    /** 用户在 AI 模型管理中维护的自定义模型名称。 */
    name?: string;
    /** 模型厂商标识。 */
    provider?: string;
}

export interface IAiDrivenProviderModel {
    /** 模型接口调用时使用的型号 id。 */
    modelName?: string;
    /** 前端展示用模型名称。 */
    label?: string;
    /** 是否为当前厂商下的默认型号。 */
    isDefault?: boolean;
    /** 该型号是否支持图片理解输入。 */
    supportsImageInput?: boolean;
    /** 留空配置时采用的输出预算；未指定则使用厂商 API 默认值。 */
    defaultMaxOutputTokens?: number | null;
    defaultMaxOutputTokensBasis?: "api-default" | "recommended-budget" | "model-output-limit" | null;
    defaultMaxOutputTokensSource?: string | null;
}

export interface IAiDrivenProviderModelsProvider {
    /** 模型厂商标识。 */
    provider?: string;
    /** 前端展示用模型厂商名称。 */
    providerLabel?: string;
    /** 厂商协议族，用于前端按协议区分调用适配。 */
    providerFamily?: string;
    /** 当前厂商下可选的具体模型型号。 */
    models?: IAiDrivenProviderModel[];
}

export interface IAiModelPageParam extends Omit<IPageParam, "searchValue"> {
    searchValue?: string | null;
}

// 统一封装 AI 模型配置分页查询，避免界面层直接拼接接口地址和分页参数结构。
export const getAiModelPageList = async (
    pageParam: IAiModelPageParam,
    options?: AuthRequestInit,
): Promise<IPage<IAiModel>> => {
    const data = await AuthFetchUtil.post<IPage<IAiModel>>("/api/aiModel/pageList", pageParam, options);
    return data || {
        records: [],
        total: 0,
        size: pageParam.size,
        current: pageParam.current,
    };
};

// 统一封装 AI 型号目录查询，供界面按配置项所属厂商加载对应的型号列表。
export const getAiModelCatalog = async (options?: AuthRequestInit): Promise<IAiModelCatalogProvider[]> => {
    const data = await AuthFetchUtil.get<IAiModelCatalogProvider[]>("/api/aiModel/catalog", options);
    return data || [];
};

/**
 * 轻量查询已配置 AI 模型列表，仅返回配置 id、自定义名称和厂商。
 */
export const getAiModelConfiguredList = async (options?: AuthRequestInit): Promise<IAiModelConfiguredListItem[]> => {
    const data = await AuthFetchUtil.get<IAiModelConfiguredListItem[]>("/api/aiModel/configuredList", options);
    return data || [];
};

/**
 * 轻量查询 AI驱动可用模型厂商与型号配置。
 */
export const getAiDrivenProviderModelProviders = async (options?: AuthRequestInit): Promise<IAiDrivenProviderModelsProvider[]> => {
    const data = await AuthFetchUtil.get<IAiDrivenProviderModelsProvider[]>("/api/aiDriven/model/providers", options);
    return data || [];
};
