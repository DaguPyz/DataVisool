/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {ForwardedRef, useCallback, useImperativeHandle, useRef} from 'react';
import maplibregl, {Map as MapLibreMap, MapMouseEvent} from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './MapLibreGisComponent.less';
import {ComponentInfoType} from '@datavisool/sdk/types';
import {IFilterConfigType} from '@datavisool/sdk/types';
import {DataConfigType} from '@datavisool/sdk/types';
import {MapLibreGisComponentStyle} from '@datavisool/sdk/types';
import {
    applyProjection,
    applyTerrain,
    applyLight,
    applySky,
    resolveBaseStyle
} from './runtime/MapLibreGisMapRuntime.ts';
import {parseMapLibreCameraInitOptions} from "./camera/CameraTools.ts";
import {parseMapLibreInteractionHandlersInitOptions} from "./interaction/InteractionTools.ts";
import {buildMapLibreSourceSpecMap, emptyFeatureCollection, normalizeStructuredSources} from "./source/SourceTools.ts";
import {addMapLibreLayer, buildMapLibreLayerSpecList, normalizeStructuredLayers} from "./layer/LayerTools.ts";

(maplibregl as any).setWorkerUrl?.(mapLibreWorkerUrl);

/**
 * MapLibre 地图承载组件（最小化 React 参与度）
 *
 * 该组件刻意不承担“配置驱动渲染”的职责：
 * - 不维护 config state
 * - 不使用 useEffect 去监听配置变更
 *
 * 它只负责三件事：
 * 1) 创建/销毁 map 实例（maplibregl.Map）
 * 2) 把 map 的事件转发给 controller（eventHandlerMap）
 * 3) 通过 ref 暴露 getMap / recreateMap 给 controller 进行命令式更新
 *
 * 这样配置更新链路就可以变成：配置面板 → controller.update → 直接操作 map
 */
export interface MapLibreGisComponentProps {
    base?: ComponentInfoType;
    style?: MapLibreGisComponentStyle;
    data?: DataConfigType;
    filter?: IFilterConfigType;
}

export interface MapLibreGisComponentRef {
    /**
     * controller 注入的事件处理集合。
     * - loaded/styleLoaded 用于时序驱动（apply config、刷新 layers/sources）
     * - click/featureClick/moveEnd/zoomEnd 用于业务事件桥
     */
    setEventHandler: (eventMap: Record<string, (...args: any[]) => any>) => void;
    /**
     * 获取当前 map 实例（可能为 null，表示尚未创建或已销毁）。
     */
    getMap: () => MapLibreMap | null;
    /**
     * 重建 map：用于 base style 或部分无法运行时更新的参数变化时兜底。
     * - nextConfig 可选，用于重建前更新内部引用的 config 快照
     */
    recreateMap: (nextConfig?: MapLibreGisComponentProps) => void;
}

const MapLibreGisComponent = React.forwardRef((props: MapLibreGisComponentProps, ref: ForwardedRef<MapLibreGisComponentRef>) => {
    /**
     * 最近一次 props/config 的快照，用于 recreateMap 时重建。
     * 说明：本组件不靠 props 更新去重建 map（避免频繁 destroy/create）。
     */
    const configRef = useRef<MapLibreGisComponentProps>({...props});
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    /**
     * controller 注入的事件处理表。
     * 这里用 ref 保存，确保 map 事件回调读取到的是“最新的 handler”。
     */
    const eventHandlerMap = useRef<Record<string, (...args: any[]) => any>>({});
    const loadState = useRef({loaded: false, delivered: false});

    const deliverLoaded = useCallback(() => {
        const state = loadState.current;
        const handler = eventHandlerMap.current.loaded;
        if (!state.loaded || state.delivered || !handler) return;
        state.delivered = true;
        handler();
    }, []);

    /**
     * 销毁当前 map。
     * - MapLibre 会移除内部事件监听、释放 WebGL 资源
     */
    const destroyMap = useCallback(() => {
        mapRef.current?.remove();
        mapRef.current = null;
        loadState.current = {loaded: false, delivered: false};
    }, []);

    /**
     * 创建 map 并绑定必要事件。
     * 注意：该方法只使用 cfg 的“初始值”做构造参数；
     * 后续配置变更由 controller 通过 getMap() 命令式应用。
     */
    const initMap = useCallback((container: HTMLDivElement, cfg: MapLibreGisComponentProps) => {
        destroyMap();

        const styleCfg = cfg.style as MapLibreGisComponentStyle | undefined;
        const baseConfig = styleCfg?.base;
        if (!baseConfig)
            return;

        //地图基础样式（styleUrl）
        const mapStyle = resolveBaseStyle(styleCfg);
        //相机初始参数
        const cameraConfig = parseMapLibreCameraInitOptions(styleCfg?.camera);
        //交互初始参数
        const interactionConfig = parseMapLibreInteractionHandlersInitOptions(styleCfg?.interaction);
        /**
         * interactive 必须为 true：
         * - 我们的“总开关”由 applyInteraction 来控制（enable/disable handlers）
         * - 如果在构造期把 interactive=false，部分 handler/事件会直接被 MapLibre 层面禁用，后续难以恢复
         */
        const map = new maplibregl.Map({
            // 地图挂载的 DOM 容器
            container,
            // 必须在构造期开启交互，不然后面无法通过API无刷新重新开启交互
            interactive: true,
            // 底图样式（styleUrl）
            style: mapStyle,
            // 相机初始参数
            ...cameraConfig,
            // 交互初始化参数
            ...interactionConfig
        });

        mapRef.current = map;

        const initSourcesAndLayers = () => {
            const managedSourceIds: Set<string> = ((map as any).__mlgisManagedSourceIds ??= new Set<string>());
            const managedLayerIds: Set<string> = ((map as any).__mlgisManagedLayerIds ??= new Set<string>());
            const {sources} = normalizeStructuredSources((cfg.style as any)?.sources);
            const {specById} = buildMapLibreSourceSpecMap(sources);

            specById.forEach((spec, sourceId) => {
                try {
                    map.addSource(sourceId, spec as any);
                    managedSourceIds.add(sourceId);
                } catch (e) {
                    console.error(`[Error]: MapLibreGisComponent add source ${sourceId} failed`, e);
                }
            });

            const {layerSpecs} = (() => {
                const {layers} = normalizeStructuredLayers((cfg.style as any)?.layers);
                const sourceTypeById = new Map<string, any>();
                sources.forEach((source) => {
                    if (!specById.has(source.id))
                        return;
                    if (!map.getSource(source.id))
                        return;
                    sourceTypeById.set(source.id, (source as any).sourceType);
                });
                return buildMapLibreLayerSpecList(
                    layers,
                    (layer) => {
                        if (layer.type === 'background')
                            return '';
                        const sourceRef = (layer as any).sourceRef ?? '';
                        if (sourceTypeById.has(sourceRef))
                            return sourceRef;
                        if (sourceRef)
                            return '';
                        const fallbackSourceId = `ml_src_${layer.id}`;
                        if (!map.getSource(fallbackSourceId)) {
                            try {
                                map.addSource(fallbackSourceId, {
                                    type: 'geojson',
                                    data: emptyFeatureCollection(),
                                } as any);
                                managedSourceIds.add(fallbackSourceId);
                            } catch (e) {
                                console.error(`[Error]: MapLibreGisComponent add fallback source ${fallbackSourceId} failed`, e);
                                return '';
                            }
                        }
                        sourceTypeById.set(fallbackSourceId, 'geojson');
                        return fallbackSourceId;
                    },
                    (sourceId) => sourceTypeById.get(sourceId)
                );
            })();

            layerSpecs.forEach((ls) => {
                const ok = addMapLibreLayer(map as any, ls as any);
                if (ok)
                    managedLayerIds.add(ls.id);
            });
        };


        /**
         * load：基础资源加载完成，通常意味着可以开始 addSource/addLayer。
         * 这里不直接操作 config，而是转交给 controller。
         */
        map.on('load', () => {
            if (mapRef.current !== map) return;
            initSourcesAndLayers();
            applyTerrain(map, (cfg.style as any)?.terrain);
            loadState.current.loaded = true;
            deliverLoaded();
        });

        /**
         * style.load：style 就绪（尤其是 setStyle 之后）。
         * projection/sky/light 等依赖 style 的能力建议在这个时机尝试应用。
         */
        map.on('style.load', () => {
            applyProjection(map, (cfg.style as any)?.projection);
            applyTerrain(map, (cfg.style as any)?.terrain);
            applySky(map, resolveBaseStyle(cfg.style as any), (cfg.style as any)?.sky);
            applyLight(map, (cfg.style as any)?.light);
            if (eventHandlerMap.current.styleLoaded)
                eventHandlerMap.current.styleLoaded();
        });

        /**
         * click：转发基础点击信息，同时尝试从渲染结果中取第一个 feature 作为 featureClick。
         * 这里不再按“配置层的 layer 列表”做过滤，避免闭包持有旧 config。
         */
        map.on('click', (e: MapMouseEvent) => {
            if (eventHandlerMap.current.click)
                eventHandlerMap.current.click({lngLat: e.lngLat, point: e.point});

            const features = map.queryRenderedFeatures(e.point);
            const feature = features?.[0];
            if (feature && eventHandlerMap.current.featureClick) {
                eventHandlerMap.current.featureClick({
                    lngLat: e.lngLat,
                    point: e.point,
                    layerId: feature.layer?.id,
                    properties: feature.properties,
                    feature
                });
            }
        });

        /**
         * moveend/zoomend：把相机状态回传（常用于联动、保存视角、面板回显等）。
         * 这里做 NaN 防御，避免内部异常时污染上层状态。
         */
        map.on('moveend', () => {
            if (eventHandlerMap.current.moveEnd) {
                const c = map.getCenter();
                if (!Number.isFinite(c.lng) || !Number.isFinite(c.lat))
                    return;
                eventHandlerMap.current.moveEnd({
                    center: [c.lng, c.lat],
                    zoom: map.getZoom(),
                    bearing: map.getBearing(),
                    pitch: map.getPitch()
                });
            }
        });

        map.on('zoomend', () => {
            if (eventHandlerMap.current.zoomEnd) {
                const c = map.getCenter();
                if (!Number.isFinite(c.lng) || !Number.isFinite(c.lat))
                    return;
                eventHandlerMap.current.zoomEnd({
                    center: [c.lng, c.lat],
                    zoom: map.getZoom(),
                    bearing: map.getBearing(),
                    pitch: map.getPitch()
                });
            }
        });

    }, [destroyMap, deliverLoaded]);

    /**
     * ref callback：在 DOM 节点挂载/卸载时创建/销毁 map。
     * - 这是“无 useEffect”的挂载时序替代方案
     */
    const setContainerNode = useCallback((node: HTMLDivElement | null) => {
        containerRef.current = node;
        if (!node) {
            destroyMap();
            return;
        }
        initMap(node, configRef.current);
    }, [destroyMap, initMap]);

    useImperativeHandle(ref, () => ({
        setEventHandler: (eventMap) => {
            eventHandlerMap.current = eventMap;
            deliverLoaded();
        },
        getMap: () => mapRef.current,
        /**
         * 允许 controller 主动重建 map（例如 style 变化或某些参数无法运行时更新时）。
         */
        recreateMap: (nextConfig) => {
            if (nextConfig)
                configRef.current = nextConfig;
            const container = containerRef.current;
            if (!container)
                return;
            initMap(container, configRef.current);
        },
    }));

    const baseConfig = (props.style as MapLibreGisComponentStyle | undefined)?.base;
    if (!baseConfig)
        return <div className={'maplibre-gis'}>
            <div className={'maplibre-gis-empty'}>请配置地图</div>
        </div>;

    return <div className={'maplibre-gis'} ref={setContainerNode}/>;
});

export default MapLibreGisComponent;
