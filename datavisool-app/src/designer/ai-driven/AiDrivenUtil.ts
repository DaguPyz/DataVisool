/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {ISelectOption} from "@datavisool/ui";
import type {
    IAiDrivenProviderModelsProvider,
    IAiModelConfiguredListItem
} from "@/api/AiModelApi.ts";
import managerStore from "@/designer/manager/ManagerStore.ts";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import type {
    AiDrivenSelectionMode,
    IAiDrivenAttachmentContext,
    IAiDrivenShortcutContext,
    IAiDrivenSelectedComponentSnapshot,
    IAiDrivenTaskSubmitPayload,
} from "@/designer/ai-driven/types/AiDrivenTaskSubmitTypes.ts";
import {getLocale, tx} from "@/i18n/miniI18n.ts";
import {expandSelectionTreeIds} from "@/designer/operate-provider/selection/SelectionPolicy.ts";

export interface IAiDrivenTaskSubmitBuildOptions {
    /** 单次提交请求 id，用于幂等处理、日志追踪和重试排查。 */
    requestId: string;
    /** AI驱动面板会话 id，用于串联同一次打开期间的请求和附件。 */
    sessionId: string;
    /** 当前项目 id，来自 window.DATAVISOOL_ENV.projectId。 */
    projectId: string;
    /** 本轮任务所属的长期 Thread。 */
    threadId: string;
    /** AI模型配置记录 id，对应前端 modelConfigId。 */
    modelConfigId: string;
    /** 当前模型配置下选择的具体运行模型名，对应前端 runtimeModelId。 */
    runtimeModelId: string;
    /** 模型厂商标识，便于后端快速路由和日志分析。 */
    provider?: string;
    /** 用户本轮输入的自然语言需求。 */
    requirement: string;
    /** 快捷指令上下文；仅作为统一 Agent 的意图提示。 */
    shortcut?: IAiDrivenShortcutContext;
    /** 用户上传附件或前端生成附件的引用列表。 */
    attachments: IAiDrivenAttachmentContext[];
}

/** AI驱动图片附件数量上限。 */
export const MAX_IMAGE_ATTACHMENTS = 3;

/**
 * 判断粘贴事件目标是否是可编辑节点。
 */
export const isEditablePasteTarget = (target: EventTarget | null): target is HTMLElement => {
    if (!(target instanceof HTMLElement))
        return false;

    return target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.isContentEditable;
};

/**
 * 从剪贴板中过滤出图片文件，普通文本粘贴继续交给输入框自身处理。
 */
export const getPastedImageFiles = (clipboardData: DataTransfer | null | undefined): File[] => {
    if (!clipboardData?.items?.length)
        return [];

    return Array.from(clipboardData.items)
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
};

/**
 * 将剪贴板图片文件转换成后端上传接口使用的 data URL。
 */
export const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
                return;
            }
            reject(new Error("file reader result is not a data url"));
        };
        reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
        reader.readAsDataURL(file);
    });
};

/**
 * 生成当前 AI驱动面板会话 id，用于让同一次打开期间的附件归属同一会话。
 */
export const createAiDrivenSessionId = (): string => `ai-driven-session-${createClientTraceId()}`;

/**
 * 生成单次粘贴上传链路 id，同一批粘贴图片共用该 id。
 */
export const createAiDrivenUploadRequestId = (): string => `ai-driven-upload-${createClientTraceId()}`;

/**
 * 生成单次 AI驱动任务提交请求 id。
 */
export const createAiDrivenSubmitRequestId = (): string => `ai-driven-submit-${createClientTraceId()}`;

/** 生成活动 Turn 追加输入 id。 */
export const createAiDrivenSteerInputId = (): string => `ai-driven-steer-${createClientTraceId()}`;

/**
 * 获取当前设计器项目 id，缺失时不允许上传附件。
 */
export const getCurrentProjectId = (): string => {
    if (typeof window === "undefined")
        return "";
    return window.DATAVISOOL_ENV?.projectId?.trim() ?? "";
};

/**
 * 生成粘贴图片文件名，补齐剪贴板图片可能缺失的原始文件名。
 */
export const getPastedImageFileName = (file: File, index: number): string => {
    const name = file.name?.trim();
    if (name)
        return name;
    return `pasted-image-${Date.now()}-${index + 1}`;
};

/**
 * 构造 AI 模型配置下拉框选项。
 */
export const buildAiDrivenModelConfigOptions = (list: IAiModelConfiguredListItem[]): ISelectOption[] => {
    return list.map((item) => ({
        label: item.name?.trim() || item.provider?.trim() || item.id || tx("未命名模型"),
        value: item.id || "",
        description: item.provider,
    })).filter((option) => option.value);
};

/**
 * 根据当前选中的模型配置 id 读取模型厂商。
 */
export const getAiDrivenSelectedModelProvider = (
    modelConfigs: IAiModelConfiguredListItem[],
    modelConfigId: string,
): string => {
    return modelConfigs
        .find((item) => item.id === modelConfigId)
        ?.provider
        ?.trim() ?? "";
};

/**
 * 根据模型厂商匹配该厂商下的型号配置。
 */
export const getAiDrivenProviderModelConfig = (
    providerModelProviders: IAiDrivenProviderModelsProvider[],
    selectedModelProvider: string,
): IAiDrivenProviderModelsProvider | undefined => {
    return providerModelProviders.find((item) => item.provider === selectedModelProvider);
};

/**
 * 构造具体模型型号下拉框选项。
 */
export const buildAiDrivenRuntimeModelOptions = (
    providerModelConfig: IAiDrivenProviderModelsProvider | undefined,
): ISelectOption[] => {
    return (providerModelConfig?.models ?? []).map((model) => ({
        label: model.label?.trim() || model.modelName || tx("未知模型"),
        value: model.modelName || "",
    })).filter((option) => option.value);
};

/**
 * 读取目标厂商下的默认模型型号；未配置默认值时返回第一个可用型号。
 */
export const getAiDrivenDefaultRuntimeModelId = (
    providerModelConfig: IAiDrivenProviderModelsProvider | undefined,
): string => {
    const providerModels = providerModelConfig?.models ?? [];
    const availableModels = providerModels.filter((model) => model.modelName);
    const defaultModel = availableModels.find((model) => model.isDefault) ?? availableModels[0];
    return defaultModel?.modelName ?? "";
};

/**
 * 获取 AI驱动固定进度标题。
 */
export const getAiDrivenProgressTitle = (): string => `${tx("当前进度")}：${tx("待开始")}`;

/**
 * 构造 AI驱动任务提交 payload，统一收敛画布快照和选中组件快照的采集规则。
 */
export const getCurrentAiDrivenCanvasSnapshot = (): IAiDrivenTaskSubmitPayload["canvasSnapshot"] | null => {
    const manager = getCurrentAiDrivenDesignerManager();
    if (!manager) return null;
    const canvasConfig = manager.canvasManager?.canvasConfig ?? {};
    return {
        width: normalizeCanvasSize(canvasConfig.width),
        height: normalizeCanvasSize(canvasConfig.height),
        managerId: manager.id?.trim() || undefined,
    };
};

export const buildAiDrivenTaskSubmitPayload = (
    options: IAiDrivenTaskSubmitBuildOptions,
): IAiDrivenTaskSubmitPayload | null => {
    const manager = getCurrentAiDrivenDesignerManager();
    const projectId = options.projectId.trim();
    const threadId = options.threadId.trim();
    if (!manager || !projectId || !threadId)
        return null;

    const canvasConfig = manager.canvasManager?.canvasConfig ?? {};
    const selection = buildAiDrivenSelectionContext();
    return {
        schemaVersion: "ai-driven-task/v3",
        requestId: options.requestId,
        sessionId: options.sessionId,
        projectId,
        threadId,
        model: {
            modelConfigId: options.modelConfigId,
            runtimeModelId: options.runtimeModelId,
            provider: options.provider,
        },
        requirement: options.requirement.trim(),
        shortcut: options.shortcut,
        attachments: options.attachments,
        canvasSnapshot: {
            width: normalizeCanvasSize(canvasConfig.width),
            height: normalizeCanvasSize(canvasConfig.height),
            managerId: manager.id?.trim() || undefined,
        },
        selection,
        clientContext: {
            locale: getLocale(),
            timezone: getClientTimezone(),
            appVersion: import.meta.env.VITE_APP_VERSION,
        },
    };
};

// 根据过滤分组图层后的组件数量计算后端需要的选区模式。
const resolveAiDrivenSelectionMode = (count: number): AiDrivenSelectionMode => {
    if (count <= 0)
        return "none";
    return count === 1 ? "single" : "multiple";
};

// 构造选区快照时只保留真实组件，过滤掉分组图层。
const buildAiDrivenSelectionContext = (): IAiDrivenTaskSubmitPayload["selection"] => {
    const manager = getCurrentAiDrivenDesignerManager();
    const layerManager = manager?.layerManager;
    const layerConfigs = layerManager?.layerConfigs ?? {};
    const targetIds = expandSelectionTreeIds(eventOperateStore.targetIds ?? [], layerConfigs).filter((id) => {
        const layer = layerConfigs[id];
        return Boolean(layer) && layer.type !== "group";
    });
    const components = targetIds
        .map((id) => buildAiDrivenSelectedComponentSnapshot(id))
        .filter((component): component is IAiDrivenSelectedComponentSnapshot => Boolean(component));

    return {
        mode: resolveAiDrivenSelectionMode(components.length),
        targetIds: components.map((component) => component.id),
        components,
    };
};

// 从图层中提取单个选中组件的基础快照。
const buildAiDrivenSelectedComponentSnapshot = (
    id: string,
): IAiDrivenSelectedComponentSnapshot | null => {
    const manager = getCurrentAiDrivenDesignerManager();
    const layerManager = manager?.layerManager;
    const layer = layerManager?.layerConfigs?.[id];
    if (!layer || layer.type === "group")
        return null;

    return {
        id,
        type: layer.type,
        name: layer.name,
    };
};

// 读取当前设计器 manager，兼容测试或非浏览器环境下 window 不存在的情况。
const getCurrentAiDrivenDesignerManager = () => {
    if (managerStore.currentManager)
        return managerStore.currentManager;
    if (typeof window === "undefined")
        return null;
    return window.DATAVISOOL_ENV?.currentManager ?? null;
};

// 画布快照只保留宽高，非数值或非法值统一归零。
const normalizeCanvasSize = (value: unknown): number => {
    const size = Number(value);
    return Number.isFinite(size) ? size : 0;
};

// 读取客户端时区，失败时不影响主流程提交。
const getClientTimezone = (): string | undefined => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
        return undefined;
    }
};

// 生成前端本地追踪 id，优先使用浏览器随机 UUID。
const createClientTraceId = (): string => {
    const randomUUID = globalThis.crypto?.randomUUID?.();
    if (randomUUID)
        return randomUUID;

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};
