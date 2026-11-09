/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useMemo, useState} from 'react';
import { ConfigType } from '@/designer/right/ConfigContent.tsx';
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController.ts';
import {globalMessage} from "@datavisool/ui";
import { MapLibreTerrainConfig, StructuredSourceConfig } from '@datavisool/sdk/types';
import { applyTerrain } from '@/comps/maplibre-gis/runtime/MapLibreGisMapRuntime.ts';
import './MapLibreGisTerrainConfig.less';
import {MapLibreButton as Button, MapLibreField as Field, MapLibreNumberInput as InputNumber, MapLibreSelect as Select, MapLibreSlider as Slider, MapLibreSwitch as Switch} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';

const defaultTerrain: MapLibreTerrainConfig = {
    enabled: false,
    exaggeration: 1,
};

const presets: Array<{ label: string; value: string; patch: Partial<MapLibreTerrainConfig> }> = [
    { label: '轻微起伏（1.0）', value: 'x1', patch: { enabled: true, exaggeration: 1 } },
    { label: '强调（1.5）', value: 'x15', patch: { enabled: true, exaggeration: 1.5 } },
    { label: '夸张（2.5）', value: 'x25', patch: { enabled: true, exaggeration: 2.5 } },
    { label: '平面（0）', value: 'x0', patch: { enabled: true, exaggeration: 0 } },
];

const MapLibreGisTerrainConfigPanel: React.FC<ConfigType<MapLibreGisController>> = ({ controller }) => {
    const style = controller.getConfig()?.style as any;
    const terrain = (style?.terrain ?? defaultTerrain) as MapLibreTerrainConfig;
    const sources = useMemo(() => (style?.sources ?? []) as StructuredSourceConfig[], [style?.sources]);

    const rasterDemSources = useMemo(() => {
        return sources
            .filter(s => s && s.sourceType === 'raster-dem' && s.visible !== false)
            .map(s => ({ label: `${s.name || s.id}（${s.id}）`, value: s.id }));
    }, [sources]);

    const rasterDemSourceIdSet = useMemo(() => {
        return new Set(rasterDemSources.map(s => s.value));
    }, [rasterDemSources]);

    const [, forceRender] = useState(0);
    const [liveTerrain, setLiveTerrain] = useState<any>(null);
    const [presetKey, setPresetKey] = useState<string>('');

    const updateTerrain = (next: MapLibreTerrainConfig) => {
        controller.update({ style: { terrain: next } } as any);
        const map = controller.getMap();
        if (map) {
            try {
                applyTerrain(map as any, next);
            } catch (e) {
                console.error('[MapLibreGisTerrainConfig] applyTerrain failed', e);
            }
        }
        forceRender(v => v + 1);
    };

    const patchTerrain = (patch: Partial<MapLibreTerrainConfig>) => {
        updateTerrain({ ...terrain, ...(patch as any) });
    };

    const readLive = () => {
        const map = controller.getMap();
        if (!map || typeof (map as any).getTerrain !== 'function') {
            globalMessage.messageApi?.warning('地图尚未初始化或当前版本不支持读取 terrain');
            return;
        }
        try {
            setLiveTerrain((map as any).getTerrain());
        } catch (e) {
            console.error('[MapLibreGisTerrainConfig] read terrain failed', e);
            globalMessage.messageApi?.warning('读取当前 terrain 失败');
        }
    };

    const applyLive = () => {
        const map = controller.getMap();
        if (!map || typeof (map as any).getTerrain !== 'function') {
            globalMessage.messageApi?.warning('地图尚未初始化或当前版本不支持读取 terrain');
            return;
        }
        try {
            const spec = (map as any).getTerrain();
            setLiveTerrain(spec);
            if (!spec) {
                updateTerrain({ enabled: false });
                return;
            }
            updateTerrain({
                enabled: true,
                source: spec?.source,
                exaggeration: typeof spec?.exaggeration === 'number' ? spec.exaggeration : undefined,
            });
        } catch (e) {
            console.error('[MapLibreGisTerrainConfig] applyLive failed', e);
            globalMessage.messageApi?.warning('应用当前 terrain 失败');
        }
    };

    const enabled = terrain.enabled === true;
    const exaggeration =
        typeof terrain.exaggeration === 'number' && Number.isFinite(terrain.exaggeration)
            ? Math.max(0, terrain.exaggeration)
            : 1;

    const hasDemSource = rasterDemSources.length > 0;
    const selectedSource = terrain.source;
    const selectedSourceInList = selectedSource ? rasterDemSourceIdSet.has(selectedSource) : true;

    return (
        <div className={'mlgis-terrain-config'}>
            <div className={'mlgis-terrain-toolbar'}>
                <Select
                    value={presetKey}
                    options={[{ label: '选择预设', value: '' }, ...presets.map(p => ({ label: p.label, value: p.value }))]}
                    onChange={(v) => {
                        setPresetKey(v);
                        const p = presets.find(x => x.value === v);
                        if (!p)
                            return;
                        const nextSource = terrain.source ?? rasterDemSources[0]?.value;
                        if (!nextSource) {
                            globalMessage.messageApi?.warning('请先在“数据源”面板创建并启用 Raster DEM 数据源');
                            return;
                        }
                        updateTerrain({ ...terrain, ...p.patch, source: nextSource });
                    }}
                    size={'small'}
                    style={{ width: 180 }}
                />
                <Button size={'small'} onClick={readLive}>读取当前地形</Button>
                <Button type={'primary'} size={'small'} onClick={applyLive}>使用当前地形</Button>
                <Button
                    danger
                    size={'small'}
                    onClick={() => updateTerrain({ enabled: false })}
                >
                    清除地形
                </Button>
            </div>

            {liveTerrain !== null ? (
                <div className={'mlgis-terrain-live'}>
                    <div className={'mlgis-terrain-live-row'}>
                        当前 terrain：{liveTerrain ? `source=${String(liveTerrain?.source ?? '')}` : 'null'}
                    </div>
                </div>
            ) : null}

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>基础</div>
                <div className={'mlgis-card-desc'}>Terrain 需要 Raster DEM 数据源；启用后 sky 的雾效果更明显。</div>
                <div className={'mlgis-grid'}>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'启用'} inline={true}>
                            <Switch
                                checked={enabled}
                                size='small'
                                style={{ width: 35 }}
                                onChange={(v) => {
                                    if (!v) {
                                        patchTerrain({ enabled: false });
                                        return;
                                    }
                                    const nextSource = terrain.source ?? rasterDemSources[0]?.value;
                                    if (!nextSource) {
                                        globalMessage.messageApi?.warning('请先在“数据源”面板创建并启用 Raster DEM 数据源');
                                        return;
                                    }
                                    patchTerrain({ enabled: true, source: nextSource });
                                }}
                            />
                        </Field>
                        <Field label={'DEM 数据源'} tip={'terrain.source（raster-dem sourceId）'} inline={true}>
                            <Select
                                value={selectedSource ?? undefined}
                                placeholder={hasDemSource ? '选择 Raster DEM 数据源' : '暂无 Raster DEM 数据源'}
                                options={rasterDemSources}
                                onChange={(v) => {
                                    patchTerrain({ source: v as any, enabled: true });
                                }}
                                size={'small'}
                                style={{ width: '100%' }}
                                disabled={!hasDemSource}
                            />
                        </Field>
                    </div>
                    {!selectedSourceInList && selectedSource ? (
                        <div className={'mlgis-terrain-hint'}>
                            当前 terrain.source={selectedSource} 不在结构化数据源列表中，可能来自底图 style。
                        </div>
                    ) : null}
                </div>
            </div>

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>地形参数</div>
                <div className={'mlgis-card-desc'}>夸张倍数（exaggeration）：越大地形起伏越明显。</div>
                <div className={'mlgis-grid'}>
                    <Field label={'夸张倍数'} tip={'terrain.exaggeration（>=0，默认 1）'} inline={true}>
                        <div className={'mlgis-terrain-row'}>
                            <div style={{ flex: 1, minWidth: 120 }}>
                                <Slider
                                    min={0}
                                    max={5}
                                    step={0.1}
                                    value={exaggeration}
                                    onChange={(v) => patchTerrain({ exaggeration: typeof v === 'number' ? v : 1 })}
                                />
                            </div>
                            <InputNumber
                                min={0}
                                step={0.1}
                                value={exaggeration}
                                onChange={(v) => patchTerrain({ exaggeration: typeof v === 'number' ? v : 1 })}
                                size={'small'}
                                style={{ width: 110 }}
                            />
                        </div>
                    </Field>
                </div>
            </div>
        </div>
    );
};

export default MapLibreGisTerrainConfigPanel;
