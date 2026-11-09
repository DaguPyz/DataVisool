/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import { StructuredSourceConfig } from '@datavisool/sdk/types';
import { Map as MapLibreMap, SourceSpecification } from 'maplibre-gl';

export type SourceIssue = {
    sourceId: string;
    message: string;
};

export type NormalizeStructuredSourcesResult = {
    sources: StructuredSourceConfig[];
    issues: SourceIssue[];
};

export type BuildSourceSpecMapResult = {
    specById: Map<string, SourceSpecification>;
    issues: SourceIssue[];
};

export type UpsertSourceResult = {
    ok: boolean;
    action: 'added' | 'recreated' | 'updated' | 'skipped' | 'failed';
    sourceId: string;
    message?: string;
};

export type SyncSourcesResult = {
    managedSourceIds: string[];
    issues: SourceIssue[];
    results: UpsertSourceResult[];
};

/**
 * 生成一个最小合法的 GeoJSON FeatureCollection。
 *
 * 说明：
 * - GeoJSONSource.setData(...) 最终只要拿到 FeatureCollection 就可以稳定工作
 * - 该方法用于：空占位、容错回退、以及 geojson dataMode=dataConfig 的“先建 source 再异步注入数据”
 */
export const emptyFeatureCollection = () => ({
    type: 'FeatureCollection',
    features: []
});

/**
 * 将任意输入尽量规范化为 GeoJSON FeatureCollection（永不抛错）。
 *
 * 为什么要做 normalize：
 * - 地图数据来自多种来源：面板 inline JSON、业务接口返回、数据源体系推送等
 * - 一旦传入非法对象，maplibre 内部可能抛错并导致后续渲染/事件异常
 *
 * 支持的输入：
 * - string：尝试 JSON.parse
 * - FeatureCollection：原样返回
 * - Feature：包一层变成 FeatureCollection
 * - {features: []}：包一层变成 FeatureCollection
 */
export const normalizeGeoJson = (input: any) => {
    let data = input;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return input;
        }
    }

    if (!data || typeof data !== 'object')
        return emptyFeatureCollection();

    if ((data as any).type === 'FeatureCollection' && Array.isArray((data as any).features))
        return data;

    if ((data as any).type === 'Feature' && (data as any).geometry)
        return { type: 'FeatureCollection', features: [data] };

    if (Array.isArray((data as any).features))
        return { type: 'FeatureCollection', features: (data as any).features };

    return emptyFeatureCollection();
};

/**
 * 从组件配置里拿到 sources，并做最基础的“类型安全兜底”。
 *
 * 约束：
 * - 本组件是新实现，不做历史结构迁移（不接受对象形式的 sources、不解析 urlTemplate 等旧字段）
 * - 这里的目的仅仅是：防御外部传入非数组/数组项非对象的情况，避免运行时爆炸
 */
export const normalizeStructuredSources = (sources: any): NormalizeStructuredSourcesResult => {
    if (!Array.isArray(sources))
        return { sources: [], issues: [] };

    const next: StructuredSourceConfig[] = [];
    const issues: SourceIssue[] = [];

    sources.forEach((s, idx) => {
        if (!s || typeof s !== 'object') {
            issues.push({ sourceId: '', message: `sources[${idx}] 不是对象，已忽略` });
            return;
        }
        const id = (s as any).id;
        if (typeof id !== 'string' || id.trim() === '') {
            issues.push({ sourceId: '', message: `sources[${idx}] 缺少 id，已忽略` });
            return;
        }
        next.push(s as StructuredSourceConfig);
    });

    return { sources: next, issues };
};

/**
 * 把一个 StructuredSourceConfig 转换成 MapLibre `map.addSource(id, spec)` 所需的 source spec。
 *
 * 返回 null 的场景：
 * - 缺少 MapLibre 运行时必填字段（例如 image/video/canvas 的 url/urls/canvasId/coordinates）
 *
 * 重要说明（关于 geojson dataMode）：
 * - empty：spec.data 为 emptyFeatureCollection()
 * - url：spec.data 为 dataUrl（字符串 URL，交给 MapLibre 自己去拉取）
 * - inline：spec.data 为 dataJson（对象）
 * - dataConfig：spec.data 仍然是 emptyFeatureCollection()，真实数据由外部数据源体系拉取后调用 setGeoJsonSourceData 注入
 */
export const buildMapLibreSourceSpec = (src: StructuredSourceConfig): SourceSpecification | null => {
    const st = src.sourceType;
    if (!st)
        return null;

    const base: any = { type: st };

    const applyTiledSourceOptions = () => {
        if (typeof src.minzoom === 'number')
            base.minzoom = src.minzoom;
        if (typeof src.maxzoom === 'number')
            base.maxzoom = src.maxzoom;
        if ((src as any).attribution)
            base.attribution = (src as any).attribution;
        if ((src as any).bounds)
            base.bounds = (src as any).bounds;
        if (typeof (src as any).volatile === 'boolean')
            base.volatile = (src as any).volatile;
    };

    if (st === 'geojson') {
        const mode = (src as any).dataMode ?? 'empty';
        let data: any = emptyFeatureCollection();
        if (mode === 'url' && (src as any).dataUrl)
            data = (src as any).dataUrl;
        if (mode === 'inline' && (src as any).dataJson)
            data = (src as any).dataJson;
        if (mode === 'dataConfig' && src.dataConfig) {
            data = src.dataConfig.value
        }
        base.data = typeof data === 'string' ? data : normalizeGeoJson(data);

        if (typeof src.maxzoom === 'number')
            base.maxzoom = src.maxzoom;
        if ((src as any).attribution)
            base.attribution = (src as any).attribution;
        if (typeof (src as any).cluster === 'boolean')
            base.cluster = (src as any).cluster;
        if (typeof (src as any).clusterRadius === 'number')
            base.clusterRadius = (src as any).clusterRadius;
        if (typeof (src as any).clusterMaxZoom === 'number')
            base.clusterMaxZoom = (src as any).clusterMaxZoom;
        if ((src as any).clusterProperties != null)
            base.clusterProperties = (src as any).clusterProperties;
        if (typeof (src as any).generateId === 'boolean')
            base.generateId = (src as any).generateId;
        if ((src as any).promoteId != null)
            base.promoteId = (src as any).promoteId;
        if (typeof (src as any).buffer === 'number')
            base.buffer = (src as any).buffer;
        if (typeof (src as any).tolerance === 'number')
            base.tolerance = (src as any).tolerance;
        if (typeof (src as any).lineMetrics === 'boolean')
            base.lineMetrics = (src as any).lineMetrics;
    }

    if (st === 'vector') {
        applyTiledSourceOptions();
        if ((src as any).url)
            base.url = (src as any).url;
        if ((src as any).tiles)
            base.tiles = (src as any).tiles;
        if ((src as any).scheme)
            base.scheme = (src as any).scheme;
        if ((src as any).promoteId != null)
            base.promoteId = (src as any).promoteId;
    }

    if (st === 'raster') {
        applyTiledSourceOptions();
        if ((src as any).url)
            base.url = (src as any).url;
        if ((src as any).tiles)
            base.tiles = (src as any).tiles;
        if ((src as any).tileSize)
            base.tileSize = (src as any).tileSize;
        if ((src as any).scheme)
            base.scheme = (src as any).scheme;
    }

    if (st === 'raster-dem') {
        applyTiledSourceOptions();
        if ((src as any).url)
            base.url = (src as any).url;
        if ((src as any).tiles)
            base.tiles = (src as any).tiles;
        if ((src as any).tileSize)
            base.tileSize = (src as any).tileSize;
        if ((src as any).scheme)
            base.scheme = (src as any).scheme;
        if ((src as any).encoding)
            base.encoding = (src as any).encoding;
    }

    if (st === 'image') {
        if (!(src as any).url || !(src as any).coordinates)
            return null;
        base.url = (src as any).url;
        base.coordinates = (src as any).coordinates;
    }

    if (st === 'video') {
        if (!(src as any).urls || !(src as any).coordinates)
            return null;
        base.urls = (src as any).urls;
        base.coordinates = (src as any).coordinates;
    }

    if (st === 'canvas') {
        if (!(src as any).canvasId || !(src as any).coordinates)
            return null;
        base.canvas = (src as any).canvasId;
        base.coordinates = (src as any).coordinates;
    }

    return base as any;
};

/**
 * 把 StructuredSourceConfig[] 构造成 “可直接 addSource 的 spec 映射表”。
 *
 * 输出：
 * - specById：Map<sourceId, spec>
 * - issues：缺失必填字段导致无法构建 spec 的提示（用于 UI/日志）
 *
 * 规则：
 * - visible=false：跳过（不参与 specById，也不会产出 issues）
 * - buildMapLibreSourceSpec=null：记录 issues 并跳过
 */
export const buildMapLibreSourceSpecMap = (sources: StructuredSourceConfig[]): BuildSourceSpecMapResult => {
    const specById = new Map<string, SourceSpecification>();
    const issues: SourceIssue[] = [];

    sources.forEach((src) => {
        if (!src || src.visible === false)
            return;
        const sourceId = src.id;
        if (typeof sourceId !== 'string' || sourceId.trim() === '')
            return;
        const spec = buildMapLibreSourceSpec(src);
        if (!spec) {
            issues.push({ sourceId, message: `${src.name ?? '数据源'}（${sourceId}）缺少必填字段，无法生成 source spec` });
            return;
        }
        specById.set(sourceId, spec);
    });

    return { specById, issues };
};

/**
 * 查询：判断地图上是否存在某个 source。
 */
export const hasMapLibreSource = (map: MapLibreMap, sourceId: string): boolean => {
    try {
        return Boolean(map.getSource(sourceId));
    } catch {
        return false;
    }
};

/**
 * 查询：获取地图上的 source 实例（可能为 null）。
 */
export const getMapLibreSource = (map: MapLibreMap, sourceId: string) => {
    try {
        return map.getSource(sourceId) as any;
    } catch {
        return null;
    }
};

/**
 * 新增：向 map 添加一个 source。
 *
 * 注意：
 * - 如果同名 source 已存在，map.addSource 会抛错；这里会捕获异常并返回 false
 */
export const addMapLibreSource = (map: MapLibreMap, sourceId: string, spec: SourceSpecification): boolean => {
    try {
        map.addSource(sourceId, spec as any);
        return true;
    } catch {
        return false;
    }
};

/**
 * 删除：从 map 移除一个 source。
 *
 * 重要限制：
 * - 如果有任何 layer 仍然引用该 source，map.removeSource 会抛错
 * - 因此在“刷新 sources/layers”流程里必须保证：先 removeLayer，再 removeSource
 */
export const removeMapLibreSource = (map: MapLibreMap, sourceId: string): boolean => {
    try {
        if (!map.getSource(sourceId))
            return true;
        map.removeSource(sourceId);
        return true;
    } catch {
        return false;
    }
};

/**
 * 修改（GeoJSON 特例）：给一个已存在的 geojson source 注入数据（setData）。
 *
 * 说明：
 * - 这是 MapLibre 支持的“原地更新”方式，适用于 dataMode=dataConfig 或业务侧持续推送数据
 * - 该方法会做 normalizeGeoJson 防御，确保 setData 入参合法
 */
export const setGeoJsonSourceData = (map: MapLibreMap, sourceId: string, data: any): boolean => {
    try {
        const src = map.getSource(sourceId) as any;
        if (!src || typeof src.setData !== 'function')
            return false;
        src.setData(normalizeGeoJson(data));
        return true;
    } catch {
        return false;
    }
};

/**
 * 修改（通用）：以“重建”的方式更新 source。
 *
 * 为什么需要重建：
 * - MapLibre 大部分 source 属性（tiles/url/cluster/...）在 addSource 之后没有对应的 setter
 * - 因此“修改配置”通常只能通过 removeSource + addSource 实现
 *
 * 使用前提：
 * - 调用方必须确保引用该 source 的 layers 已经被移除（否则 removeSource 会失败）
 */
export const recreateMapLibreSource = (map: MapLibreMap, sourceId: string, spec: SourceSpecification): boolean => {
    if (!removeMapLibreSource(map, sourceId))
        return false;
    return addMapLibreSource(map, sourceId, spec);
};

/**
 * 增/改（单个）：把一个 StructuredSourceConfig 同步到 map 上。
 *
 * 行为：
 * - visible=false：不操作（返回 skipped）
 * - spec 无法生成：返回 failed
 * - source 不存在：addSource（added）
 * - source 已存在：
 *   - 若是 geojson 且 existing 支持 setData：仅更新 data 字段（updated）
 *   - 其他情况：重建（recreated）
 *
 * 注意：
 * - “重建”要求 layer 已先被移除，否则会失败；调用方应在刷新流程里保证顺序
 */
export const upsertStructuredSource = (map: MapLibreMap, src: StructuredSourceConfig): UpsertSourceResult => {
    const sourceId = src?.id ?? '';
    if (!src || src.visible === false)
        return { ok: true, action: 'skipped', sourceId };

    const spec = buildMapLibreSourceSpec(src);
    if (!spec)
        return { ok: false, action: 'failed', sourceId, message: '缺少必填字段，无法生成 spec' };

    const exists = hasMapLibreSource(map, sourceId);
    if (!exists) {
        const ok = addMapLibreSource(map, sourceId, spec);
        return { ok, action: ok ? 'added' : 'failed', sourceId };
    }

    if (src.sourceType === 'geojson') {
        const data = (spec as any).data;
        const updated = setGeoJsonSourceData(map, sourceId, data);
        if (updated)
            return { ok: true, action: 'updated', sourceId };
    }

    const ok = recreateMapLibreSource(map, sourceId, spec);
    return { ok, action: ok ? 'recreated' : 'failed', sourceId };
};

/**
 * 增删改查（批量）：把一份 StructuredSourceConfig[] 同步到 map 上，并维护“被本次流程托管的 sourceId 列表”。
 *
 * 入参：
 * - prevManagedSourceIds：上一次由该同步流程成功 add 的 sourceId 列表
 * - sources：当前配置的 StructuredSourceConfig[]（建议先用 normalizeStructuredSources 做兜底）
 *
 * 输出：
 * - managedSourceIds：本次成功纳管的 sourceId 列表（用于下一次调用时删除旧 source）
 * - issues：spec 构建阶段的缺失提示
 * - results：每个 source 的 upsert 结果（added/updated/recreated/failed/skipped）
 *
 * 顺序要求（非常重要）：
 * - 若你的刷新流程同时包含 layers：必须先 removeLayer，再 removeSource；
 *   因此通常的调用顺序是：先清理 layers → syncSources → 再 addLayer
 */
export const syncManagedSources = (map: MapLibreMap, sources: StructuredSourceConfig[], prevManagedSourceIds: string[] = []): SyncSourcesResult => {
    const normalized = normalizeStructuredSources(sources);
    const { specById, issues } = buildMapLibreSourceSpecMap(normalized.sources);

    const desiredIds = new Set<string>(Array.from(specById.keys()));
    const managedSourceIds: string[] = [];
    const results: UpsertSourceResult[] = [];

    for (let i = 0; i < prevManagedSourceIds.length; i++) {
        const id = prevManagedSourceIds[i];
        if (!desiredIds.has(id))
            removeMapLibreSource(map, id);
    }

    normalized.sources.forEach((src) => {
        if (!src || src.visible === false)
            return;
        if (!specById.has(src.id))
            return;
        const r = upsertStructuredSource(map, src);
        results.push(r);
        if (r.ok && r.action !== 'skipped')
            managedSourceIds.push(src.id);
    });

    return { managedSourceIds, issues: [...normalized.issues, ...issues], results };
};
