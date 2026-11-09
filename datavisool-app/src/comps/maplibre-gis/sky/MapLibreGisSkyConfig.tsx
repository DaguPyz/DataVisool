/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useState} from 'react';
import {ConfigType} from '@/designer/right/ConfigContent.tsx';
import {globalMessage} from "@datavisool/ui";
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController.ts';
import {MapLibreSkyConfig, MapLibreSkyMode} from '@datavisool/sdk/types';
import {applySky} from '@/comps/maplibre-gis/runtime/MapLibreGisMapRuntime.ts';
import '@/comps/maplibre-gis/sky/MapLibreGisSkyConfig.less';
import {MapLibreButton as Button, MapLibreColorPicker as ColorPicker, MapLibreField as Field, MapLibreNumberInput as InputNumber, MapLibreSelect as Select, MapLibreSlider as Slider, MapLibreSwitch as Switch} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';

const defaultSky: MapLibreSkyConfig = {
    enabled: true,
    mode: 'inherit',
    skyColor: '#88C6FC',
    horizonColor: '#ffffff',
    fogColor: '#ffffff',
    skyHorizonBlend: 0.8,
    horizonFogBlend: 0.8,
    fogGroundBlend: 0.5,
    atmosphereBlend: {mode: 'zoom', z1: 10, z2: 12},
};

const presets: Array<{label: string; value: string; config: MapLibreSkyConfig}> = [
    {
        label: '继承底图',
        value: 'inherit',
        config: {...defaultSky, mode: 'inherit', enabled: true},
    },
    {
        label: '白天',
        value: 'day',
        config: {...defaultSky, mode: 'override', skyColor: '#88C6FC', horizonColor: '#ffffff', fogColor: '#ffffff', atmosphereBlend: {mode: 'zoom', z1: 10, z2: 12}},
    },
    {
        label: '黄昏',
        value: 'sunset',
        config: {...defaultSky, mode: 'override', skyColor: '#2a4c8f', horizonColor: '#ffcc88', fogColor: '#ffd4a8', skyHorizonBlend: 0.9, horizonFogBlend: 0.85, atmosphereBlend: {mode: 'zoom', z1: 9, z2: 12}},
    },
    {
        label: '夜景',
        value: 'night',
        config: {...defaultSky, mode: 'override', skyColor: '#06152a', horizonColor: '#162a4a', fogColor: '#0b1d36', skyHorizonBlend: 0.65, horizonFogBlend: 0.8, atmosphereBlend: {mode: 'const', value: 0.25}},
    },
    {
        label: '极简（无雾）',
        value: 'minimal',
        config: {...defaultSky, mode: 'override', fogColor: 'transparent', fogGroundBlend: 0, horizonFogBlend: 0, atmosphereBlend: {mode: 'const', value: 0}},
    },
];

const modeOptions: Array<{label: string; value: MapLibreSkyMode}> = [
    {label: '继承底图', value: 'inherit'},
    {label: '自定义覆盖', value: 'override'},
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const MapLibreGisSkyConfigPanel: React.FC<ConfigType<MapLibreGisController>> = ({controller}) => {
    const style = controller.getConfig()?.style as any;
    const sky = (style?.sky ?? defaultSky) as MapLibreSkyConfig;

    const [, forceRender] = useState(0);
    const [liveSky, setLiveSky] = useState<any>(null);
    const [presetKey, setPresetKey] = useState<string>('');

    const updateSky = (next: MapLibreSkyConfig) => {
        controller.update({style: {sky: next}} as any);
        const map = controller.getMap();
        if (map) {
            try {
                applySky(map as any, (map as any).getStyle?.() ?? {}, next);
            } catch (e) {
                console.error('[MapLibreGisSkyConfig] applySky failed', e);
            }
        }
        forceRender(v => v + 1);
    };

    const patchSky = (patch: Partial<MapLibreSkyConfig>) => {
        updateSky({...sky, ...(patch as any)});
    };

    const readLive = () => {
        const map = controller.getMap();
        if (!map || typeof (map as any).getSky !== 'function') {
            globalMessage.messageApi?.warning('地图尚未初始化或当前版本不支持读取 sky');
            return;
        }
        try {
            const spec = (map as any).getSky();
            setLiveSky(spec);
        } catch (e) {
            console.error('[MapLibreGisSkyConfig] read sky failed', e);
            globalMessage.messageApi?.warning('读取当前 sky 失败');
        }
    };

    const applyLive = () => {
        const map = controller.getMap();
        if (!map || typeof (map as any).getSky !== 'function') {
            globalMessage.messageApi?.warning('地图尚未初始化或当前版本不支持读取 sky');
            return;
        }
        try {
            const spec = (map as any).getSky() as any;
            const ab = spec?.['atmosphere-blend'];
            const next: MapLibreSkyConfig = {
                enabled: true,
                mode: 'override',
                skyColor: spec?.['sky-color'],
                horizonColor: spec?.['horizon-color'],
                fogColor: spec?.['fog-color'],
                skyHorizonBlend: typeof spec?.['sky-horizon-blend'] === 'number' ? spec['sky-horizon-blend'] : undefined,
                horizonFogBlend: typeof spec?.['horizon-fog-blend'] === 'number' ? spec['horizon-fog-blend'] : undefined,
                fogGroundBlend: typeof spec?.['fog-ground-blend'] === 'number' ? spec['fog-ground-blend'] : undefined,
                atmosphereBlend: Array.isArray(ab) ? {mode: 'zoom', z1: 10, z2: 12} : {mode: 'const', value: typeof ab === 'number' ? ab : undefined},
                skyColorTransition: spec?.['sky-color-transition'],
                horizonColorTransition: spec?.['horizon-color-transition'],
                fogColorTransition: spec?.['fog-color-transition'],
                skyHorizonBlendTransition: spec?.['sky-horizon-blend-transition'],
                horizonFogBlendTransition: spec?.['horizon-fog-blend-transition'],
                fogGroundBlendTransition: spec?.['fog-ground-blend-transition'],
                atmosphereBlendTransition: spec?.['atmosphere-blend-transition'],
            };
            updateSky(next);
            setLiveSky(spec);
        } catch (e) {
            console.error('[MapLibreGisSkyConfig] applyLive failed', e);
            globalMessage.messageApi?.warning('应用当前 sky 失败');
        }
    };

    const enabled = sky.enabled !== false;
    const mode = sky.mode ?? 'inherit';
    const abMode = sky.atmosphereBlend?.mode ?? 'zoom';
    const abValue = typeof sky.atmosphereBlend?.value === 'number' ? clamp01(sky.atmosphereBlend!.value!) : 0.8;
    const z1 = typeof sky.atmosphereBlend?.z1 === 'number' ? sky.atmosphereBlend!.z1! : 10;
    const z2 = typeof sky.atmosphereBlend?.z2 === 'number' ? sky.atmosphereBlend!.z2! : 12;

    const showOverride = enabled && mode === 'override';

    return (
        <div className={'mlgis-sky-config'}>
            <div className={'mlgis-sky-toolbar'}>
                <Select
                    value={presetKey}
                    options={[{label: '选择预设', value: ''}, ...presets.map(p => ({label: p.label, value: p.value}))]}
                    onChange={(v) => {
                        setPresetKey(v);
                        const p = presets.find(x => x.value === v);
                        if (p)
                            updateSky(p.config);
                    }}
                    size={'small'}
                    style={{width: 160}}
                />
                <Button size={'small'} onClick={readLive}>读取当前天空</Button>
                <Button type={'primary'} size={'small'} onClick={applyLive}>使用当前天空</Button>
            </div>

            {liveSky ? (
                <div className={'mlgis-sky-live'}>
                    <div className={'mlgis-sky-live-row'}>当前 sky：{String(liveSky?.['sky-color'] ?? '')}</div>
                </div>
            ) : null}

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>基础</div>
                <div className={'mlgis-card-desc'}>天空在 pitch 较大、globe 或 terrain 场景更明显。</div>
                <div className={'mlgis-grid'}>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'启用'} inline={true}>
                            <Switch checked={enabled} size='small' style={{width: 35}} onChange={(v) => patchSky({enabled: v})}/>
                        </Field>
                        <Field label={'模式'} tip={'继承：保持底图 sky；覆盖：使用自定义 sky'} inline={true}>
                            <Select
                                value={mode as any}
                                options={modeOptions}
                                onChange={(v) => patchSky({mode: v as any})}
                                size={'small'}
                                style={{width: '100%'}}
                            />
                        </Field>
                    </div>
                    {!enabled ? (
                        <div className={'mlgis-sky-hint'}>关闭后会移除 sky。</div>
                    ) : mode === 'inherit' ? (
                        <div className={'mlgis-sky-hint'}>当前为继承模式：使用底图自带 sky（若底图无 sky，则表现为默认/无天空）。</div>
                    ) : null}
                </div>
            </div>

            {showOverride ? (
                <>
                    <div className={'mlgis-card'}>
                        <div className={'mlgis-card-title'}>颜色</div>
                        <div className={'mlgis-card-desc'}>fog-color 在启用 terrain 时更明显。</div>
                        <div className={'mlgis-grid'}>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'天空颜色'} tip={'sky-color'} inline={true}>
                                    <ColorPicker size={'small'} value={sky.skyColor ?? '#88C6FC'} onChange={(c) => patchSky({skyColor: c.toHexString()})} showText/>
                                </Field>
                                <Field label={'地平线颜色'} tip={'horizon-color'} inline={true}>
                                    <ColorPicker size={'small'} value={sky.horizonColor ?? '#ffffff'} onChange={(c) => patchSky({horizonColor: c.toHexString()})} showText/>
                                </Field>
                            </div>
                            <Field label={'雾颜色'} tip={'fog-color'} inline={true}>
                                <ColorPicker size={'small'} value={sky.fogColor ?? '#ffffff'} onChange={(c) => patchSky({fogColor: c.toHexString()})} showText/>
                            </Field>
                        </div>
                    </div>

                    <div className={'mlgis-card'}>
                        <div className={'mlgis-card-title'}>混合</div>
                        <div className={'mlgis-card-desc'}>0~1。数值越大越偏向融合/雾化。</div>
                        <div className={'mlgis-grid'}>
                            <Field label={'天空-地平线融合'} tip={'sky-horizon-blend'} inline={true}>
                                <div className={'mlgis-sky-row'}>
                                    <div style={{flex: 1, minWidth: 120}}>
                                        <Slider min={0} max={1} step={0.01} value={typeof sky.skyHorizonBlend === 'number' ? clamp01(sky.skyHorizonBlend) : 0.8} onChange={(v) => patchSky({skyHorizonBlend: typeof v === 'number' ? v : 0.8})}/>
                                    </div>
                                    <InputNumber min={0} max={1} step={0.01} size={'small'} style={{width: 110}} value={typeof sky.skyHorizonBlend === 'number' ? clamp01(sky.skyHorizonBlend) : 0.8} onChange={(v) => patchSky({skyHorizonBlend: typeof v === 'number' ? v : 0.8})}/>
                                </div>
                            </Field>
                            <Field label={'地平线-雾融合'} tip={'horizon-fog-blend'} inline={true}>
                                <div className={'mlgis-sky-row'}>
                                    <div style={{flex: 1, minWidth: 120}}>
                                        <Slider min={0} max={1} step={0.01} value={typeof sky.horizonFogBlend === 'number' ? clamp01(sky.horizonFogBlend) : 0.8} onChange={(v) => patchSky({horizonFogBlend: typeof v === 'number' ? v : 0.8})}/>
                                    </div>
                                    <InputNumber min={0} max={1} step={0.01} size={'small'} style={{width: 110}} value={typeof sky.horizonFogBlend === 'number' ? clamp01(sky.horizonFogBlend) : 0.8} onChange={(v) => patchSky({horizonFogBlend: typeof v === 'number' ? v : 0.8})}/>
                                </div>
                            </Field>
                            <Field label={'雾-地形融合'} tip={'fog-ground-blend（需要 terrain 才更明显）'} inline={true}>
                                <div className={'mlgis-sky-row'}>
                                    <div style={{flex: 1, minWidth: 120}}>
                                        <Slider min={0} max={1} step={0.01} value={typeof sky.fogGroundBlend === 'number' ? clamp01(sky.fogGroundBlend) : 0.5} onChange={(v) => patchSky({fogGroundBlend: typeof v === 'number' ? v : 0.5})}/>
                                    </div>
                                    <InputNumber min={0} max={1} step={0.01} size={'small'} style={{width: 110}} value={typeof sky.fogGroundBlend === 'number' ? clamp01(sky.fogGroundBlend) : 0.5} onChange={(v) => patchSky({fogGroundBlend: typeof v === 'number' ? v : 0.5})}/>
                                </div>
                            </Field>
                        </div>
                    </div>

                    <div className={'mlgis-card'}>
                        <div className={'mlgis-card-title'}>大气</div>
                        <div className={'mlgis-card-desc'}>globe 下建议使用“随缩放隐藏”，避免近景出现厚重大气。</div>
                        <div className={'mlgis-grid'}>
                            <Field label={'模式'} inline={true}>
                                <Select
                                    value={abMode as any}
                                    options={[{label: '常量', value: 'const'}, {label: '随缩放隐藏', value: 'zoom'}]}
                                    onChange={(v) => patchSky({atmosphereBlend: {mode: v as any, value: abValue, z1, z2}})}
                                    size={'small'}
                                    style={{width: '100%'}}
                                />
                            </Field>
                            {abMode === 'const' ? (
                                <Field label={'大气可见度'} tip={'atmosphere-blend'} inline={true}>
                                    <div className={'mlgis-sky-row'}>
                                        <div style={{flex: 1, minWidth: 120}}>
                                            <Slider min={0} max={1} step={0.01} value={abValue} onChange={(v) => patchSky({atmosphereBlend: {mode: 'const', value: typeof v === 'number' ? v : 0.8}})}/>
                                        </div>
                                        <InputNumber min={0} max={1} step={0.01} size={'small'} style={{width: 110}} value={abValue} onChange={(v) => patchSky({atmosphereBlend: {mode: 'const', value: typeof v === 'number' ? v : 0.8}})}/>
                                    </div>
                                </Field>
                            ) : (
                                <Field label={'缩放范围'} tip={'atmosphere-blend（按 zoom 插值）'} inline={true}>
                                    <div className={'mlgis-sky-row'}>
                                        <InputNumber min={0} max={24} step={0.5} size={'small'} style={{width: 110}} value={z1} onChange={(v) => patchSky({atmosphereBlend: {mode: 'zoom', z1: typeof v === 'number' ? v : 10, z2}})}/>
                                        <span className={'mlgis-sky-zoom-sep'}>→</span>
                                        <InputNumber min={0} max={24} step={0.5} size={'small'} style={{width: 110}} value={z2} onChange={(v) => patchSky({atmosphereBlend: {mode: 'zoom', z1, z2: typeof v === 'number' ? v : 12}})}/>
                                    </div>
                                </Field>
                            )}
                        </div>
                    </div>

                    <div className={'mlgis-card'}>
                        <div className={'mlgis-card-title'}>过渡</div>
                        <div className={'mlgis-card-desc'}>毫秒，切换预设或调整参数时的平滑过渡。</div>
                        <div className={'mlgis-grid'}>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'过渡时长(ms)'} tip={'sky-color-transition'} inline={true}>
                                    <InputNumber
                                        style={{width: '100%'}}
                                        value={sky.skyColorTransition?.duration}
                                        onChange={(v) => patchSky({skyColorTransition: {...(sky.skyColorTransition ?? {}), duration: typeof v === 'number' ? v : undefined}})}
                                        min={0}
                                        step={50}
                                        size={'small'}
                                    />
                                </Field>
                                <Field label={'延迟(ms)'} tip={'sky-color-transition'} inline={true}>
                                    <InputNumber
                                        style={{width: '100%'}}
                                        value={sky.skyColorTransition?.delay}
                                        onChange={(v) => patchSky({skyColorTransition: {...(sky.skyColorTransition ?? {}), delay: typeof v === 'number' ? v : undefined}})}
                                        min={0}
                                        step={50}
                                        size={'small'}
                                    />
                                </Field>
                            </div>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default MapLibreGisSkyConfigPanel;
