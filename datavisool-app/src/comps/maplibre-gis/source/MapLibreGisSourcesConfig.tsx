/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useMemo, useState} from 'react';
import {Tag} from '@datavisool/ui';
import {ConfigType} from '@/designer/right/ConfigContent.tsx';
import {IdGenerate} from '@datavisool/sdk';
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController.ts';
import {DataConfigType} from '@datavisool/sdk/types';
import {GisSourceType, StructuredSourceConfig} from '@datavisool/sdk/types';
import SourceEditorDrawer from '@/comps/maplibre-gis/source/SourceEditorDrawer.tsx';
import {defaultSource, sourceTypeOptions} from '@/comps/maplibre-gis/source/sourceUtils.ts';
import {CopyOne, Delete, EditOne} from '@icon-park/react';
import '@/comps/maplibre-gis/source/MapLibreGisSourcesConfig.less';
import {buildMapLibreSourceSpecMap, emptyFeatureCollection, setGeoJsonSourceData, normalizeStructuredSources} from "@/comps/maplibre-gis/source/SourceTools.ts";
import {
    addMapLibreLayer,
    buildMapLibreLayerSpecList,
    normalizeStructuredLayers,
    removeMapLibreLayer
} from "@/comps/maplibre-gis/layer/LayerTools.ts";
import ComponentDataUpdater from "@/framework/core/tools/ComponentDataUpdater.ts";
import {globalMessage} from "@datavisool/ui";
import {MapLibreActionButton, MapLibreButton as Button, MapLibreSelect as Select, MapLibreSwitch as Switch} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';

/**
 * “数据源（sources）”配置面板
 *
 * 概念说明：
 * - sources 是结构化数据源列表，最终会由 controller.applyLayers 转换成 map.addSource(...)
 * - Layer.sourceRef 会引用这里的 source.id，因此 sourceId 需要稳定且唯一
 *
 * 数据流：
 * - 新增/编辑/删除/可见性开关 → controller.update({style:{sources: nextSources}})
 * - controller 会在 map.style ready 后刷新运行态 sources/layers
 */
const normalizeSources = (raw: any): StructuredSourceConfig[] => normalizeStructuredSources(raw).sources;

const MapLibreGisSourcesConfig: React.FC<ConfigType<MapLibreGisController>> = ({controller}) => {
    const style = controller.getConfig()?.style;
    const sources = normalizeSources((style as any)?.sources);

    const [, forceRender] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
    const editingSource = sources.find(s => s.id === editingSourceId) ?? null;
    const [addType, setAddType] = useState<GisSourceType>('geojson');

    const requestGeoJsonDataConfigOnce = (src: StructuredSourceConfig) => {
        const sourceId = src?.id ?? '';
        if (!sourceId || src.sourceType !== 'geojson')
            return;
        const mode = (src as any).dataMode;
        if (mode !== 'dataConfig')
            return;
        const dataConfig = (src as any).dataConfig as DataConfigType | undefined;
        if (!dataConfig)
            return;

        const map = controller.getMap();
        if (!map)
            return;

        let done = false;
        const updater = new ComponentDataUpdater((data) => {
            if (done)
                return;
            done = true;
            try {
                setGeoJsonSourceData(map as any, sourceId, data);
            } catch (e) {
                console.error(`[MapLibreGisSourcesConfig] setGeoJsonSourceData failed: ${sourceId}`, e);
            }
            clearTimeout(timeout);
            updater.destroy();
        }, () => {
            if (done)
                return;
            done = true;
            clearTimeout(timeout);
            updater.destroy();
            globalMessage.messageApi?.warning('动态数据源请求失败');
        });

        const timeout = window.setTimeout(() => {
            if (done)
                return;
            done = true;
            updater.destroy();
            globalMessage.messageApi?.warning('动态数据源请求超时');
        }, 10000);

        try {
            updater.run(dataConfig, true);
        } catch (e) {
            clearTimeout(timeout);
            updater.destroy();
            console.error('[MapLibreGisSourcesConfig] request dynamic data failed', e);
            globalMessage.messageApi?.warning('动态数据源请求失败');
        }
    };

    const updateSources = (nextSources: StructuredSourceConfig[]) => {
        controller.update({style: {sources: nextSources}} as any);
        const map = controller.getMap();
        if (map) {
            try {
                if (!(map as any).isStyleLoaded || !(map as any).isStyleLoaded()) {
                    forceRender(v => v + 1);
                    return;
                }

                const prevSpecById = buildMapLibreSourceSpecMap(sources).specById;
                const nextSpecById = buildMapLibreSourceSpecMap(nextSources).specById;

                const prevIds = new Set<string>(Array.from(prevSpecById.keys()));
                const nextIds = new Set<string>(Array.from(nextSpecById.keys()));

                const stripGeojsonData = (spec: any) => {
                    if (!spec || spec.type !== 'geojson')
                        return spec;
                    const {data, ...rest} = spec as any;
                    void data;
                    return rest;
                };

                const stableStringify = (v: any) => {
                    try {
                        return JSON.stringify(v);
                    } catch {
                        return '';
                    }
                };

                const willResync =
                    Array.from(prevIds).some(id => !nextIds.has(id)) ||
                    Array.from(nextIds).some(id => !prevIds.has(id)) ||
                    Array.from(nextIds).some(id => {
                        if (!prevIds.has(id))
                            return false;
                        const a = prevSpecById.get(id);
                        const b = nextSpecById.get(id);
                        return stableStringify(stripGeojsonData(a)) !== stableStringify(stripGeojsonData(b));
                    });

                const managedSourceIds: Set<string> = ((map as any).__mlgisManagedSourceIds ??= new Set<string>());
                const managedLayerIds: Set<string> = ((map as any).__mlgisManagedLayerIds ??= new Set<string>());
                const missingRuntimeSource = Array.from(nextSpecById.keys()).some(id => !(map as any).getSource(id));
                const shouldResync = willResync || missingRuntimeSource;

                if (!shouldResync) {
                    Array.from(nextIds).forEach((id) => {
                        const prevSpec = prevSpecById.get(id) as any;
                        const nextSpec = nextSpecById.get(id) as any;
                        if (!prevSpec || !nextSpec)
                            return;
                        if (nextSpec.type !== 'geojson')
                            return;
                        if (stableStringify(prevSpec) === stableStringify(nextSpec))
                            return;
                        const data = nextSpec.data;
                        if (typeof data === 'string')
                            return;
                        setGeoJsonSourceData(map as any, id, data);
                    });
                    return;
                }

                Array.from(managedLayerIds.values()).reverse().forEach((layerId) => {
                    removeMapLibreLayer(map as any, layerId);
                });
                managedLayerIds.clear();

                Array.from(managedSourceIds.values()).forEach((sourceId) => {
                    try {
                        if ((map as any).getSource(sourceId))
                            (map as any).removeSource(sourceId);
                    } catch (e) {
                        console.error(`[MapLibreGisSourcesConfig] removeSource ${sourceId} failed`, e);
                    }
                });
                managedSourceIds.clear();

                nextSources.forEach((src) => {
                    const spec = nextSpecById.get(src.id);
                    if (!spec)
                        return;
                    try {
                        (map as any).addSource(src.id, spec as any);
                        managedSourceIds.add(src.id);
                    } catch (e) {
                        console.error(`[MapLibreGisSourcesConfig] addSource ${src.id} failed`, e);
                    }
                });

                const styleCfg: any = controller.getConfig()?.style ?? {};
                const {layers} = normalizeStructuredLayers(styleCfg.layers);
                const typeById = new Map<string, any>();
                nextSources.forEach((source) => {
                    if (!nextSpecById.has(source.id))
                        return;
                    if (!(map as any).getSource(source.id))
                        return;
                    typeById.set(source.id, (source as any).sourceType);
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
                            console.error(`[MapLibreGisSourcesConfig] addSource ${fallbackSourceId} failed`, e);
                            return '';
                        }
                    } else {
                        managedSourceIds.add(fallbackSourceId);
                    }
                    typeById.set(fallbackSourceId, 'geojson');
                    return fallbackSourceId;
                };
                const {layerSpecs} = buildMapLibreLayerSpecList(
                    layers,
                    (layer) => {
                        if (layer.type === 'background')
                            return '';
                        const sourceRef = (layer as any).sourceRef ?? '';
                        if (typeById.has(sourceRef))
                            return sourceRef;
                        if (sourceRef)
                            return '';
                        return ensureFallbackGeoJsonSource(layer.id);
                    },
                    (sourceId) => typeById.get(sourceId)
                );

                layerSpecs.forEach((spec) => {
                    const ok = addMapLibreLayer(map as any, spec as any);
                    if (ok)
                        managedLayerIds.add(spec.id);
                });
            } catch (e) {
                console.error('[MapLibreGisSourcesConfig] apply sources delta failed', e);
            }
        }
        forceRender(v => v + 1);
    };

    const addSource = () => updateSources([...sources, defaultSource(addType)]);

    const copySource = (src: StructuredSourceConfig) => {
        const copied: StructuredSourceConfig = {
            ...(src as any),
            id: IdGenerate.generateId(),
            name: `${src.name}-副本`,
        };
        updateSources([...sources, copied]);
    };

    const deleteSource = (sourceId: string) => {
        updateSources(sources.filter(s => s.id !== sourceId));
        if (editingSourceId === sourceId) {
            setDrawerOpen(false);
            setEditingSourceId(null);
        }
    };

    const updateSourceInline = (sourceId: string, patch: Partial<StructuredSourceConfig>) => {
        updateSources(sources.map(s => (s.id === sourceId ? ({...(s as any), ...(patch as any)} as StructuredSourceConfig) : s)));
    };

    const openEdit = (src: StructuredSourceConfig) => {
        setEditingSourceId(src.id);
        setDrawerOpen(true);
    };

    const typeLabelMap = useMemo(() => {
        const map = new Map<GisSourceType, string>();
        sourceTypeOptions.forEach(o => map.set(o.value, o.label));
        return map;
    }, []);

    return (
        <div className={'mlgis-sources-config'}>
            <div className={'mlgis-sources-toolbar'}>
                <Select
                    value={addType}
                    options={sourceTypeOptions}
                    onChange={(v) => setAddType(v)}
                    size={'small'}
                    className={'mlgis-sources-type'}
                />
                <Button type={'primary'} size={'small'} onClick={addSource} className={'mlgis-sources-add'}>
                    新增数据源
                </Button>
            </div>

            <div className={'mlgis-sources-list'}>
                {sources.length === 0 ? (
                    <div className={'mlgis-empty'}>暂无数据源。点击上方“新增数据源”创建第一个 source。</div>
                ) : null}
                {sources.map((s) => (
                    <div key={s.id} className={'mlgis-source-item'}>
                        <div className={'mlgis-source-header'}>
                            <div className={'mlgis-source-left'}>
                                <Switch
                                    size={'small'}
                                    checked={s.visible !== false}
                                    onChange={(v) => updateSourceInline(s.id, {visible: v})}
                                />
                                <div className={'mlgis-source-name'} title={s.name}>{s.name}</div>
                            </div>

                            <div className={'mlgis-source-actions'}>
                                <MapLibreActionButton title={'编辑'} onClick={() => openEdit(s)}>
                                    <EditOne size={16}/>
                                </MapLibreActionButton>
                                <MapLibreActionButton title={'复制'} onClick={() => copySource(s)}>
                                    <CopyOne size={16}/>
                                </MapLibreActionButton>
                                <MapLibreActionButton title={'删除'} danger={true} onClick={() => deleteSource(s.id)}>
                                    <Delete size={16}/>
                                </MapLibreActionButton>
                            </div>
                        </div>

                        <div className={'mlgis-source-body'}>
                            <div className={'mlgis-source-meta'}>
                                <Tag color={'geekblue'}>{typeLabelMap.get(s.sourceType) ?? s.sourceType}</Tag>
                                {s.sourceType === 'geojson' && (s as any).dataMode ? (
                                    <Tag color={'blue'}>{(s as any).dataMode}</Tag>
                                ) : null}
                            </div>
                            <span className={'mlgis-source-id'} title={'Source ID（Layer.sourceRef 使用该值）'}>{s.id}</span>
                        </div>
                    </div>
                ))}
            </div>

            <SourceEditorDrawer
                open={drawerOpen}
                source={editingSource}
                onClose={() => setDrawerOpen(false)}
                onSave={(next) => {
                    updateSources(sources.map(s => (s.id === next.id ? next : s)));
                    requestGeoJsonDataConfigOnce(next);
                    setDrawerOpen(false);
                }}
            />
        </div>
    );
};

export default MapLibreGisSourcesConfig;
