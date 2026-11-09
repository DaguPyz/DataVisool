/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {StructuredLayerConfig, StructuredSourceConfig} from "@datavisool/sdk/types";
import {Map as MapLibreMap} from "maplibre-gl";

export type LayerIssue = {
    layerId: string;
    message: string;
};

export type NormalizeStructuredLayersResult = {
    layers: StructuredLayerConfig[];
    issues: LayerIssue[];
};

export type BuildLayerSpecListResult = {
    layerSpecs: any[];
    issues: LayerIssue[];
};

export type UpsertLayerResult = {
    ok: boolean;
    action: 'added' | 'recreated' | 'skipped' | 'failed';
    layerId: string;
    message?: string;
};

export type SyncLayersResult = {
    managedLayerIds: string[];
    issues: LayerIssue[];
    results: UpsertLayerResult[];
};

export type ResolveLayerSourceId = (layer: StructuredLayerConfig) => string;
export type ResolveSourceTypeById = (sourceId: string) => StructuredSourceConfig['sourceType'] | undefined;

/**
 * 把 StructuredLayerConfig 转换为 MapLibre `addLayer` 可接受的 layer spec。
 *
 * 说明：
 * - 这里只做“字段透传 + 最小默认值兜底”，不做复杂编译逻辑：
 *   - paint/layout/filter 多数来自 UI 编辑器，按对象透传
 * - vector 图层的 source-layer 字段只在 sourceType=vector 且 layer.sourceLayer 存在时注入
 * - visible=false：通过 layout.visibility='none' 实现隐藏（不移除 layer，保持结构稳定）
 *
 * 默认值兜底：
 * - circle/line/fill/heatmap/symbol/raster 若缺少关键样式字段，会补一个可视的默认值
 *   目的：避免新建图层时“空白不可见”导致用户误以为无效
 */
export const buildLayer = (layer: StructuredLayerConfig, sourceId: string, sourceType?: StructuredSourceConfig['sourceType']): any | null => {
    const base: any = {
        id: layer.id,
        type: layer.type,
    };
    if (layer.type !== 'background')
        base.source = sourceId;

    if (typeof layer.minzoom === 'number')
        base.minzoom = layer.minzoom;
    if (typeof layer.maxzoom === 'number')
        base.maxzoom = layer.maxzoom;

    if (sourceType === 'vector' && layer.sourceLayer)
        base['source-layer'] = layer.sourceLayer;

    base.layout = {...(layer.layout ?? {})};
    base.paint = {...(layer.paint ?? {})};

    if (layer.visible === false)
        base.layout.visibility = 'none';

    if (layer.filter)
        base.filter = layer.filter;

    if (layer.type === 'circle') {
        if (base.paint['circle-radius'] == null)
            base.paint['circle-radius'] = 6;
        if (base.paint['circle-color'] == null)
            base.paint['circle-color'] = '#4FB8FF';
        if (base.paint['circle-opacity'] == null)
            base.paint['circle-opacity'] = 0.9;
    }

    if (layer.type === 'line') {
        if (base.paint['line-width'] == null)
            base.paint['line-width'] = 2;
        if (base.paint['line-color'] == null)
            base.paint['line-color'] = '#4FB8FF';
        if (base.paint['line-opacity'] == null)
            base.paint['line-opacity'] = 0.9;
    }

    if (layer.type === 'fill') {
        if (base.paint['fill-color'] == null)
            base.paint['fill-color'] = '#1D4ED8';
        if (base.paint['fill-opacity'] == null)
            base.paint['fill-opacity'] = 0.35;
        if (base.paint['fill-outline-color'] == null)
            base.paint['fill-outline-color'] = '#60A5FA';
    }

    if (layer.type === 'heatmap') {
        if (base.paint['heatmap-intensity'] == null)
            base.paint['heatmap-intensity'] = 1;
        if (base.paint['heatmap-opacity'] == null)
            base.paint['heatmap-opacity'] = 0.8;
    }

    if (layer.type === 'symbol') {
        if (base.layout['icon-allow-overlap'] == null)
            base.layout['icon-allow-overlap'] = true;
    }

    if (layer.type === 'raster') {
        if (base.paint['raster-opacity'] == null)
            base.paint['raster-opacity'] = 1;
    }

    return base;
}

/**
 * 从组件配置里拿到 layers，并做最基础的“类型安全兜底”。
 *
 * 约束：
 * - 本组件是新实现，不做历史结构迁移（不接受旧的 layer/source 内联结构）
 * - 这里只解决“外部传入不靠谱”的情况：不是数组、数组项不是对象、缺少 id/type
 *
 * 输出：
 * - layers：过滤后的可用 StructuredLayerConfig[]
 * - issues：被过滤掉的原因，便于面板提示或日志定位
 */
export const normalizeStructuredLayers = (layers: any): NormalizeStructuredLayersResult => {
    if (!Array.isArray(layers))
        return {layers: [], issues: []};

    const next: StructuredLayerConfig[] = [];
    const issues: LayerIssue[] = [];

    layers.forEach((l, idx) => {
        if (!l || typeof l !== 'object') {
            issues.push({layerId: '', message: `layers[${idx}] 不是对象，已忽略`});
            return;
        }
        const id = (l as any).id;
        const type = (l as any).type;
        if (typeof id !== 'string' || id.trim() === '') {
            issues.push({layerId: '', message: `layers[${idx}] 缺少 id，已忽略`});
            return;
        }
        if (typeof type !== 'string' || type.trim() === '') {
            issues.push({layerId: id, message: `layer（${id}）缺少 type，已忽略`});
            return;
        }
        next.push(l as StructuredLayerConfig);
    });

    return {layers: next, issues};
};

/**
 * 把一个 StructuredLayerConfig 转换成可 addLayer 的 layer spec（带 source 解析）。
 *
 * 入参：
 * - layer：结构化 layer 配置
 * - resolveSourceId：用于把 layer.sourceRef 映射成 MapLibre 的 sourceId
 * - resolveSourceType：用于在 vector source 时决定是否需要写入 source-layer
 *
 * 返回 null 的场景：
 * - 非 background layer 但无法解析出 sourceId（sourceRef 缺失或 resolver 返回空）
 */
export const buildMapLibreLayerSpec = (
    layer: StructuredLayerConfig,
    resolveSourceId: ResolveLayerSourceId,
    resolveSourceType?: ResolveSourceTypeById
): any | null => {
    if (!layer)
        return null;

    const isBackground = layer.type === 'background';
    const sourceId = isBackground ? '' : (resolveSourceId(layer) ?? '');
    if (!isBackground && (!sourceId || sourceId.trim() === ''))
        return null;

    const sourceType = !isBackground && resolveSourceType ? resolveSourceType(sourceId) : undefined;
    return buildLayer(layer, sourceId, sourceType);
};

/**
 * 把 StructuredLayerConfig[] 构造成 “可直接 addLayer 的 layerSpec 列表”。
 *
 * 规则：
 * - 不会因为 visible=false 而跳过：我们通过 layout.visibility='none' 实现隐藏（保持结构稳定）
 * - buildMapLibreLayerSpec 返回 null：记录 issues 并跳过
 *
 * 顺序说明：
 * - 输出的 layerSpecs 顺序与输入 layers 顺序保持一致；
 * - 如果你按该顺序逐个调用 map.addLayer，最终渲染顺序与数组一致（后面的 layer 覆盖前面的 layer）。
 */
export const buildMapLibreLayerSpecList = (
    layers: StructuredLayerConfig[],
    resolveSourceId: ResolveLayerSourceId,
    resolveSourceType?: ResolveSourceTypeById
): BuildLayerSpecListResult => {
    const layerSpecs: any[] = [];
    const issues: LayerIssue[] = [];

    layers.forEach((layer) => {
        const spec = buildMapLibreLayerSpec(layer, resolveSourceId, resolveSourceType);
        if (!spec) {
            issues.push({layerId: layer?.id ?? '', message: `layer（${layer?.id ?? ''}）无法生成 layer spec（缺少 sourceRef 或 source 不存在）`});
            return;
        }
        layerSpecs.push(spec);
    });

    return {layerSpecs, issues};
};

/**
 * 查询：判断地图上是否存在某个 layer。
 */
export const hasMapLibreLayer = (map: MapLibreMap, layerId: string): boolean => {
    try {
        return Boolean(map.getLayer(layerId));
    } catch {
        return false;
    }
};

/**
 * 查询：获取地图上的 layer（返回 MapLibre 的 layer spec 或 null）。
 */
export const getMapLibreLayer = (map: MapLibreMap, layerId: string) => {
    try {
        return map.getLayer(layerId) as any;
    } catch {
        return null;
    }
};

/**
 * 新增：向 map 添加一个 layer。
 *
 * 参数：
 * - layerSpec：由 buildLayer/buildMapLibreLayerSpec 生成的 spec
 * - beforeId：可选，用于插入到指定 layer 之前（控制渲染顺序）
 *
 * 注意：
 * - 如果 id 已存在，map.addLayer 会抛错；这里捕获异常并返回 false
 */
export const addMapLibreLayer = (map: MapLibreMap, layerSpec: any, beforeId?: string): boolean => {
    try {
        map.addLayer(layerSpec as any, beforeId as any);
        return true;
    } catch {
        return false;
    }
};

/**
 * 删除：从 map 移除一个 layer。
 */
export const removeMapLibreLayer = (map: MapLibreMap, layerId: string): boolean => {
    try {
        if (!map.getLayer(layerId))
            return true;
        map.removeLayer(layerId);
        return true;
    } catch {
        return false;
    }
};

/**
 * 修改（通用）：以“重建”的方式更新 layer。
 *
 * 为什么需要重建：
 * - MapLibre 虽然提供 setPaintProperty/setLayoutProperty/setFilter 等细粒度 API，
 *   但要正确 diff 一份结构化 layer 并覆盖所有字段，复杂度较高且容易漏边界。
 * - 对配置面板这种“编辑后立即看到效果”的场景，重建更简单、行为更确定。
 *
 * 注意：
 * - 重建会改变 layer 在 style 中的位置：
 *   - 如果不传 beforeId，会被加到最上层；
 *   - 因此在批量刷新场景建议统一按数组顺序 re-add 来维持顺序。
 */
export const recreateMapLibreLayer = (map: MapLibreMap, layerSpec: any, beforeId?: string): boolean => {
    const layerId = layerSpec?.id ?? '';
    if (typeof layerId !== 'string' || layerId.trim() === '')
        return false;
    if (!removeMapLibreLayer(map, layerId))
        return false;
    return addMapLibreLayer(map, layerSpec, beforeId);
};

/**
 * 增/改（单个）：把一个 StructuredLayerConfig 同步到 map 上。
 *
 * 行为：
 * - spec 无法生成：failed
 * - layer 不存在：add（added）
 * - layer 已存在：重建（recreated）
 *
 * 参数：
 * - beforeId：用于在重建/新增时维持位置（可选）
 */
export const upsertStructuredLayer = (
    map: MapLibreMap,
    layer: StructuredLayerConfig,
    resolveSourceId: ResolveLayerSourceId,
    resolveSourceType?: ResolveSourceTypeById,
    beforeId?: string
): UpsertLayerResult => {
    const layerId = layer?.id ?? '';
    const spec = buildMapLibreLayerSpec(layer, resolveSourceId, resolveSourceType);
    if (!spec)
        return {ok: false, action: 'failed', layerId, message: '无法生成 layer spec'};

    const exists = hasMapLibreLayer(map, layerId);
    if (!exists) {
        const ok = addMapLibreLayer(map, spec, beforeId);
        return {ok, action: ok ? 'added' : 'failed', layerId};
    }

    const ok = recreateMapLibreLayer(map, spec, beforeId);
    return {ok, action: ok ? 'recreated' : 'failed', layerId};
};

/**
 * 增删改查（批量）：把一份 StructuredLayerConfig[] 同步到 map 上，并维护“被本次流程托管的 layerId 列表”。
 *
 * 入参：
 * - prevManagedLayerIds：上一次由该同步流程成功 add 的 layerId 列表
 * - layers：当前配置的 StructuredLayerConfig[]
 * - resolveSourceId/resolveSourceType：用于把结构化 layer 解析为 MapLibre layer spec
 *
 * 输出：
 * - managedLayerIds：本次成功纳管的 layerId 列表（用于下一次调用时删除旧 layer）
 * - issues：layer spec 构建阶段的提示
 * - results：每个 layer 的 upsert 结果
 *
 * 顺序要求：
 * - 如果你的刷新流程同时包含 sources：
 *   - 先清理旧 layers（removeLayer）→ 再清理旧 sources（removeSource）→ 再 addSource → 再 syncLayers
 * - 这样能避免 “source 被 layer 引用导致 removeSource 失败” 的问题。
 */
export const syncManagedLayers = (
    map: MapLibreMap,
    layers: StructuredLayerConfig[],
    resolveSourceId: ResolveLayerSourceId,
    resolveSourceType?: ResolveSourceTypeById,
    prevManagedLayerIds: string[] = []
): SyncLayersResult => {
    const normalized = normalizeStructuredLayers(layers);
    const {layerSpecs, issues} = buildMapLibreLayerSpecList(normalized.layers, resolveSourceId, resolveSourceType);

    for (let i = prevManagedLayerIds.length - 1; i >= 0; i--) {
        removeMapLibreLayer(map, prevManagedLayerIds[i]);
    }

    const managedLayerIds: string[] = [];
    const results: UpsertLayerResult[] = [];

    for (let i = 0; i < layerSpecs.length; i++) {
        const spec = layerSpecs[i];
        const ok = addMapLibreLayer(map, spec);
        const layerId = spec?.id ?? '';
        results.push({ok, action: ok ? 'added' : 'failed', layerId});
        if (ok)
            managedLayerIds.push(layerId);
    }

    return {managedLayerIds, issues: [...normalized.issues, ...issues], results};
};
