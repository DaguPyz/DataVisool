/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useState} from 'react';
import {ConfigType} from '@/designer/right/ConfigContent.tsx';
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController.ts';
import {globalMessage} from "@datavisool/ui";
import {MapLibreButton as Button, MapLibreField as Field, MapLibreNumberInput as InputNumber} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';
import {
    MapLibreCameraConfig,
    MapLibreCameraConstraintsConfig
} from '@datavisool/sdk/types';
import '@/comps/maplibre-gis/camera/MapLibreGisCameraConfig.less';
import {readCurrentCamera} from "@/comps/maplibre-gis/camera/CameraTools.ts";
import {applyCamera, applyCameraConstraints} from "@/comps/maplibre-gis/runtime/MapLibreGisMapRuntime.ts";

/**
 * “视角（camera）”配置面板
 *
 * 主要能力：
 * - 支持读取当前地图相机状态，并“一键写回配置”
 * - 支持设置相机约束（maxBounds/minZoom/maxZoom/minPitch/maxPitch）
 *
 * 交互方式：
 * - 所有修改都通过 controller.update({style:{camera: ...}}) 写回配置
 * - 地图效果由 controller 直接调用 map API 应用（非 React 重渲染）
 */
const defaultCenter: [number, number] = [120.2446746826172, 30.199146446037616];

/**
 * 简单范围裁剪，用于生成默认 bounds（避免超过经纬度合法范围）。
 */
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * 在没有显式 bounds 时，基于 center 生成一个“可用的默认 bounds”。
 * - 该 bounds 只用于表单初始化/回显，不代表业务上的最佳范围。
 */
const makeBoundsFromCenter = (center?: [number, number]): [number, number, number, number] => {
    const c = center ?? defaultCenter;
    const lng = typeof c[0] === 'number' ? c[0] : defaultCenter[0];
    const lat = typeof c[1] === 'number' ? c[1] : defaultCenter[1];
    const w = clamp(lng - 0.5, -180, 180);
    const e = clamp(lng + 0.5, -180, 180);
    const s = clamp(lat - 0.5, -85, 85);
    const n = clamp(lat + 0.5, -85, 85);
    return [w, s, e, n];
};

const MapLibreGisCameraConfigPanel: React.FC<ConfigType<MapLibreGisController>> = ({controller}) => {
    const style = controller.getConfig()?.style as any;
    const camera = (style?.camera ?? {mode: 'center'}) as MapLibreCameraConfig;

    const [, forceRender] = useState(0);
    const [liveCamera, setLiveCamera] = useState<{
        center: [number, number];
        zoom: number;
        bearing: number;
        pitch: number
    } | null>(null);

    const updateCamera = (next: MapLibreCameraConfig) => {
        /**
         * 写回配置并刷新面板 UI。
         * 注意：这里的 forceRender 只影响“配置面板自身”的展示，不会驱动地图重渲染。
         */
        controller.update({style: {camera: next}} as any);
        const map = controller.getMap();
        if (map) {
            try {
                applyCameraConstraints(map as any, next.constraints);
            } catch (e) {
                console.error('[MapLibreGisCameraConfig] applyCameraConstraints failed', e);
            }
            try {
                applyCamera(map as any, next);
            } catch (e) {
                console.error('[MapLibreGisCameraConfig] applyCamera failed', e);
            }
        }
        forceRender(v => v + 1);
    };

    const patchCamera = (patch: Partial<MapLibreCameraConfig>) => {
        updateCamera({...camera, ...(patch as any)});
    };

    const patchConstraints = (patch: Partial<MapLibreCameraConstraintsConfig>) => {
        patchCamera({constraints: {...(camera.constraints ?? {}), ...(patch as any)}});
    };

    const setCenterPart = (idx: 0 | 1, v: number | null) => {
        const n = typeof v === 'number' && Number.isFinite(v) ? v : undefined;
        if (n == null)
            return;
        const current = camera.center ?? defaultCenter;
        const next: [number, number] = [...current] as any;
        next[idx] = n;
        patchCamera({center: next});
    };

    const setConstraintBoundsPart = (idx: 0 | 1 | 2 | 3, v: number | null) => {
        const n = typeof v === 'number' && Number.isFinite(v) ? v : undefined;
        if (n == null)
            return;
        const current = camera.constraints?.maxBounds ?? makeBoundsFromCenter(camera.center);
        const next: [number, number, number, number] = [...current] as any;
        next[idx] = n;
        patchConstraints({maxBounds: next});
    };

    const readLive = () => {
        const c = readCurrentCamera(controller.getMap());
        if (!c) {
            globalMessage.messageApi?.warning('地图尚未初始化，无法读取当前视角');
            return;
        }
        setLiveCamera(c);
    };

    const useLiveAsCamera = () => {
        const c = readCurrentCamera(controller.getMap());
        if (!c) {
            globalMessage.messageApi?.warning('地图尚未初始化，无法读取当前视角');
            return;
        }
        patchCamera({center: c.center, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch});
        setLiveCamera(c);
    };

    const clearConstraints = () => patchCamera({constraints: undefined});

    const showConstraints = Boolean(camera.constraints);

    return (
        <div className={'mlgis-camera-config'}>
            <div className={'mlgis-camera-toolbar'}>
                <Button size={'small'} onClick={readLive}>读取当前视角</Button>
                <Button type={'primary'} size={'small'} onClick={useLiveAsCamera}>使用当前视角</Button>
                <Button size={'small'} onClick={() => controller.getMap()?.resetNorth()}>回正北向</Button>
                <Button size={'small'} onClick={() => controller.getMap()?.resetNorthPitch()}>回正北向+俯仰</Button>
            </div>

            {liveCamera ? (
                <div className={'mlgis-camera-live'}>
                    <div className={'mlgis-camera-live-row'}>
                        <span>中心点（center）：</span>
                        <span>{liveCamera.center[0].toFixed(6)}, {liveCamera.center[1].toFixed(6)}</span>
                    </div>
                    <div className={'mlgis-camera-live-row'}>
                        <span>缩放（zoom）：</span>
                        <span>{liveCamera.zoom.toFixed(2)}</span>
                        <span>旋转（bearing）：</span>
                        <span>{liveCamera.bearing.toFixed(2)}</span>
                        <span>俯仰（pitch）：</span>
                        <span>{liveCamera.pitch.toFixed(2)}</span>
                    </div>
                </div>
            ) : null}

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>初始视角</div>
                <div className={'mlgis-card-desc'}>保存后地图会以该视角初始化；编辑时修改会立即生效。</div>
                <div className={'mlgis-grid'}>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'经度'} tip={'center[0]'} inline={true}>
                            <InputNumber
                                value={camera.center?.[0] ?? defaultCenter[0]}
                                onChange={(v) => setCenterPart(0, typeof v === 'number' ? v : null)}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.000001}
                            />
                        </Field>
                        <Field label={'纬度'} tip={'center[1]'} inline={true}>
                            <InputNumber
                                value={camera.center?.[1] ?? defaultCenter[1]}
                                onChange={(v) => setCenterPart(1, typeof v === 'number' ? v : null)}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.000001}
                            />
                        </Field>
                    </div>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'缩放'} inline={true}>
                            <InputNumber
                                value={typeof camera.zoom === 'number' ? camera.zoom : 10}
                                onChange={(v) => patchCamera({zoom: typeof v === 'number' ? v : camera.zoom})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.1}
                            />
                        </Field>
                        <Field label={'旋转'} inline={true}>
                            <InputNumber
                                value={typeof camera.bearing === 'number' ? camera.bearing : 0}
                                onChange={(v) => patchCamera({bearing: typeof v === 'number' ? v : camera.bearing})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={1}
                            />
                        </Field>
                    </div>
                    <Field label={'俯仰'} inline={true}>
                        <InputNumber
                            value={typeof camera.pitch === 'number' ? camera.pitch : 0}
                            onChange={(v) => patchCamera({pitch: typeof v === 'number' ? v : camera.pitch})}
                            size={'small'}
                            style={{width: '100%'}}
                            step={1}
                        />
                    </Field>
                </div>
            </div>

            <div className={'mlgis-card'}>
                <div className={'mlgis-card-title'}>视角约束</div>
                <div className={'mlgis-card-desc'}>限制用户交互与程序调用时允许的缩放、俯仰与可拖拽范围。</div>
                <div className={'mlgis-grid'}>
                    <div className={'mlgis-camera-constraints-toolbar'}>
                        <Button size={'small'} danger={true} onClick={clearConstraints}
                                disabled={!showConstraints}>清空约束</Button>
                    </div>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'最小缩放'} tip={'minZoom'} inline={true}>
                            <InputNumber
                                value={typeof camera.constraints?.minZoom === 'number' ? camera.constraints.minZoom : undefined}
                                onChange={(v) => patchConstraints({minZoom: typeof v === 'number' ? v : undefined})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.1}
                            />
                        </Field>
                        <Field label={'最大缩放'} tip={'maxZoom'} inline={true}>
                            <InputNumber
                                value={typeof camera.constraints?.maxZoom === 'number' ? camera.constraints.maxZoom : undefined}
                                onChange={(v) => patchConstraints({maxZoom: typeof v === 'number' ? v : undefined})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.1}
                            />
                        </Field>
                    </div>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'最小俯仰'} tip={'minPitch'} inline={true}>
                            <InputNumber
                                value={typeof camera.constraints?.minPitch === 'number' ? camera.constraints.minPitch : undefined}
                                onChange={(v) => patchConstraints({minPitch: typeof v === 'number' ? v : undefined})}
                                size={'small'}
                                style={{width: '100%'}}
                                step={1}
                            />
                        </Field>
                        <Field label={'最大俯仰'} tip={'maxPitch'} inline={true}>
                            <InputNumber
                                value={typeof camera.constraints?.maxPitch === 'number' ? camera.constraints.maxPitch : undefined}
                                onChange={(v) => {
                                    if (typeof v !== 'number') {
                                        patchConstraints({maxPitch: undefined});
                                        return;
                                    }
                                    const corrected = Math.min(90, Math.max(0, v));
                                    if (corrected !== v)
                                        console.warn('[MapLibreGisCameraConfig] maxPitch corrected', {from: v, to: corrected});
                                    patchConstraints({maxPitch: corrected});
                                }}
                                size={'small'}
                                style={{width: '100%'}}
                                step={1}
                                min={0}
                                max={90}
                            />
                        </Field>
                    </div>

                    <div className={'mlgis-card-title'} style={{marginTop: 6}}>最大范围（maxBounds）</div>
                    <div className={'mlgis-card-desc'}>提示：maxBounds 更适用于 mercator（墨卡托）投影的“平面拖拽”限制；在 globe（球体）投影下可能表现为可继续旋转地球，效果不一定符合直觉。</div>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'西（west）'} inline={true}>
                            <InputNumber
                                value={(camera.constraints?.maxBounds ?? makeBoundsFromCenter(camera.center))[0]}
                                onChange={(v) => setConstraintBoundsPart(0, typeof v === 'number' ? v : null)}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.000001}
                            />
                        </Field>
                        <Field label={'南（south）'} inline={true}>
                            <InputNumber
                                value={(camera.constraints?.maxBounds ?? makeBoundsFromCenter(camera.center))[1]}
                                onChange={(v) => setConstraintBoundsPart(1, typeof v === 'number' ? v : null)}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.000001}
                            />
                        </Field>
                    </div>
                    <div className={'mlgis-grid-2'}>
                        <Field label={'东（east）'} inline={true}>
                            <InputNumber
                                value={(camera.constraints?.maxBounds ?? makeBoundsFromCenter(camera.center))[2]}
                                onChange={(v) => setConstraintBoundsPart(2, typeof v === 'number' ? v : null)}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.000001}
                            />
                        </Field>
                        <Field label={'北（north）'} inline={true}>
                            <InputNumber
                                value={(camera.constraints?.maxBounds ?? makeBoundsFromCenter(camera.center))[3]}
                                onChange={(v) => setConstraintBoundsPart(3, typeof v === 'number' ? v : null)}
                                size={'small'}
                                style={{width: '100%'}}
                                step={0.000001}
                            />
                        </Field>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapLibreGisCameraConfigPanel;
