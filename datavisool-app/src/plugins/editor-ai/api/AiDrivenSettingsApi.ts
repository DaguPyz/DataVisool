/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AuthFetchUtil, {type AuthRequestInit} from "@/util/AuthFetchUtil.ts";

export interface IAiDrivenRuntimeSettings {
    schemaVersion: 2;
    modelRequest: {timeoutSeconds: number};
    context: {
        maxActiveContextTokens: number;
        compactAtPercent: number;
        maxToolResultTokens: number;
        maxToolHistoryTokens: number;
        maxStateDigestTokens: number;
        compactSummaryTokens: number;
    };
    execution: {
        tokenBudgetEnabled: boolean;
        callBudgetEnabled: boolean;
        durationBudgetEnabled: boolean;
        maxModelCalls: number;
        maxToolCalls: number;
        maxWriteCalls: number;
        maxTotalTokens: number;
        maxDurationSeconds: number;
        maxToolDurationSeconds: number;
        frontendBatchTimeoutSeconds: number;
        maxConsecutiveFailures: number;
        maxFrontendInteractions: number;
        maxSameReadRepeats: number;
        maxReadsWithoutBusinessProgress: number;
        maxCompletionContinuations: number;
    };
}

export interface IAiDrivenRuntimeSettingsResponse {
    settings: IAiDrivenRuntimeSettings;
    defaults: IAiDrivenRuntimeSettings;
}

const DEFAULT_SETTINGS: IAiDrivenRuntimeSettings = {
    schemaVersion: 2,
    modelRequest: {timeoutSeconds: 120},
    context: {
        maxActiveContextTokens: 128_000,
        compactAtPercent: 90,
        maxToolResultTokens: 10_000,
        maxToolHistoryTokens: 16_000,
        maxStateDigestTokens: 4_096,
        compactSummaryTokens: 4_096,
    },
    execution: {
        tokenBudgetEnabled: false,
        callBudgetEnabled: false,
        durationBudgetEnabled: false,
        maxModelCalls: 120,
        maxToolCalls: 320,
        maxWriteCalls: 120,
        maxTotalTokens: 1_000_000,
        maxDurationSeconds: 4_500,
        maxToolDurationSeconds: 600,
        frontendBatchTimeoutSeconds: 120,
        maxConsecutiveFailures: 25,
        maxFrontendInteractions: 40,
        maxSameReadRepeats: 3,
        maxReadsWithoutBusinessProgress: 20,
        maxCompletionContinuations: 12,
    },
};

const withContextDefaults = (context: Partial<IAiDrivenRuntimeSettings["context"]>) => ({
    ...DEFAULT_SETTINGS.context,
    ...context,
    maxToolHistoryTokens: context.maxToolHistoryTokens
        ?? Math.max(DEFAULT_SETTINGS.context.maxToolHistoryTokens, context.maxToolResultTokens ?? 0),
});

const normalizeSettings = (value: IAiDrivenRuntimeSettings): IAiDrivenRuntimeSettings => {
    if (value.schemaVersion !== 2) throw new Error("不支持的 AI 运行设置版本，仅支持版本 2");
    return {
        schemaVersion: 2,
        modelRequest: {...DEFAULT_SETTINGS.modelRequest, ...value.modelRequest},
        context: withContextDefaults(value.context ?? {}),
        execution: {
            ...DEFAULT_SETTINGS.execution, ...value.execution,
        },
    };
};

export const getAiDrivenRuntimeSettings = async (
    options?: AuthRequestInit,
): Promise<IAiDrivenRuntimeSettingsResponse> => {
    const data = await AuthFetchUtil.getOrThrow<IAiDrivenRuntimeSettingsResponse>(
        "/api/aiDriven/settings/get",
        options,
    );
    if (data?.settings && data.defaults)
        return {settings: normalizeSettings(data.settings), defaults: normalizeSettings(data.defaults)};
    throw new Error("读取 AI 运行设置失败");
};

export const saveAiDrivenRuntimeSettings = async (
    settings: IAiDrivenRuntimeSettings,
    options?: AuthRequestInit,
): Promise<IAiDrivenRuntimeSettings> => {
    const data = await AuthFetchUtil.post<IAiDrivenRuntimeSettings>(
        "/api/aiDriven/settings/save",
        settings,
        options,
    );
    if (!data) throw new Error("保存 AI 运行设置失败");
    return normalizeSettings(data);
};
