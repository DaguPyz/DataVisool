/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useState} from 'react';
import {ConfigType} from '@/designer/right/ConfigContent.tsx';
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController.ts';
import {MapLibreInteractionConfig} from '@datavisool/sdk/types';
import '@/comps/maplibre-gis/interaction/MapLibreGisInteractionConfig.less';
import {applyInteraction} from "@/comps/maplibre-gis/runtime/MapLibreGisMapRuntime.ts";
import {MapLibreButton as Button, MapLibreField as Field, MapLibreNumberInput as InputNumber, MapLibreSwitch as Switch} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';

/**
 * “交互（interaction）”配置面板
 *
 * 数据流：
 * - 表单修改 → controller.update({style:{interaction: next}}) 合并到总配置
 * - controller 会直接调用 map 的 handlers.enable()/disable() 立即生效（见 MapLibreGisMapRuntime.applyInteraction）
 *
 * refreshMap 的使用场景：
 * - 少数参数在某些 MapLibre 版本没有稳定的运行时 setter（例如 cooperativeGestures 的构造参数差异）
 * - 这类参数可以通过 opts.refreshMap 走“重建 map”兜底
 */
const MapLibreGisInteractionConfigPanel: React.FC<ConfigType<MapLibreGisController>> = ({controller}) => {
    const style = controller.getConfig()?.style as any;
    const interaction = (style?.interaction ?? {}) as MapLibreInteractionConfig;

    const [, forceRender] = useState(0);

    const updateInteraction = (next: MapLibreInteractionConfig, opts?: {refreshMap?: boolean}) => {
        /**
         * 写回配置并刷新面板 UI。
         * 注意：forceRender 只影响面板显示，不会触发地图重渲染。
         */
        controller.update({style: {interaction: next}} as any);
        if (opts?.refreshMap) {
            controller.refreshMap();
        } else {
            const map = controller.getMap();
            if (map) {
                try {
                    applyInteraction(map as any, next);
                } catch (e) {
                    console.error('[MapLibreGisInteractionConfig] applyInteraction failed', e);
                }
            }
        }
        forceRender(v => v + 1);
    };

    const patchInteraction = (patch: Partial<MapLibreInteractionConfig>, opts?: {refreshMap?: boolean}) => {
        updateInteraction({...interaction, ...(patch as any)}, opts);
    };

    const handlers = interaction.handlers ?? {};
    const enabled = interaction.enabled !== false;

    const setHandler = (key: keyof NonNullable<MapLibreInteractionConfig['handlers']>, v: boolean) => {
        patchInteraction({handlers: {...handlers, [key]: v}});
    };

    const scrollZoomCfg = interaction.scrollZoom ?? {};
    const dragPanCfg = interaction.dragPan ?? {};

    return (
        <div className={'mlgis-interaction-config'}>
            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>总开关</div>
                <div className={'mlgis-card-desc'}>关闭后地图不响应任何平移/缩放/旋转/键盘/触控交互。</div>
                <div className={'mlgis-grid'}>
                    <Field label={'启用交互'} inline={true}>
                        <Switch
                            size={'small'}
                            style={{width: 35}}
                            checked={enabled}
                            onChange={(v) => patchInteraction({enabled: v})}
                        />
                    </Field>
                </div>
            </div>

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>手势开关</div>
                <div className={'mlgis-card-desc'}>按需启用/禁用某一种交互，适配不同业务场景（展示/编辑/大屏）。</div>
                <div className={'mlgis-grid'}>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'拖拽平移'} tip={'dragPan'} inline={true}>
                            <Switch
                                size={'small'}
                                style={{width: 35}}
                                checked={handlers.dragPan !== false}
                                onChange={(v) => setHandler('dragPan', v)}
                                disabled={!enabled}
                            />
                        </Field>
                        <Field label={'滚轮/触控板缩放'} tip={'scrollZoom'} inline={true}>
                            <Switch
                                size={'small'}
                                style={{width: 35}}
                                checked={handlers.scrollZoom !== false}
                                onChange={(v) => setHandler('scrollZoom', v)}
                                disabled={!enabled}
                            />
                        </Field>
                    </div>

                    <div className={'mlgis-grid-2'}>
                        <Field label={'框选缩放'} tip={'boxZoom'} inline={true}>
                            <Switch
                                size={'small'}
                                style={{width: 35}}
                                checked={handlers.boxZoom !== false}
                                onChange={(v) => setHandler('boxZoom', v)}
                                disabled={!enabled}
                            />
                        </Field>
                        <Field label={'双击缩放'} tip={'doubleClickZoom'} inline={true}>
                            <Switch
                                size={'small'}
                                style={{width: 35}}
                                checked={handlers.doubleClickZoom !== false}
                                onChange={(v) => setHandler('doubleClickZoom', v)}
                                disabled={!enabled}
                            />
                        </Field>
                    </div>

                    <div className={'mlgis-grid-2'}>
                        <Field label={'拖拽旋转'} tip={'dragRotate'} inline={true}>
                            <Switch
                                size={'small'}
                                style={{width: 35}}
                                checked={handlers.dragRotate !== false}
                                onChange={(v) => setHandler('dragRotate', v)}
                                disabled={!enabled}
                            />
                        </Field>
                        <Field label={'键盘'} tip={'keyboard'} inline={true}>
                            <Switch
                                size={'small'}
                                style={{width: 35}}
                                checked={handlers.keyboard !== false}
                                onChange={(v) => setHandler('keyboard', v)}
                                disabled={!enabled}
                            />
                        </Field>
                    </div>

                    <div className={'mlgis-grid-2'}>
                        <Field label={'双指缩放与旋转'} tip={'touchZoomRotate'} inline={true}>
                            <Switch
                                size={'small'}
                                style={{width: 35}}
                                checked={handlers.touchZoomRotate !== false}
                                onChange={(v) => setHandler('touchZoomRotate', v)}
                                disabled={!enabled}
                            />
                        </Field>
                        <Field label={'双指俯仰'} tip={'touchPitch'} inline={true}>
                            <Switch
                                size={'small'}
                                style={{width: 35}}
                                checked={handlers.touchPitch !== false}
                                onChange={(v) => setHandler('touchPitch', v)}
                                disabled={!enabled}
                            />
                        </Field>
                    </div>
                </div>
            </div>

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>缩放手感</div>
                <div className={'mlgis-card-desc'}>调整滚轮/触控板缩放速度与缩放锚点。</div>
                <div className={'mlgis-grid'}>
                    <Field label={'围绕中心缩放'} tip={'scrollZoom.aroundCenter'} inline={true}>
                        <Switch
                            size={'small'}
                            style={{width: 35}}
                            checked={Boolean(scrollZoomCfg.aroundCenter)}
                            onChange={(v) => patchInteraction({scrollZoom: {...scrollZoomCfg, aroundCenter: v}}, {refreshMap: true})}
                            disabled={!enabled || handlers.scrollZoom === false}
                        />
                    </Field>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'滚轮缩放速度'} tip={'scrollZoom.wheelZoomRate（默认 1/450）'} inline={true}>
                            <InputNumber
                                value={typeof scrollZoomCfg.wheelZoomRate === 'number' ? scrollZoomCfg.wheelZoomRate : undefined}
                                onChange={(v) => patchInteraction({scrollZoom: {...scrollZoomCfg, wheelZoomRate: typeof v === 'number' ? v : undefined}})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.0001}
                                disabled={!enabled || handlers.scrollZoom === false}
                            />
                        </Field>
                        <Field label={'触控板缩放速度'} tip={'scrollZoom.trackpadZoomRate（默认 1/100）'} inline={true}>
                            <InputNumber
                                value={typeof scrollZoomCfg.trackpadZoomRate === 'number' ? scrollZoomCfg.trackpadZoomRate : undefined}
                                onChange={(v) => patchInteraction({scrollZoom: {...scrollZoomCfg, trackpadZoomRate: typeof v === 'number' ? v : undefined}})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.0001}
                                disabled={!enabled || handlers.scrollZoom === false}
                            />
                        </Field>
                    </div>
                </div>
            </div>

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>平移惯性</div>
                <div className={'mlgis-card-desc'}>用于调整拖拽平移的惯性与“跟手感”。</div>
                <div className={'mlgis-grid'}>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'速度线性系数'} tip={'dragPan.linearity'} inline={true}>
                            <InputNumber
                                value={typeof dragPanCfg.linearity === 'number' ? dragPanCfg.linearity : undefined}
                                onChange={(v) => patchInteraction({dragPan: {...dragPanCfg, linearity: typeof v === 'number' ? v : undefined}})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.05}
                                disabled={!enabled || handlers.dragPan === false}
                            />
                        </Field>
                        <Field label={'最大速度'} tip={'dragPan.maxSpeed'} inline={true}>
                            <InputNumber
                                value={typeof dragPanCfg.maxSpeed === 'number' ? dragPanCfg.maxSpeed : undefined}
                                onChange={(v) => patchInteraction({dragPan: {...dragPanCfg, maxSpeed: typeof v === 'number' ? v : undefined}})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={50}
                                disabled={!enabled || handlers.dragPan === false}
                            />
                        </Field>
                    </div>
                    <Field label={'减速率'} tip={'dragPan.deceleration'} inline={true}>
                        <InputNumber
                            value={typeof dragPanCfg.deceleration === 'number' ? dragPanCfg.deceleration : undefined}
                            onChange={(v) => patchInteraction({dragPan: {...dragPanCfg, deceleration: typeof v === 'number' ? v : undefined}})}
                            size={'small'}
                            style={{width: '100%'}}
                            step={50}
                            disabled={!enabled || handlers.dragPan === false}
                        />
                    </Field>
                </div>
            </div>

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>协作手势</div>
                <div className={'mlgis-card-desc'}>开启后需要按 Ctrl/⌘（桌面端）或双指（移动端）才能与地图交互，减少页面滚动冲突。开启/关闭会触发地图重建。</div>
                <div className={'mlgis-grid'}>
                    <Field label={'启用协作手势'} tip={'cooperativeGestures'} inline={true}>
                        <Switch
                            size={'small'}
                            style={{width: 35}}
                            checked={Boolean(interaction.cooperativeGestures)}
                            onChange={(v) => patchInteraction({cooperativeGestures: v}, {refreshMap: true})}
                        />
                    </Field>
                </div>
            </div>

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>交互细节</div>
                <div className={'mlgis-card-desc'}>点击容错与北向吸附等细节设置。修改后需要刷新地图生效。</div>
                <div className={'mlgis-grid'}>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'点击容错（像素）'} tip={'clickTolerance'} inline={true}>
                            <InputNumber
                                value={typeof interaction.clickTolerance === 'number' ? interaction.clickTolerance : undefined}
                                onChange={(v) => patchInteraction({clickTolerance: typeof v === 'number' ? v : undefined})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={1}
                                min={0}
                            />
                        </Field>
                        <Field label={'北向吸附阈值'} tip={'bearingSnap（度）'} inline={true}>
                            <InputNumber
                                value={typeof interaction.bearingSnap === 'number' ? interaction.bearingSnap : undefined}
                                onChange={(v) => patchInteraction({bearingSnap: typeof v === 'number' ? v : undefined})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={1}
                                min={0}
                            />
                        </Field>
                    </div>
                    <div className={'mlgis-interaction-toolbar'}>
                        <Button size={'small'} onClick={() => controller.refreshMap()}>刷新地图使设置生效</Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapLibreGisInteractionConfigPanel;
