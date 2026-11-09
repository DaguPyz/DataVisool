/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useState} from 'react';
import {ConfigType} from '@/designer/right/ConfigContent.tsx';
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController.ts';
import {globalMessage} from "@datavisool/ui";
import {MapLibreProjectionConfig, MapLibreProjectionType} from '@datavisool/sdk/types';
import '@/comps/maplibre-gis/projection/MapLibreGisProjectionConfig.less';
import {applyProjection} from "@/comps/maplibre-gis/runtime/MapLibreGisMapRuntime.ts";
import {MapLibreButton as Button, MapLibreField as Field, MapLibreNumberInput as InputNumber, MapLibreSelect as Select} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';

/**
 * “投影（projection）”配置面板
 *
 * 核心点：
 * - 投影属于典型的“命令式效果”，修改后应立即调用 map.setProjection 生效
 * - 由 controller 负责把配置应用到 map（并处理 style.load 时序/重试）
 *
 * 两种模式：
 * - static：固定投影类型（mercator/globe/vertical-perspective）
 * - zoom_interpolate：按 zoom 线性插值切换投影（内部使用 expression spec）
 */
const projectionOptions: Array<{label: string; value: MapLibreProjectionType}> = [
    {label: 'Web 墨卡托（mercator）', value: 'mercator'},
    {label: '地球（globe）', value: 'globe'},
    {label: '垂直透视（vertical-perspective）', value: 'vertical-perspective'},
];

const MapLibreGisProjectionConfigPanel: React.FC<ConfigType<MapLibreGisController>> = ({controller}) => {
    const style = controller.getConfig()?.style as any;
    const projection = (style?.projection ?? {mode: 'static', type: 'mercator'}) as MapLibreProjectionConfig;

    const [, forceRender] = useState(0);
    const [liveProjection, setLiveProjection] = useState<any>(null);

    const updateProjection = (next: MapLibreProjectionConfig) => {
        /**
         * 写回配置并刷新面板 UI。
         * 注意：地图效果不是靠 React 重渲染，而是 controller 直接操作 map 应用。
         */
        controller.update({style: {projection: next}} as any);
        const map = controller.getMap();
        if (map) {
            try {
                applyProjection(map as any, next);
            } catch (e) {
                console.error('[MapLibreGisProjectionConfig] applyProjection failed', e);
            }
        }
        forceRender(v => v + 1);
    };

    const patchProjection = (patch: Partial<MapLibreProjectionConfig>) => {
        updateProjection({...projection, ...(patch as any)});
    };

    const setMode = (mode: MapLibreProjectionConfig['mode']) => {
        if (projection.mode === mode)
            return;
        if (mode === 'static') {
            updateProjection({mode: 'static', type: projection.type ?? 'mercator'});
            return;
        }
        const from = projection.type ?? 'globe';
        const to = from === 'mercator' ? 'globe' : 'mercator';
        updateProjection({
            mode: 'zoom_interpolate',
            zoomInterpolate: {
                z1: 10,
                z2: 12,
                from,
                to,
            },
        });
    };

    const readLive = () => {
        const p = controller.readCurrentProjection();
        if (!p) {
            globalMessage.messageApi?.warning('地图尚未初始化，无法读取当前投影');
            return;
        }
        setLiveProjection(p);
    };

    const applyLiveAsStatic = () => {
        const p = controller.readCurrentProjection();
        const t = p?.type as MapLibreProjectionType | undefined;
        if (!t) {
            globalMessage.messageApi?.warning('无法识别当前投影类型');
            return;
        }
        updateProjection({mode: 'static', type: t});
        setLiveProjection(p);
    };

    const zi = projection.zoomInterpolate;

    return (
        <div className={'mlgis-projection-config'}>
            <div className={'mlgis-projection-toolbar'}>
                <Button size={'small'} onClick={readLive}>读取当前投影</Button>
                <Button type={'primary'} size={'small'} onClick={applyLiveAsStatic}>使用当前投影</Button>
            </div>

            {liveProjection ? (
                <div className={'mlgis-projection-live'}>
                    <div className={'mlgis-projection-live-row'}>
                        <span>当前投影：</span>
                        <span>{String(liveProjection.type ?? '')}</span>
                    </div>
                </div>
            ) : null}

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>投影模式</div>
                <div className={'mlgis-card-desc'}>选择固定投影，或按缩放自动切换投影（结构化生成，不暴露 JSON）。</div>
                <div className={'mlgis-grid'}>
                    <Field label={'模式'} inline={true}>
                        <Select
                            value={projection.mode}
                            options={[
                                {label: '固定投影', value: 'static'},
                                {label: '按缩放切换', value: 'zoom_interpolate'},
                            ]}
                            onChange={(v) => setMode(v as any)}
                            size={'small'}
                            style={{width: '100%'}}
                        />
                    </Field>
                </div>
            </div>

            {projection.mode === 'static' ? (
                <div className={'mlgis-card'}>
                    <div className={'mlgis-card-title'}>固定投影</div>
                    <div className={'mlgis-card-desc'}>切换后地图会立即以对应投影渲染。</div>
                    <div className={'mlgis-grid'}>
                        <Field label={'投影类型'} inline={true}>
                            <Select
                                value={projection.type ?? 'mercator'}
                                options={projectionOptions}
                                onChange={(v) => patchProjection({type: v as any})}
                                size={'small'}
                                style={{width: '100%'}}
                            />
                        </Field>
                    </div>
                </div>
            ) : (
                <div className={'mlgis-card'}>
                    <div className={'mlgis-card-title'}>按缩放切换</div>
                    <div className={'mlgis-card-desc'}>在 zoom=z1 时使用 from 投影，在 zoom=z2 时使用 to 投影（线性过渡）。</div>
                    <div className={'mlgis-grid'}>
                        <div className={'mlgis-grid-2'}>
                            <Field label={'起始缩放'} tip={'z1'} inline={true}>
                                <InputNumber
                                    value={typeof zi?.z1 === 'number' ? zi.z1 : 10}
                                    onChange={(v) => patchProjection({zoomInterpolate: {...(zi as any), z1: typeof v === 'number' ? v : 10}})}
                                    size={'small'}
                                    style={{width: '100%'}}
                                    step={0.1}
                                />
                            </Field>
                            <Field label={'结束缩放'} tip={'z2'} inline={true}>
                                <InputNumber
                                    value={typeof zi?.z2 === 'number' ? zi.z2 : 12}
                                    onChange={(v) => patchProjection({zoomInterpolate: {...(zi as any), z2: typeof v === 'number' ? v : 12}})}
                                    size={'small'}
                                    style={{width: '100%'}}
                                    step={0.1}
                                />
                            </Field>
                        </div>
                        <div className={'mlgis-grid-2'}>
                            <Field label={'低缩放投影'} tip={'from'} inline={true}>
                                <Select
                                    value={(zi?.from ?? 'globe') as any}
                                    options={projectionOptions}
                                    onChange={(v) => patchProjection({zoomInterpolate: {...(zi as any), from: v as any}})}
                                    size={'small'}
                                    style={{width: '100%'}}
                                />
                            </Field>
                            <Field label={'高缩放投影'} tip={'to'} inline={true}>
                                <Select
                                    value={(zi?.to ?? 'mercator') as any}
                                    options={projectionOptions}
                                    onChange={(v) => patchProjection({zoomInterpolate: {...(zi as any), to: v as any}})}
                                    size={'small'}
                                    style={{width: '100%'}}
                                />
                            </Field>
                        </div>
                        <Field label={'说明'} inline={true}>
                            <div className={'mlgis-projection-note'}>
                                <div>globe 在某些缩放下可能内部切回 mercator；vertical-perspective 通常不会自动切换。</div>
                                <div>如果你希望页面加载就固定 globe，请用“固定投影”。</div>
                            </div>
                        </Field>
                    </div>
                </div>
            )}

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>联动提示</div>
                <div className={'mlgis-card-desc'}>当投影为 globe 或 vertical-perspective 时，建议在「天空/雾效/光照」面板开启合适效果以提升观感。</div>
                <div className={'mlgis-grid'}>
                    <Field label={'建议'} inline={true}>
                        <div className={'mlgis-projection-note'}>可优先开启天空（Sky），再根据需要开启雾效（Fog）与光照（Light）。</div>
                    </Field>
                </div>
            </div>
        </div>
    );
};

export default MapLibreGisProjectionConfigPanel;
