/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useState} from 'react';
import { ConfigType } from '@/designer/right/ConfigContent.tsx';
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController.ts';
import {globalMessage} from "@datavisool/ui";
import { MapLibreLightAnchor, MapLibreLightConfig } from '@datavisool/sdk/types';
import { applyLight } from '@/comps/maplibre-gis/runtime/MapLibreGisMapRuntime.ts';
import '@/comps/maplibre-gis/light/MapLibreGisLightConfig.less';
import {MapLibreButton as Button, MapLibreColorPicker as ColorPicker, MapLibreField as Field, MapLibreNumberInput as InputNumber, MapLibreSelect as Select, MapLibreSlider as Slider, MapLibreSwitch as Switch} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';

const defaultLight: MapLibreLightConfig = {
    enabled: true,
    anchor: 'map',
    position: { r: 1.5, a: 90, p: 80 },
    color: '#ffffff',
    intensity: 0.5,
};

const presets: Array<{ label: string; value: string; config: MapLibreLightConfig }> = [
    { label: '白天', value: 'day', config: { ...defaultLight, color: '#ffffff', intensity: 0.55, position: { r: 1.5, a: 90, p: 80 } } },
    { label: '黄昏', value: 'sunset', config: { ...defaultLight, color: '#ffcc88', intensity: 0.7, position: { r: 1.25, a: 260, p: 55 } } },
    { label: '夜景', value: 'night', config: { ...defaultLight, color: '#7aa6ff', intensity: 0.25, position: { r: 1.2, a: 210, p: 35 } } },
    { label: '顶部光', value: 'top', config: { ...defaultLight, color: '#ffffff', intensity: 0.6, position: { r: 1.0, a: 0, p: 10 } } },
    { label: '侧光', value: 'side', config: { ...defaultLight, color: '#ffffff', intensity: 0.75, position: { r: 1.2, a: 90, p: 60 } } },
];

const anchorOptions: Array<{ label: string; value: MapLibreLightAnchor }> = [
    { label: '跟随地图（map）', value: 'map' },
    { label: '跟随屏幕（viewport）', value: 'viewport' },
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const MapLibreGisLightConfigPanel: React.FC<ConfigType<MapLibreGisController>> = ({ controller }) => {
    const style = controller.getConfig()?.style as any;
    const light = (style?.light ?? defaultLight) as MapLibreLightConfig;

    const [, forceRender] = useState(0);
    const [liveLight, setLiveLight] = useState<any>(null);
    const [presetKey, setPresetKey] = useState<string>('');

    const updateLight = (next: MapLibreLightConfig) => {
        controller.update({ style: { light: next } } as any);
        const map = controller.getMap();
        if (map)
            applyLight(map as any, next);
        forceRender(v => v + 1);
    };

    const patchLight = (patch: Partial<MapLibreLightConfig>) => {
        updateLight({ ...light, ...(patch as any) });
    };

    const readLive = () => {
        const map = controller.getMap();
        if (!map || typeof (map as any).getLight !== 'function') {
            globalMessage.messageApi?.warning('地图尚未初始化或当前版本不支持读取 light');
            return;
        }
        try {
            const spec = (map as any).getLight();
            setLiveLight(spec);
        } catch {
            globalMessage.messageApi?.warning('读取当前 light 失败');
        }
    };

    const applyLive = () => {
        const map = controller.getMap();
        if (!map || typeof (map as any).getLight !== 'function') {
            globalMessage.messageApi?.warning('地图尚未初始化或当前版本不支持读取 light');
            return;
        }
        try {
            const spec = (map as any).getLight();
            const next: MapLibreLightConfig = {
                enabled: true,
                anchor: (spec?.anchor ?? 'viewport') as any,
                position: Array.isArray(spec?.position) ? { r: spec.position[0], a: spec.position[1], p: spec.position[2] } : undefined,
                color: spec?.color,
                intensity: typeof spec?.intensity === 'number' ? spec.intensity : undefined,
                colorTransition: spec?.['color-transition'],
                intensityTransition: spec?.['intensity-transition'],
                positionTransition: spec?.['position-transition'],
            };
            updateLight(next);
            setLiveLight(spec);
        } catch {
            globalMessage.messageApi?.warning('应用当前 light 失败');
        }
    };

    const pos = light.position ?? defaultLight.position!;
    const enabled = light.enabled !== false;

    return (
        <div className={'mlgis-light-config'}>
            <div className={'mlgis-light-toolbar'}>
                <Select
                    value={presetKey}
                    options={[{ label: '选择预设', value: '' }, ...presets.map(p => ({ label: p.label, value: p.value }))]}
                    onChange={(v) => {
                        setPresetKey(v);
                        const p = presets.find(x => x.value === v);
                        if (p)
                            updateLight(p.config);
                    }}
                    size={'small'}
                    style={{ width: 160 }}
                />
                <Button size={'small'} onClick={readLive}>读取当前光照</Button>
                <Button type={'primary'} size={'small'} onClick={applyLive}>使用当前光照</Button>
            </div>

            {liveLight ? (
                <div className={'mlgis-light-live'}>
                    <div className={'mlgis-light-live-row'}>当前 light：{String(liveLight?.anchor ?? '')}</div>
                </div>
            ) : null}

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>基础</div>
                <div className={'mlgis-card-desc'}>光照主要影响 3D 挤出（fill-extrusion）等“有高度”的图层。</div>
                <div className={'mlgis-grid'}>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'启用'} inline={true}>
                            <Switch checked={enabled} size='small' style={{ width: 35 }} onChange={(v) => patchLight({ enabled: v })} />
                        </Field>
                        <Field label={'锚点'} tip={'map：随地图旋转；viewport：随屏幕方向'} inline={true}>
                            <Select
                                value={(light.anchor ?? 'map') as any}
                                options={anchorOptions}
                                onChange={(v) => patchLight({ anchor: v as any })}
                                size={'small'}
                                style={{ width: '100%' }}
                            />
                        </Field>
                    </div>
                    <Field label={'强度'} tip={'0~1，越大对比越强'} inline={true}>
                        <div className={'mlgis-light-row'}>
                            <div style={{ flex: 1, minWidth: 120 }}>
                                <Slider
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={typeof light.intensity === 'number' ? clamp01(light.intensity) : 0.5}
                                    onChange={(v) => patchLight({ intensity: typeof v === 'number' ? v : 0.5 })}
                                />
                            </div>
                            <InputNumber
                                min={0}
                                max={1}
                                step={0.01}
                                value={typeof light.intensity === 'number' ? clamp01(light.intensity) : 0.5}
                                onChange={(v) => patchLight({ intensity: typeof v === 'number' ? v : 0.5 })}
                                size={'small'}
                                style={{ width: 110 }}
                            />
                        </div>
                    </Field>
                    <Field label={'颜色'} inline={true}>
                        <ColorPicker
                            size={'small'}
                            value={light.color ?? '#ffffff'}
                            onChange={(c) => patchLight({ color: c.toHexString() })}
                            showText
                        />
                    </Field>
                </div>
            </div>

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>位置</div>
                <div className={'mlgis-card-desc'}>r：距离；a：方位角（0~360）；p：高度角（0~180）。</div>
                <div className={'mlgis-grid'}>
                    <Field label={'距离 r'} inline={true}>
                        <div className={'mlgis-light-row'}>
                            <div style={{ flex: 1, minWidth: 120 }}>
                                <Slider
                                    min={0}
                                    max={3}
                                    step={0.01}
                                    value={typeof pos.r === 'number' ? pos.r : 1.15}
                                    onChange={(v) => patchLight({ position: { ...pos, r: typeof v === 'number' ? v : 1.15 } })}
                                />
                            </div>
                            <InputNumber
                                min={0}
                                max={3}
                                step={0.01}
                                value={typeof pos.r === 'number' ? pos.r : 1.15}
                                onChange={(v) => patchLight({ position: { ...pos, r: typeof v === 'number' ? v : 1.15 } })}
                                size={'small'}
                                style={{ width: 110 }}
                            />
                        </div>
                    </Field>
                    <Field label={'方位角 a'} inline={true}>
                        <div className={'mlgis-light-row'}>
                            <div style={{ flex: 1, minWidth: 120 }}>
                                <Slider
                                    min={0}
                                    max={360}
                                    step={1}
                                    value={typeof pos.a === 'number' ? pos.a : 210}
                                    onChange={(v) => patchLight({ position: { ...pos, a: typeof v === 'number' ? v : 210 } })}
                                />
                            </div>
                            <InputNumber
                                min={0}
                                max={360}
                                step={1}
                                value={typeof pos.a === 'number' ? pos.a : 210}
                                onChange={(v) => patchLight({ position: { ...pos, a: typeof v === 'number' ? v : 210 } })}
                                size={'small'}
                                style={{ width: 110 }}
                            />
                        </div>
                    </Field>
                    <Field label={'高度角 p'} inline={true}>
                        <div className={'mlgis-light-row'}>
                            <div style={{ flex: 1, minWidth: 120 }}>
                                <Slider
                                    min={0}
                                    max={180}
                                    step={1}
                                    value={typeof pos.p === 'number' ? pos.p : 30}
                                    onChange={(v) => patchLight({ position: { ...pos, p: typeof v === 'number' ? v : 30 } })}
                                />
                            </div>
                            <InputNumber
                                min={0}
                                max={180}
                                step={1}
                                value={typeof pos.p === 'number' ? pos.p : 30}
                                onChange={(v) => patchLight({ position: { ...pos, p: typeof v === 'number' ? v : 30 } })}
                                size={'small'}
                                style={{ width: 110 }}
                            />
                        </div>
                    </Field>
                </div>
            </div>

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>过渡</div>
                <div className={'mlgis-card-desc'}>切换预设或调整参数时的平滑过渡（毫秒）。</div>
                <div className={'mlgis-grid'}>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'颜色 duration'} inline={true}>
                            <InputNumber style={{ width: '100%' }} value={light.colorTransition?.duration} onChange={(v) => patchLight({ colorTransition: { ...(light.colorTransition ?? {}), duration: typeof v === 'number' ? v : undefined } })} min={0} step={50} size={'small'} />
                        </Field>
                        <Field label={'颜色 delay'} inline={true}>
                            <InputNumber style={{ width: '100%' }} value={light.colorTransition?.delay} onChange={(v) => patchLight({ colorTransition: { ...(light.colorTransition ?? {}), delay: typeof v === 'number' ? v : undefined } })} min={0} step={50} size={'small'} />
                        </Field>
                    </div>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'强度 duration'} inline={true}>
                            <InputNumber style={{ width: '100%' }} value={light.intensityTransition?.duration} onChange={(v) => patchLight({ intensityTransition: { ...(light.intensityTransition ?? {}), duration: typeof v === 'number' ? v : undefined } })} min={0} step={50} size={'small'} />
                        </Field>
                        <Field label={'强度 delay'} inline={true}>
                            <InputNumber style={{ width: '100%' }} value={light.intensityTransition?.delay} onChange={(v) => patchLight({ intensityTransition: { ...(light.intensityTransition ?? {}), delay: typeof v === 'number' ? v : undefined } })} min={0} step={50} size={'small'} />
                        </Field>
                    </div>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'位置 duration'} inline={true}>
                            <InputNumber style={{ width: '100%' }} value={light.positionTransition?.duration} onChange={(v) => patchLight({ positionTransition: { ...(light.positionTransition ?? {}), duration: typeof v === 'number' ? v : undefined } })} min={0} step={50} size={'small'} />
                        </Field>
                        <Field label={'位置 delay'} inline={true}>
                            <InputNumber style={{ width: '100%' }} value={light.positionTransition?.delay} onChange={(v) => patchLight({ positionTransition: { ...(light.positionTransition ?? {}), delay: typeof v === 'number' ? v : undefined } })} min={0} step={50} size={'small'} />
                        </Field>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapLibreGisLightConfigPanel;
