/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Tag} from '@datavisool/ui';
import {ConfigType} from '@/designer/right/ConfigContent.tsx';
import {IdGenerate} from '@datavisool/sdk';
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController.ts';
import {GisLayerType, StructuredLayerConfig, StructuredSourceConfig} from '@datavisool/sdk/types';
import LayerEditorDrawer from '@/comps/maplibre-gis/layer/LayerEditorDrawer.tsx';
import {layerTypeOptions} from '@/comps/maplibre-gis/layer/layerUtils.ts';
import {CopyOne, Delete, EditOne} from '@icon-park/react';
import '@/comps/maplibre-gis/layer/MapLibreGisLayersConfig.less';
import {buildMapLibreSourceSpecMap, emptyFeatureCollection, normalizeStructuredSources} from "@/comps/maplibre-gis/source/SourceTools.ts";
import {addMapLibreLayer, buildMapLibreLayerSpecList, normalizeStructuredLayers, removeMapLibreLayer} from "@/comps/maplibre-gis/layer/LayerTools.ts";
import {MapLibreActionButton, MapLibreButton as Button, MapLibreSelect as Select, MapLibreSwitch as Switch} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';

/**
 * “图层（layers）”配置面板
 *
 * 概念说明：
 * - layers 是结构化图层列表，最终会由 controller.applyLayers 转换成 map.addLayer(...)
 * - 图层顺序非常重要：后面的 layer 会盖在前面的 layer 上（渲染顺序）
 *
 * 数据流：
 * - 新增/编辑/删除/显示开关/拖拽排序 → controller.update({style:{layers: nextLayers}})
 * - controller 会在 map style ready 后刷新运行态 layers/sources（remove* + add*）
 */
const normalizeSources = (raw: any): StructuredSourceConfig[] => normalizeStructuredSources(raw).sources;
type DropPosition = 'before' | 'after';

interface LayerDragSession {
    sourceId: string;
    sourceRow: HTMLElement;
    overRow?: HTMLElement;
    dropPosition?: DropPosition;
}

const LAYER_ITEM_SELECTOR = '.mlgis-layer-item';

const buildDefaultLayer = (layerType: GisLayerType, sourceRef?: string): StructuredLayerConfig => {
    const isBackground = layerType === 'background';
    return {
        id: IdGenerate.generateId(),
        name: '图层',
        visible: true,
        type: layerType,
        sourceRef: isBackground ? undefined : sourceRef,
        sourceLayer: undefined,
        paint: {},
        layout: {},
        filter: undefined,
    };
};

const MapLibreGisLayersConfig: React.FC<ConfigType<MapLibreGisController>> = ({controller}) => {
    const style = controller.getConfig()?.style as any;
    const layers = useMemo(() => (style?.layers ?? []) as StructuredLayerConfig[], [style?.layers]);
    const sources = normalizeSources(style?.sources);
    const displayLayers = useMemo(() => [...layers].reverse(), [layers]);

    const [, forceRender] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
    const editingLayer = layers.find(l => l.id === editingLayerId) ?? null;

    const [addType, setAddType] = useState<GisLayerType>('circle');
    const [addSourceId, setAddSourceId] = useState<string>('');

    const layersListRef = useRef<HTMLDivElement | null>(null);
    const dragSessionRef = useRef<LayerDragSession | null>(null);
    const moveListenerRef = useRef<(event: MouseEvent) => void>(() => undefined);
    const upListenerRef = useRef<(event: MouseEvent) => void>(() => undefined);
    const globalMoveListenerRef = useRef((event: MouseEvent) => moveListenerRef.current(event));
    const globalUpListenerRef = useRef((event: MouseEvent) => upListenerRef.current(event));
    const cleanupDragRef = useRef<() => void>(() => undefined);

    const updateLayers = (nextLayers: StructuredLayerConfig[]) => {
        /**
         * 写回 layers 并刷新面板 UI。
         * 注意：这里不重建 map；只对当前 map 实例做增量同步，避免清空动态数据源（GeoJSON.setData）。
         */
        controller.update({style: {layers: nextLayers}} as any);
        const map = controller.getMap();
        if (map) {
            try {
                if (!(map as any).isStyleLoaded || !(map as any).isStyleLoaded()) {
                    forceRender(v => v + 1);
                    return;
                }

                const managedLayerIds: Set<string> = ((map as any).__mlgisManagedLayerIds ??= new Set<string>());
                Array.from(managedLayerIds.values()).reverse().forEach((layerId) => {
                    removeMapLibreLayer(map as any, layerId);
                });
                managedLayerIds.clear();

                const styleCfg: any = controller.getConfig()?.style ?? {};
                const normalizedLayers = normalizeStructuredLayers(nextLayers).layers;
                const normalizedSources = normalizeStructuredSources(styleCfg.sources).sources;
                const {specById} = buildMapLibreSourceSpecMap(normalizedSources);
                const managedSourceIds: Set<string> = ((map as any).__mlgisManagedSourceIds ??= new Set<string>());

                specById.forEach((spec, sourceId) => {
                    if ((map as any).getSource(sourceId))
                        return;
                    try {
                        (map as any).addSource(sourceId, spec as any);
                        managedSourceIds.add(sourceId);
                    } catch (e) {
                        console.error(`[MapLibreGisLayersConfig] addSource ${sourceId} failed`, e);
                    }
                });

                const sourceTypeById = new Map<string, any>();
                normalizedSources.forEach((source) => {
                    if (!specById.has(source.id))
                        return;
                    if (!(map as any).getSource(source.id))
                        return;
                    sourceTypeById.set(source.id, (source as any).sourceType);
                });
                const ensureFallbackGeoJsonSource = (layerId: string) => {
                    const fallbackSourceId = `ml_src_${layerId}`;
                    if (!(map as any).getSource(fallbackSourceId)) {
                        try {
                            (map as any).addSource(fallbackSourceId, {
                                type: 'geojson',
                                data: emptyFeatureCollection(),
                            });
                            managedSourceIds.add(fallbackSourceId);
                        } catch (e) {
                            console.error(`[MapLibreGisLayersConfig] addSource ${fallbackSourceId} failed`, e);
                            return '';
                        }
                    } else {
                        managedSourceIds.add(fallbackSourceId);
                    }
                    sourceTypeById.set(fallbackSourceId, 'geojson');
                    return fallbackSourceId;
                };

                const {layerSpecs} = buildMapLibreLayerSpecList(
                    normalizedLayers,
                    (layer) => {
                        if (layer.type === 'background')
                            return '';
                        const sourceRef = (layer as any).sourceRef ?? '';
                        if (sourceTypeById.has(sourceRef))
                            return sourceRef;
                        if (sourceRef)
                            return '';
                        return ensureFallbackGeoJsonSource(layer.id);
                    },
                    (sourceId) => sourceTypeById.get(sourceId)
                );

                layerSpecs.forEach((spec) => {
                    const ok = addMapLibreLayer(map as any, spec as any);
                    if (ok)
                        managedLayerIds.add(spec.id);
                });
            } catch (e) {
                console.error('[MapLibreGisLayersConfig] apply layers failed', e);
            }
        }
        forceRender(v => v + 1);
    };

    /**
     * 在列表中移动某个 layer 的位置。
     * - pos=before/after 表示插入到目标 layer 的前/后
     */
    const reorderLayers = (fromId: string, toId: string, pos: DropPosition) => {
        if (fromId === toId)
            return;
        const view = [...layers].reverse();
        const fromIndex = view.findIndex(l => l.id === fromId);
        const toIndex = view.findIndex(l => l.id === toId);
        if (fromIndex < 0 || toIndex < 0)
            return;
        const next = [...view];
        const [moving] = next.splice(fromIndex, 1);
        const insertAtRaw = next.findIndex(l => l.id === toId);
        if (insertAtRaw < 0)
            return;
        const insertAt = pos === 'after' ? insertAtRaw + 1 : insertAtRaw;
        next.splice(insertAt, 0, moving);
        updateLayers([...next].reverse());
    };

    const clearDropIndicator = () => {
        const dragSession = dragSessionRef.current;
        const overRow = dragSession?.overRow;
        if (!dragSession || !overRow)
            return;
        overRow.classList.remove('mlgis-drop-before', 'mlgis-drop-after');
        dragSession.overRow = undefined;
        dragSession.dropPosition = undefined;
    };

    const clearDragSourceState = () => {
        const dragSession = dragSessionRef.current;
        if (!dragSession)
            return;
        dragSession.sourceRow.classList.remove('mlgis-dragging');
    };

    const cleanupDrag = () => {
        clearDropIndicator();
        clearDragSourceState();
        dragSessionRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', globalMoveListenerRef.current, true);
        window.removeEventListener('mouseup', globalUpListenerRef.current, true);
    };

    const getLayerCandidates = () => {
        const container = layersListRef.current;
        if (!container)
            return [] as HTMLElement[];
        return Array.from(container.querySelectorAll<HTMLElement>(LAYER_ITEM_SELECTOR)).filter((node) => !!node.dataset.id);
    };

    const resolveDropTarget = (clientX: number, clientY: number): { target: HTMLElement; pos: DropPosition } | null => {
        const candidates = getLayerCandidates();
        if (candidates.length === 0)
            return null;

        const pointElements = typeof document.elementsFromPoint === 'function'
            ? document.elementsFromPoint(clientX, clientY)
            : [document.elementFromPoint(clientX, clientY)].filter(Boolean) as Element[];

        for (const element of pointElements) {
            if (!(element instanceof HTMLElement))
                continue;
            const matched = element.closest(LAYER_ITEM_SELECTOR) as HTMLElement | null;
            if (matched && candidates.includes(matched)) {
                const rect = matched.getBoundingClientRect();
                return {
                    target: matched,
                    pos: clientY < rect.top + rect.height / 2 ? 'before' : 'after',
                };
            }
        }

        let nearest = candidates[0];
        let nearestDistance = Number.POSITIVE_INFINITY;
        let nearestPos: DropPosition = 'before';
        candidates.forEach((node) => {
            const rect = node.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            const distance = Math.abs(clientY - centerY);
            if (distance < nearestDistance) {
                nearest = node;
                nearestDistance = distance;
                nearestPos = clientY < centerY ? 'before' : 'after';
            }
        });
        return {target: nearest, pos: nearestPos};
    };

    const applyDropIndicator = (target: HTMLElement, pos: DropPosition) => {
        const dragSession = dragSessionRef.current;
        if (!dragSession)
            return;
        if (dragSession.overRow === target && dragSession.dropPosition === pos)
            return;
        clearDropIndicator();
        dragSession.overRow = target;
        dragSession.dropPosition = pos;
        target.classList.add(pos === 'before' ? 'mlgis-drop-before' : 'mlgis-drop-after');
    };

    const maybeAutoScroll = (clientY: number) => {
        const scrollContainer = layersListRef.current?.closest('.datavisool-config-detail, .mlgis-config-drawer-body') as HTMLElement | null;
        if (!scrollContainer)
            return;
        const rect = scrollContainer.getBoundingClientRect();
        const threshold = 42;
        const step = 18;
        if (clientY < rect.top + threshold)
            scrollContainer.scrollTop -= step;
        else if (clientY > rect.bottom - threshold)
            scrollContainer.scrollTop += step;
    };

    const handleMouseMove = (event: MouseEvent) => {
        const dragSession = dragSessionRef.current;
        if (!dragSession)
            return;
        event.preventDefault();
        maybeAutoScroll(event.clientY);

        const resolved = resolveDropTarget(event.clientX, event.clientY);
        if (!resolved) {
            clearDropIndicator();
            return;
        }

        const targetId = resolved.target.dataset.id;
        if (!targetId || targetId === dragSession.sourceId) {
            clearDropIndicator();
            return;
        }
        applyDropIndicator(resolved.target, resolved.pos);
    };

    const handleMouseUp = () => {
        const dragSession = dragSessionRef.current;
        if (!dragSession) {
            cleanupDrag();
            return;
        }

        const sourceId = dragSession.sourceId;
        const targetId = dragSession.overRow?.dataset.id;
        const position = dragSession.dropPosition;
        cleanupDrag();

        if (!targetId || !position || sourceId === targetId)
            return;
        reorderLayers(sourceId, targetId, position);
    };

    const handleDragHandleMouseDown = (layerId: string, event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0)
            return;

        const sourceRow = event.currentTarget.closest(LAYER_ITEM_SELECTOR) as HTMLElement | null;
        if (!sourceRow)
            return;

        event.preventDefault();
        event.stopPropagation();

        cleanupDrag();
        sourceRow.classList.add('mlgis-dragging');
        dragSessionRef.current = {sourceId: layerId, sourceRow};

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', globalMoveListenerRef.current, true);
        window.addEventListener('mouseup', globalUpListenerRef.current, true);
    };

    moveListenerRef.current = handleMouseMove;
    upListenerRef.current = handleMouseUp;
    cleanupDragRef.current = cleanupDrag;

    useEffect(() => () => cleanupDragRef.current(), []);

    const addLayer = () => {
        const sourceRef = addType === 'background' ? undefined : (addSourceId && addSourceId !== '' ? addSourceId : undefined);
        updateLayers([...layers, buildDefaultLayer(addType, sourceRef)]);
    };

    const copyLayer = (layer: StructuredLayerConfig) => {
        const copied: StructuredLayerConfig = {
            ...(layer as any),
            id: IdGenerate.generateId(),
            name: `${layer.name}-副本`,
            paint: {...(layer.paint ?? {})},
            layout: {...(layer.layout ?? {})},
        };
        updateLayers([...layers, copied]);
    };

    const deleteLayer = (layerId: string) => {
        updateLayers(layers.filter(l => l.id !== layerId));
        if (editingLayerId === layerId) {
            setDrawerOpen(false);
            setEditingLayerId(null);
        }
    };

    const updateLayerInline = (layerId: string, patch: Partial<StructuredLayerConfig>) => {
        updateLayers(layers.map(l => (l.id === layerId ? ({...(l as any), ...(patch as any)} as StructuredLayerConfig) : l)));
    };

    const openEdit = (layer: StructuredLayerConfig) => {
        setEditingLayerId(layer.id);
        setDrawerOpen(true);
    };

    const sourceOptions = useMemo(() => {
        return [
            {label: '不绑定', value: ''},
            ...sources.map(s => ({label: `${s.name}（${s.id}）`, value: s.id})),
        ];
    }, [sources]);

    const layerTypeLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        layerTypeOptions.forEach(o => map.set(o.value, o.label));
        return map;
    }, []);

    const getLayerSourceLabel = (layer: StructuredLayerConfig) => {
        if (layer.sourceRef) {
            const src = sources.find(s => s.id === layer.sourceRef);
            if (src)
                return `${src.name}（${src.sourceType}）`;
            return layer.sourceRef;
        }
        if (layer.type === 'background')
            return '背景';
        return '未绑定';
    };

    return (
        <div className={'mlgis-layers-config'}>
            <div className={'mlgis-layers-toolbar'}>
                <Select
                    value={addType}
                    options={layerTypeOptions}
                    onChange={(v) => setAddType(v)}
                    size={'small'}
                    className={'mlgis-layers-type'}
                />
                <Select
                    value={addSourceId}
                    options={sourceOptions}
                    onChange={(v) => setAddSourceId(v)}
                    size={'small'}
                    className={'mlgis-layers-source'}
                />
                <Button type={'primary'} size={'small'} onClick={addLayer} className={'mlgis-layers-add'}>
                    新增图层
                </Button>
            </div>

            <div className={'mlgis-layers-list'} ref={layersListRef}>
                {displayLayers.length === 0 ? (
                    <div className={'mlgis-empty'}>暂无图层。点击上方“新增图层”创建第一个 layer。</div>
                ) : null}
                {displayLayers.map((l) => (
                    <div
                        key={l.id}
                        className={'mlgis-layer-item'}
                        data-id={l.id}
                    >
                        <div className={'mlgis-layer-header'}>
                            <div className={'mlgis-layer-left'}>
                                <div
                                    className={'mlgis-layer-drag-handle'}
                                    title={'拖拽调整图层顺序'}
                                    onMouseDown={(e) => handleDragHandleMouseDown(l.id, e)}
                                >
                                    ⋮⋮
                                </div>
                                <Switch
                                    size={'small'}
                                    checked={l.visible !== false}
                                    onChange={(v) => updateLayerInline(l.id, {visible: v})}
                                />
                                <div className={'mlgis-layer-name'} title={l.name}>{l.name}</div>
                            </div>

                            <div className={'mlgis-layer-actions'}>
                                <MapLibreActionButton title={'编辑'} onClick={() => openEdit(l)}>
                                    <EditOne size={16}/>
                                </MapLibreActionButton>
                                <MapLibreActionButton title={'复制'} onClick={() => copyLayer(l)}>
                                    <CopyOne size={16}/>
                                </MapLibreActionButton>
                                <MapLibreActionButton title={'删除'} danger={true} onClick={() => deleteLayer(l.id)}>
                                    <Delete size={16}/>
                                </MapLibreActionButton>
                            </div>
                        </div>

                        <div className={'mlgis-layer-body'}>
                            <div className={'mlgis-layer-meta'}>
                                <Tag color={'blue'}>{layerTypeLabelMap.get(l.type) ?? l.type}</Tag>
                                <Tag color={'geekblue'}>{getLayerSourceLabel(l)}</Tag>
                            </div>
                            <span className={'mlgis-layer-id'} title={'Layer ID（用于事件与要素查询）'}>{l.id}</span>
                        </div>
                    </div>
                ))}
            </div>

            <LayerEditorDrawer
                open={drawerOpen}
                layer={editingLayer}
                sources={sources}
                onClose={() => setDrawerOpen(false)}
                onSave={(next: StructuredLayerConfig) => {
                    updateLayers(layers.map(l => (l.id === next.id ? next : l)));
                    setDrawerOpen(false);
                }}
            />
        </div>
    );
};

export default MapLibreGisLayersConfig;
