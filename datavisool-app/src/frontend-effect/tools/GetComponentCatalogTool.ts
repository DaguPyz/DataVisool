/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import {
    componentDocumentIndex,
} from "@/designer/ai-driven/ComponentAiSelectionDocRegistry.ts";
import type {IAiDrivenComponentInfo, ComponentDocumentInfo} from "@/designer/ai-driven/ComponentAiSelectionDocRegistry.ts";
import type {BaseInfoType} from "@datavisool/sdk/types";

/** 暂不向 AI 开放、需要独立生成流程的复杂组件。 */
const AI_DRIVEN_EXCLUDED_COMPONENT_TYPES = new Set([
    "G2PlotCustom",
    "ECharts",
    "AMap",
    "MapLibreGis",
    "LoopContainer",
]);

/**
 * 组件库清单项。
 */
interface ComponentCatalogItem {
    /** 组件类型，对应 compKey。 */
    componentType: string;
    /** 组件显示名。 */
    componentName: string;
    /** 主分类。 */
    categorize?: string;
    /** 子分类。 */
    subCategorize?: string;
    /** 来源。 */
    source?: string;
    /** 默认宽度。 */
    width?: number;
    /** 默认高度。 */
    height?: number;
    /** 构建索引提供的组件选择摘要。 */
    componentInfo?: IAiDrivenComponentInfo;
    documentInfo?: ComponentDocumentInfo;
}

/**
 * 组件库清单结果。
 */
interface GetComponentCatalogResult {
    /** 清单版本。 */
    catalogVersion: string;
    /** 当前已注册组件清单。 */
    components: Array<{
        componentType: string;
        componentName: string;
        description: string;
    }>;
}

/** 收集当前已加载且可供 AI 使用的组件，供内部文档读取与版本校验使用。 */
export function getLoadedComponentCatalogEntries(): ComponentCatalogItem[] {
    const builtin = new Map(componentDocumentIndex.documents.map(doc => [doc.componentType, doc]));
    const documents = new Map(Object.keys(DesignerLoader.definitionMap).map(type => {
        const remote = DesignerLoader.remoteScriptMap[type];
        return [type, remote ? remote.documentInfo : builtin.get(type)] as const;
    }));
    return Object.values(DesignerLoader.definitionMap)
        .map((definition) => definition.getBaseInfo?.())
        .filter((baseInfo): baseInfo is BaseInfoType => Boolean(baseInfo?.compKey))
        .filter((baseInfo) => !AI_DRIVEN_EXCLUDED_COMPONENT_TYPES.has(baseInfo.compKey))
        .filter((baseInfo) => documents.get(baseInfo.compKey)?.hasFullSpec && documents.get(baseInfo.compKey)?.componentInfo.selectable !== false)
        .map((baseInfo) => ({
            componentType: baseInfo.compKey,
            componentName: baseInfo.compName,
            categorize: baseInfo.categorize,
            subCategorize: baseInfo.subCategorize,
            source: documents.get(baseInfo.compKey)?.source,
            width: baseInfo.width,
            height: baseInfo.height,
            componentInfo: documents.get(baseInfo.compKey)?.componentInfo,
            documentInfo: documents.get(baseInfo.compKey),
        }))
        .sort((left, right) => left.componentType.localeCompare(right.componentType));
}

/** 模型只接收选择信息；文档身份保留在内部，用于规格读取及写入校验。 */
export function runGetComponentCatalogTool(): GetComponentCatalogResult {
    const entries = getLoadedComponentCatalogEntries();
    return {
        catalogVersion: `component-catalog/v5:${componentDocumentIndex.corpusVersion}:${entries.length}`,
        components: entries.map(({componentType, componentName, componentInfo}) => ({
            componentType,
            componentName,
            description: componentInfo?.description ?? "",
        })),
    };
}
