/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import AbstractDesignerController from "@/framework/core/AbstractDesignerController.ts";
import MapLibreGisComponent, { MapLibreGisComponentProps, MapLibreGisComponentRef } from "./MapLibreGisComponent.tsx";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {ObjectUtil} from "@datavisool/sdk";
import type {UpdateOptions} from "@datavisool/sdk/types";
import ComponentDataUpdater from "@/framework/core/tools/ComponentDataUpdater.ts";
import { StructuredLayerConfig, StructuredSourceConfig } from "@datavisool/sdk/types";
import { GeoJSONSource, Map as MapLibreMap, SourceSpecification } from "maplibre-gl";
import { DesignerMode } from "@datavisool/sdk/types";
import {
    buildMapLibreSourceSpec,
    emptyFeatureCollection,
    normalizeGeoJson,
    normalizeStructuredSources
} from "./source/SourceTools.ts";
import {
    applyCamera,
    applyCameraConstraints,
    applyInteraction,
    applyLight,
    applyProjection,
    applySky,
    resolveBaseStyle
} from "./runtime/MapLibreGisMapRuntime.ts";
import { buildLayer } from "./layer/LayerTools.ts";

type LayerUpdater = {
    layerId: string;
    updater: ComponentDataUpdater;
};

type SourceUpdater = {
    sourceId: string;
    updater: ComponentDataUpdater;
};

/**
 * MapLibre GIS 组件的 Controller（设计器/运行态统一入口）
 *
 * 当前实现的核心思想：
 * - 配置面板仍然调用 controller.update(...) 产出新的配置片段
 * - controller.update 负责 merge/normalize/migrate，并把最终 config 存在 controller.config 中（单一事实源）
 * - controller 不再通过 React 重新渲染来驱动地图更新
 * - 地图效果更新通过 getMap() 直接调用 map 实例 API（见 MapLibreGisMapRuntime.ts）
 *
 * 责任边界：
 * - MapLibreGisComponent：只负责创建/销毁 map + 事件桥（loaded/styleLoaded/click 等）
 * - MapLibreGisController：负责把 config 应用到 map（camera/projection/interaction/sky/light）以及管理 sources/layers 的增删
 */
export default class MapLibreGisController extends AbstractDesignerController<MapLibreGisComponentRef, MapLibreGisComponentProps> {
    private layerUpdaters: LayerUpdater[] = [];
    private sourceUpdaters: SourceUpdater[] = [];
    private layerErrDom: HTMLElement | null = null;
    private managedLayerIds: string[] = [];
    private managedSourceIds: string[] = [];
    private managedKey: string = '';
    private baseStyleKey: string = '';
    private pendingLayersRefresh = false;

    /**
     * 创建组件实例（MapLibreGisComponent）并建立事件桥。
     * - loaded：map.load 后触发，用于 apply 基础配置 + 首次挂载 layers/sources
     * - styleLoaded：map.style.load 后触发，用于 setProjection / sky / light 等依赖 style 的能力
     *
     * 额外在 create() 末尾主动调用一次 apply/refresh：
     * - 兼容“事件先触发后绑定”或“map 已经 ready 但没有回调”的时序问题
     */
    async create(container: HTMLElement, config: MapLibreGisComponentProps, executor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, executor, index);
        this.instance = await ComponentUtil.createAndRender<MapLibreGisComponentRef>(container, MapLibreGisComponent, config);
    }

    destroy(): void {
        this.layerUpdaters.forEach(u => u.updater.destroy());
        this.layerUpdaters = [];
        this.sourceUpdaters.forEach(u => u.updater.destroy());
        this.sourceUpdaters = [];
        this.layerErrDom?.remove();
        this.layerErrDom = null;
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): MapLibreGisComponentProps | null {
        return this.config;
    }

    /**
     * 从当前 map 读取 projection（若运行时支持）。
     */
    readCurrentProjection(): any | null {
        const map = this.getMap();
        if (!map)
            return null;
        try {
            return map.getProjection();
        } catch (e) {
            console.error('[MapLibreGisController] readCurrentProjection failed', e);
            return null;
        }
    }

    /**
     * 核心更新入口：配置面板会频繁调用。
     *
     * 处理步骤：
     * 1) merge 到 controller.config
     * 2) 不在这里触发地图更新（编辑态的实时效果由各配置面板自行调用 map API）
     */
    update(config: MapLibreGisComponentProps, upOp?: UpdateOptions | undefined): void {
        void upOp;
        this.config = ObjectUtil.merge(this.config, config);
    }

    /**
     * 强制重建 map。
     * - 用于处理“某些参数没有可靠的运行时 setter”或“setStyle 不稳定”的兜底场景
     */
    public refreshMap = () => {
        this.instance?.recreateMap(this.config ?? undefined);
    }

    public hasActiveMap(): boolean {
        return !!this.instance?.getMap();
    }

    /**
     * 注册蓝图事件系统所需的事件桥。
     * - 同样在末尾主动 apply/refresh 一次，避免时序错过
     */
    registerEvent(): void {
        const nodeId = this.config?.base?.id ?? '';
        const executor = this.bpExecutor;
        this.instance?.setEventHandler({
            loaded: () => {
                this.applyConfigToMap(true);
                this.refreshLayersAndData(true);
                executor?.triggerComponentEvent(nodeId, 'loaded', this.config, this.index);
            },
            styleLoaded: () => {
                this.applyStyleDependentConfigToMap();
                this.refreshLayersAndData(true);
            },
            click: (payload: any) => executor?.triggerComponentEvent(nodeId, 'click', payload, this.index),
            featureClick: (payload: any) => executor?.triggerComponentEvent(nodeId, 'featureClick', payload, this.index),
            moveEnd: (payload: any) => executor?.triggerComponentEvent(nodeId, 'moveEnd', payload, this.index),
            zoomEnd: (payload: any) => executor?.triggerComponentEvent(nodeId, 'zoomEnd', payload, this.index),
        });
        this.applyConfigToMap(true);
    }

    changeData(data: any): void {
        const map = this.getMap();
        if (!map)
            return;

        const layerId = data?.layerId;
        const payload = data?.data ?? data;
        if (!layerId || typeof layerId !== 'string')
            return;

        const layer = ((this.config as any)?.style?.layers ?? []).find((item: StructuredLayerConfig) => item?.id === layerId);
        const explicitSourceRef = typeof layer?.sourceRef === 'string' && layer.sourceRef.trim() !== '' ? layer.sourceRef : '';
        const sourceId = explicitSourceRef || this.getSourceId(layerId);
        const sourceConfigs = this.normalizeSources((this.config as any)?.style?.sources);
        const sourceType = explicitSourceRef
            ? sourceConfigs.find((source) => source.id === explicitSourceRef)?.sourceType
            : 'geojson';

        if (explicitSourceRef && !map.getSource(sourceId))
            return;
        if (!explicitSourceRef && !this.ensureFallbackGeoJsonSource(map, sourceId))
            return;

        const source = map.getSource(sourceId) as GeoJSONSource | undefined;
        if (!source || typeof (source as any).setData !== 'function')
            return;
        if (layer && !map.getLayer(layerId)) {
            const mlLayer = buildLayer(layer, sourceId, sourceType);
            if (mlLayer) {
                try {
                    map.addLayer(mlLayer as any);
                    this.trackManagedLayer(map, layerId);
                } catch (e) {
                    console.error(`[MapLibreGisController] map.addLayer failed: ${layerId}`, e);
                }
            }
        }
        const geojson = normalizeGeoJson(payload);
        try {
            source.setData(geojson as any);
        } catch {
            return;
        }
    }

    changeSourceData(data: any): void {
        const map = this.getMap();
        if (!map)
            return;

        const sourceId = data?.sourceId;
        const payload = data?.data ?? data;
        if (!sourceId || typeof sourceId !== 'string')
            return;

        const source = map.getSource(sourceId) as GeoJSONSource | undefined;
        if (!source)
            return;
        const geojson = normalizeGeoJson(payload);
        try {
            source.setData(geojson as any);
        } catch {
            return;
        }
    }

    loadComponentData(): void {
        this.refreshLayersAndData(true);
    }

    /**
     * 将“结构化数据源配置”统一规范化为数组形式。
     * - 外部输入可能是对象/数组/混合结构，normalizeStructuredSources 会负责转换和记录 issues
     */
    private normalizeSources = (raw: any): StructuredSourceConfig[] => {
        return normalizeStructuredSources(raw).sources;
    };

    /**
     * 生成“base style 的特征 key”，用于检测 style 是否发生变化。
     * - styleUrl：使用 url:<url>
     *
     * 用途：
     * - 当 base style 变化时需要 map.setStyle(...)，否则 projection/sky/light 以及 layers/sources 可能要重新补齐
     */
    private buildBaseStyleKey = (cfg?: MapLibreGisComponentProps | null): string => {
        const base = (cfg as any)?.style?.base;
        if (base?.styleUrl && base.styleUrl.trim() !== '')
            return `url:${base.styleUrl}`;
        return 'empty';
    };

    /**
     * 应用依赖 style 的配置（projection / sky / light）。
     *
     * 为什么不只依赖 map.isStyleLoaded：
     * - isStyleLoaded 的语义比“可渲染”更严格，某些资源失败会导致它长期为 false
     * - 因此这里采用“尝试 apply + 失败后在后续时机重试”的策略
     */
    private applyStyleDependentConfigToMap = () => {
        const map = this.getMap();
        if (!map || !this.config)
            return;
        const tryApply = () => {
            try {
                applyProjection(map, (this.config as any)?.style?.projection);
            } catch (e) {
                console.error('[MapLibreGisController] applyProjection failed', e);
                return false;
            }
            try {
                applySky(map, resolveBaseStyle((this.config as any)?.style), (this.config as any)?.style?.sky);
            } catch (e) {
                console.error('[MapLibreGisController] applySky failed', e);
            }
            try {
                applyLight(map, (this.config as any)?.style?.light);
            } catch (e) {
                console.error('[MapLibreGisController] applyLight failed', e);
            }
            return true;
        };

        if (tryApply())
            return;

        requestAnimationFrame(() => {
            tryApply();
        });

        try {
            map.once('style.load', () => {
                tryApply();
            });
        } catch (e) {
            console.error('[MapLibreGisController] map.once(style.load) failed', e);
        }
        try {
            map.once('idle', () => {
                tryApply();
            });
        } catch (e) {
            console.error('[MapLibreGisController] map.once(idle) failed', e);
        }
    };

    /**
     * 把 controller.config 的“效果类配置”应用到 map 上。
     *
     * - style 变化：优先 map.setStyle(...)；失败时 fallback 为 refreshMap 重建
     * - camera/cameraConstraints：直接调用 applyCamera/applyCameraConstraints
     * - interaction：直接调用 applyInteraction（可选先 resize，避免容器尺寸变化时的交互异常）
     * - projection/sky/light：交给 applyStyleDependentConfigToMap（内部有重试）
     */
    private applyConfigToMap = (withResize?: boolean, prevConfig?: MapLibreGisComponentProps | null) => {
        const map = this.getMap();
        if (!map || !this.config)
            return;

        const nextStyleKey = this.buildBaseStyleKey(this.config);
        const prevStyleKey = prevConfig ? this.buildBaseStyleKey(prevConfig) : this.baseStyleKey;
        const styleChanged = prevStyleKey !== '' && nextStyleKey !== prevStyleKey;
        this.baseStyleKey = nextStyleKey;

        if (styleChanged) {
            this.refreshMap();
            return;
        }

        try {
            applyCameraConstraints(map, (this.config as any)?.style?.camera?.constraints);
        } catch (e) {
            console.error('[MapLibreGisController] applyCameraConstraints failed', e);
        }
        try {
            applyCamera(map, (this.config as any)?.style?.camera);
        } catch (e) {
            console.error('[MapLibreGisController] applyCamera failed', e);
        }

        const applyInteractionNow = () => {
            try {
                applyInteraction(map, (this.config as any)?.style?.interaction);
            } catch (e) {
                console.error('[MapLibreGisController] applyInteraction failed', e);
            }
        };

        if (withResize) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    try {
                        map.resize();
                    } catch (e) {
                        console.error('[MapLibreGisController] map.resize failed', e);
                    }
                    applyInteractionNow();
                    this.applyStyleDependentConfigToMap();
                });
            });
        } else {
            applyInteractionNow();
            this.applyStyleDependentConfigToMap();
        }

        if (prevConfig) {
            const prevInteraction = (prevConfig as any)?.style?.interaction;
            const nextInteraction = (this.config as any)?.style?.interaction;
            const clickToleranceChanged = (prevInteraction?.clickTolerance ?? undefined) !== (nextInteraction?.clickTolerance ?? undefined);
            const bearingSnapChanged = (prevInteraction?.bearingSnap ?? undefined) !== (nextInteraction?.bearingSnap ?? undefined);
            if (clickToleranceChanged && !(map as any).setClickTolerance)
                this.refreshMap();
            else if (bearingSnapChanged && !(map as any).setBearingSnap)
                this.refreshMap();
        }
    };

    /**
     * 刷新“运行态的 sources/layers 与数据 updater”。
     *
     * 触发时机：
     * - map loaded / styleLoaded 之后
     * - 配置 update() 后（在 applyConfigToMap 之后调用）
     *
     * 关键约束：
     * - 仅在 style 已加载完成（map.isStyleLoaded()）时执行；
     *   否则 addSource/addLayer 可能失败，且后续 style 变化会覆盖当前注入的资源。
     *
     * 执行顺序：
     * 1) applyLayers：清理并重新注入 sources/layers（或在 key 未变化时跳过）
     * 2) restartSourceUpdaters：重建 GeoJSON 的动态数据拉取器（dataMode=dataConfig）
     * 3) restartLayerUpdaters：重建图层级的动态数据拉取器（当前实现为空占位）
     *
     * force：
     * - true：忽略内部“是否变化”的判定，强制刷新
     */
    private refreshLayersAndData = (force?: boolean) => {
        const map = this.getMap();
        if (!map)
            return;

        const isReady = map.isStyleLoaded();
        if (!isReady) {
            if (!this.pendingLayersRefresh) {
                this.pendingLayersRefresh = true;
                const retry = () => {
                    this.pendingLayersRefresh = false;
                    this.refreshLayersAndData(true);
                };
                try {
                    map.once('load', retry);
                } catch (e) {
                    console.error('[MapLibreGisController] map.once(load) failed', e);
                }
                try {
                    map.once('style.load', retry);
                } catch (e) {
                    console.error('[MapLibreGisController] map.once(style.load) failed', e);
                }
                try {
                    map.once('idle', retry);
                } catch (e) {
                    console.error('[MapLibreGisController] map.once(idle) failed', e);
                }
            }
            return;
        }

        this.applyLayers(force);
        this.restartSourceUpdaters(force);
        this.restartLayerUpdaters(force);
    }

    /**
     * 获取当前 MapLibre map 实例。
     * - 可能为 null（尚未创建、被 refreshMap 重建中、或已销毁）
     */
    public getMap = (): MapLibreMap | null => {
        return this.instance?.getMap() ?? null;
    }

    /**
     * 生成“图层 → 默认数据源”映射的 sourceId。
     *
     * 说明：
     * - 当某个 layer 没有显式配置 sourceRef 时，会使用该规则生成一个稳定的默认 sourceId
     * - 用于兼容历史结构（layer.source 内联）以及最小化配置缺失时的行为
     */
    private getSourceId = (layerId: string) => `ml_src_${layerId}`;

    private getRuntimeManagedLayerIds = (map: MapLibreMap): Set<string> => {
        return ((map as any).__mlgisManagedLayerIds ??= new Set<string>());
    };

    private getRuntimeManagedSourceIds = (map: MapLibreMap): Set<string> => {
        return ((map as any).__mlgisManagedSourceIds ??= new Set<string>());
    };

    private trackManagedLayer = (map: MapLibreMap, layerId: string) => {
        if (!this.managedLayerIds.includes(layerId))
            this.managedLayerIds.push(layerId);
        this.getRuntimeManagedLayerIds(map).add(layerId);
    };

    private trackManagedSource = (map: MapLibreMap, sourceId: string) => {
        if (!this.managedSourceIds.includes(sourceId))
            this.managedSourceIds.push(sourceId);
        this.getRuntimeManagedSourceIds(map).add(sourceId);
    };

    /**
     * 清理本 controller 托管（managed）的运行态资源。
     *
     * managedLayerIds/managedSourceIds 由 applyLayers 在 add 成功后写入，用于下一次刷新时清理。
     *
     * 注意点：
     * - 先 removeLayer 再 removeSource（MapLibre 要求 source 被 layer 引用时不能移除）
     * - 从后往前删除，避免数组删除时索引变化
     * - 全程 try/catch，避免个别资源异常导致后续清理中断
     */
    private clearManaged = (map: MapLibreMap) => {
        const runtimeLayerIds = this.getRuntimeManagedLayerIds(map);
        const layerIds = Array.from(new Set([...this.managedLayerIds, ...runtimeLayerIds]));
        for (let i = layerIds.length - 1; i >= 0; i--) {
            const id = layerIds[i];
            if (map.getLayer(id)) {
                try {
                    map.removeLayer(id);
                } catch (e) {
                    console.error(`[MapLibreGisController] map.removeLayer failed: ${id}`, e);
                }
            }
        }
        this.managedLayerIds = [];
        runtimeLayerIds.clear();

        const runtimeSourceIds = this.getRuntimeManagedSourceIds(map);
        const sourceIds = Array.from(new Set([...this.managedSourceIds, ...runtimeSourceIds]));
        for (let i = sourceIds.length - 1; i >= 0; i--) {
            const id = sourceIds[i];
            if (map.getSource(id)) {
                try {
                    map.removeSource(id);
                } catch (e) {
                    console.error(`[MapLibreGisController] map.removeSource failed: ${id}`, e);
                }
            }
        }
        this.managedSourceIds = [];
        runtimeSourceIds.clear();
    }

    private ensureFallbackGeoJsonSource = (map: MapLibreMap, sourceId: string): boolean => {
        if (map.getSource(sourceId)) {
            this.trackManagedSource(map, sourceId);
            return true;
        }
        try {
            map.addSource(sourceId, {
                type: 'geojson',
                data: emptyFeatureCollection(),
            } as SourceSpecification);
            this.trackManagedSource(map, sourceId);
            return true;
        } catch (e) {
            console.error(`[MapLibreGisController] map.addSource failed: ${sourceId}`, e);
            return false;
        }
    };

    /**
     * 将当前 config 中的 sources/layers 注入到 MapLibre map。
     *
     * 设计策略：
     * - 使用 “全量重建” 而非 diff：
     *   每次认为 sources/layers 可能有较大结构变化（增删改/排序），因此先清理再 add
     * - 使用 managedKey（JSON.stringify({sources,layers})）做粗粒度缓存：
     *   在 key 未变化且非 force 的情况下跳过，减少频繁 update 的开销
     *
     * sources 注入：
     * - visible=false：跳过
     * - buildMapLibreSourceSpec 返回 null：表示缺少关键必填字段，跳过
     *
     * layers 注入：
     * - background 层不需要 source
     * - 其他层优先使用 layer.sourceRef；缺省时回退到 getSourceId(layer.id)
     * - 通过 sourceTypeById 给 buildLayer 提供 sourceType，辅助设置 vector 的 source-layer 等字段
     */
    private applyLayers = (force?: boolean) => {
        const map = this.getMap();
        if (!map)
            return;

        const sources = this.normalizeSources((this.config as any)?.style?.sources);
        const layers = (this.config?.style?.layers ?? []) as StructuredLayerConfig[];
        const nextKey = JSON.stringify({ sources, layers });
        const same = !force && nextKey === this.managedKey;
        if (!force && same)
            return;
        this.managedKey = nextKey;

        this.clearManaged(map);

        layers.forEach((layer) => {
            if (layer?.id && map.getLayer(layer.id)) {
                try {
                    map.removeLayer(layer.id);
                } catch (e) {
                    console.error(`[MapLibreGisController] map.removeLayer failed: ${layer.id}`, e);
                }
            }
        });

        sources.forEach((src) => {
            if (src?.id && map.getSource(src.id)) {
                try {
                    map.removeSource(src.id);
                } catch (e) {
                    console.error(`[MapLibreGisController] map.removeSource failed: ${src.id}`, e);
                }
            }
        });

        const sourceTypeById = new Map<string, StructuredSourceConfig['sourceType']>();
        sources.forEach((src) => {
            if (src.visible === false)
                return;
            const spec = buildMapLibreSourceSpec(src);
            if (!spec)
                return;
            try {
                map.addSource(src.id, spec as SourceSpecification);
                sourceTypeById.set(src.id, src.sourceType);
                this.trackManagedSource(map, src.id);
            } catch (e) {
                if (map.getSource(src.id)) {
                    sourceTypeById.set(src.id, src.sourceType);
                    this.trackManagedSource(map, src.id);
                    return;
                }
                console.error(`[MapLibreGisController] map.addSource failed: ${src.id}`, e);
            }
        });

        layers.forEach((layer) => {
            const isBackground = layer.type === 'background';
            let sourceId = isBackground ? '' : (layer.sourceRef ?? '');
            let sourceType = sourceId ? sourceTypeById.get(sourceId) : undefined;
            if (!isBackground && sourceId && !sourceTypeById.has(sourceId))
                return;
            if (!isBackground && !sourceId) {
                sourceId = this.getSourceId(layer.id);
                if (!this.ensureFallbackGeoJsonSource(map, sourceId))
                    return;
                sourceType = 'geojson';
            }
            const mlLayer = buildLayer(layer, sourceId, sourceType);
            if (mlLayer) {
                try {
                    map.addLayer(mlLayer as any);
                    this.trackManagedLayer(map, layer.id);
                } catch (e) {
                    console.error(`[MapLibreGisController] map.addLayer failed: ${layer.id}`, e);
                }
            }
        });
    }


    /**
     * 重建“图层级数据 updater”（当前实现为空占位）。
     *
     * 现状：
     * - next 的计算固定为空（filter(() => false)），因此在 force=false 时永远不会重建
     * - 主要用作结构占位，便于后续扩展“按 layer 拉取数据并写回 paint/layout/filter”等能力
     *
     * 约束：
     * - EDIT 模式直接跳过（避免在编辑器里触发运行态数据拉取）
     */
    private restartLayerUpdaters = (force?: boolean) => {
        if (window.DATAVISOOL_ENV?.mode === DesignerMode.EDIT)
            return;
        const map = this.getMap();
        if (!map)
            return;

        const layers = (this.config?.style?.layers ?? []) as StructuredLayerConfig[];
        const next = layers
            .filter(() => false)
            .map(l => l.id)
            .join(',');
        const prev = this.layerUpdaters.map(u => u.layerId).join(',');
        if (!force && next === prev)
            return;

        this.layerUpdaters.forEach(u => u.updater.destroy());
        this.layerUpdaters = [];
    }

    /**
     * 重建“数据源级数据 updater”（用于 GeoJSON dataMode=dataConfig）。
     *
     * 目标：
     * - 将项目数据源体系（ComponentDataUpdater）拉取到的数据，注入到 map.getSource(id).setData(...)
     * - 仅针对 geojson source，且需要 dataMode=dataConfig 且 dataConfig 存在
     *
     * 编辑器模式策略：
     * - base.previewDataInEditor=false：彻底关闭编辑器中的数据预览，销毁所有 updater
     * - base.previewDataInEditor=true：允许预览，但默认禁止 webSocket/mqtt（避免编辑器里常驻连接）
     *
     * 变更检测：
     * - 将符合条件的 sources 组合成 next key（包含 sourceId + dataConfig JSON），与 prev 对比
     * - 未变化且非 force 时跳过重建，减少频繁 update 带来的 destroy/create 抖动
     */
    private restartSourceUpdaters = (force?: boolean) => {
        const map = this.getMap();
        if (!map)
            return;

        const isEdit = window.DATAVISOOL_ENV?.mode === DesignerMode.EDIT;
        const previewDataInEditor = (this.config as any)?.style?.base?.previewDataInEditor !== false;
        if (isEdit && !previewDataInEditor) {
            this.sourceUpdaters.forEach(u => u.updater.destroy());
            this.sourceUpdaters = [];
            return;
        }

        const sources = this.normalizeSources((this.config as any)?.style?.sources);
        const next = sources
            .filter(s => s.visible !== false && s.sourceType === 'geojson' && (s as any).dataMode === 'dataConfig' && (s as any).dataConfig)
            .map(s => `${s.id}:${JSON.stringify((s as any).dataConfig ?? null)}`)
            .join(',');
        const prev = this.sourceUpdaters.map(u => u.sourceId).join(',');
        if (!force && next === prev)
            return;

        this.sourceUpdaters.forEach(u => u.updater.destroy());
        this.sourceUpdaters = [];

        sources.forEach((src) => {
            if (src.visible === false || src.sourceType !== 'geojson' || (src as any).dataMode !== 'dataConfig' || !(src as any).dataConfig)
                return;

            if (isEdit) {
                const dataCfg = (src as any).dataConfig;
                const st = dataCfg?.sourceType;
                if (st === 'webSocket' || st === 'mqtt')
                    return;
            }

            const updater = new ComponentDataUpdater(
                (data: any) => {
                    if (this.layerErrDom) {
                        this.layerErrDom.remove();
                        this.layerErrDom = null;
                    }
                    this.changeSourceData({ sourceId: src.id, data });
                },
                () => {
                    if (!this.layerErrDom && this.container) {
                        this.layerErrDom = document.createElement('div');
                        this.layerErrDom.classList.add('view-error-message');
                        this.layerErrDom.innerText = '数据加载失败...';
                        this.container.appendChild(this.layerErrDom);
                    }
                },
                this.designerManager?.variableOwner ?? this.designerManager
            );

            this.sourceUpdaters.push({ sourceId: src.id, updater });
            updater.run((src as any).dataConfig!, isEdit);
        });
    }

}
