/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import { Map as MapLibreMap } from 'maplibre-gl';
import {
    MapLibreCameraConfig,
    MapLibreCameraConstraintsConfig,
    MapLibreDragPanConfig,
    MapLibreGisComponentStyle,
    MapLibreInteractionConfig,
    MapLibreLightConfig,
    MapLibreSkyConfig,
    MapLibreTerrainConfig,
    MapLibreProjectionConfig,
    MapLibreProjectionType,
    MapLibreScrollZoomConfig
} from '@datavisool/sdk/types';

/**
 * MapLibre 运行态（runtime）适配器
 *
 * 目标：
 * - 把「组件配置（style.xxx）」转换为「直接调用 map 实例的 API」
 * - 不依赖 React 的 state/useEffect，也不依赖重渲染
 *
 * 设计原则：
 * - 只做 1:1 的“配置 → map 方法”映射，不做业务逻辑拼装
 * - 允许在不同 MapLibre 版本下“能力缺失”，因此很多地方采用 try/catch 防御
 * - 对一些容易把 handler 带崩的参数做合理范围收敛，避免内部计算出现 NaN
 */
export const emptyStyle = {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0b1220' } }]
} as any;

/**
 * 根据组件的 base 配置决定当前 map 的 style。
 * - 使用 styleUrl（字符串 URL）
 * - 都没有则回退到最小可渲染的 emptyStyle
 */
export const resolveBaseStyle = (style?: MapLibreGisComponentStyle): any => {
    const base = style?.base;
    if (base?.styleUrl && base.styleUrl.trim() !== '')
        return base.styleUrl;
    return emptyStyle;
};

/**
 * 将任意输入规范化为 maplibre 可接受的 center: [lng, lat]。
 * - 不是数组 / 长度不足：返回 undefined
 * - 不能转成 finite number：返回 undefined
 */
export const normalizeCenter = (v?: any): [number, number] | undefined => {
    if (!Array.isArray(v) || v.length < 2)
        return undefined;
    const lng = Number(v[0]);
    const lat = Number(v[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat))
        return undefined;
    return [lng, lat];
};

/**
 * 将 bounds: [w, s, e, n] 规范化为 MapLibre 可接受的 [[w,s],[e,n]]。
 */
export const normalizeBounds = (b?: [number, number, number, number]): [[number, number], [number, number]] | undefined => {
    if (!b || b.length !== 4)
        return undefined;
    const [w, s, e, n] = b;
    if (![w, s, e, n].every(Number.isFinite))
        return undefined;
    return [[w, s], [e, n]];
};

/**
 * 将 camera.constraints 应用到 map 上。
 * - 该方法会直接调用 map.setMaxBounds / setMinZoom / setMaxZoom 等 API
 * - 传 undefined 给 MapLibre 时表示解除限制
 */
export const applyCameraConstraints = (map: MapLibreMap, constraints?: MapLibreCameraConstraintsConfig) => {
    const b = normalizeBounds(constraints?.maxBounds);
    map.setMaxBounds(b as any);
    map.setMinZoom(typeof constraints?.minZoom === 'number' ? constraints?.minZoom : undefined);
    map.setMaxZoom(typeof constraints?.maxZoom === 'number' ? constraints?.maxZoom : undefined);
    map.setMinPitch(typeof constraints?.minPitch === 'number' ? constraints?.minPitch : undefined);
    map.setMaxPitch(typeof constraints?.maxPitch === 'number' ? constraints?.maxPitch : undefined);
};

/**
 * 将 camera 配置应用到 map 上。
 * - mode=bounds：优先 fitBounds（并可额外设置 bearing/pitch）
 * - 其他情况：按 center/zoom/bearing/pitch 单项更新
 *
 * 注意：这是“立即生效”的命令式更新，不会维护历史/动画等复杂状态。
 */
export const applyCamera = (map: MapLibreMap, camera?: MapLibreCameraConfig) => {
    if (!camera)
        return;
    if (camera.center)
        map.setCenter(camera.center);
    if (typeof camera.zoom === 'number')
        map.setZoom(camera.zoom);
    if (typeof camera.bearing === 'number')
        map.setBearing(camera.bearing);
    if (typeof camera.pitch === 'number')
        map.setPitch(camera.pitch);
};

/**
 * Projection type 的白名单规范化。
 * 避免传入未知字符串导致 map.setProjection 抛错。
 */
const normalizeProjectionType = (t?: MapLibreProjectionType): MapLibreProjectionType => {
    if (t === 'globe' || t === 'vertical-perspective' || t === 'mercator')
        return t;
    return 'mercator';
};

/**
 * 构造 map.setProjection 所需的 spec。
 * - mode=zoom_interpolate：构造 expression，在不同 zoom 段使用不同投影
 * - 其他：返回 {type}
 */
const buildProjectionSpec = (p?: MapLibreProjectionConfig): any => {
    if (!p)
        return { type: 'mercator' };
    if (p.mode === 'zoom_interpolate' && p.zoomInterpolate) {
        const { z1, z2, from, to } = p.zoomInterpolate;
        const a = normalizeProjectionType(from);
        const b = normalizeProjectionType(to);
        const x1 = typeof z1 === 'number' ? z1 : 10;
        const x2 = typeof z2 === 'number' ? z2 : 12;
        return { type: ['interpolate', ['linear'], ['zoom'], x1, a, x2, b] };
    }
    return { type: normalizeProjectionType(p.type) };
};

/**
 * 将 projection 配置应用到 map 上。
 *
 * 兼容性说明：
 * - zoom_interpolate 的 expression 在部分情况下可能会抛错（例如当前版本不支持）
 * - 捕获异常后退化为“根据当前 zoom 选择 from/to 中的一种投影”
 */
export const applyProjection = (map: MapLibreMap, projection?: MapLibreProjectionConfig) => {
    if (!projection) {
        map.setProjection({ type: 'mercator' } as any);
        return;
    }
    if (projection.mode === 'zoom_interpolate' && projection.zoomInterpolate) {
        try {
            map.setProjection(buildProjectionSpec(projection));
            return;
        } catch {
            const { z1, z2, from, to } = projection.zoomInterpolate;
            const a = typeof z1 === 'number' ? z1 : 10;
            const b = typeof z2 === 'number' ? z2 : 12;
            const mid = (a + b) / 2;
            const current = map.getZoom();
            const t = current < mid ? from : to;
            map.setProjection({ type: normalizeProjectionType(t) } as any);
            return;
        }
    }
    map.setProjection({ type: normalizeProjectionType(projection.type) } as any);
};

const normalizeInteractionEnabled = (enabled?: boolean) => {
    return enabled !== false;
};

/**
 * wheelZoomRate 的安全化处理：
 * - 只允许 > 0 的有限数
 * - 使用 Math.abs 避免配置为负数导致“反向缩放”
 */
const normalizeWheelZoomRate = (cfg?: MapLibreScrollZoomConfig): number | undefined => {
    if (typeof cfg?.wheelZoomRate === 'number' && Number.isFinite(cfg.wheelZoomRate)) {
        const v = Math.abs(cfg.wheelZoomRate);
        return v > 0 ? v : undefined;
    }
    return undefined;
};

/**
 * trackpadZoomRate 的安全化处理：
 * - 只允许 > 0 的有限数
 * - 使用 Math.abs 避免配置为负数导致“反向缩放”
 */
const normalizeTrackpadZoomRate = (cfg?: MapLibreScrollZoomConfig): number | undefined => {
    if (typeof cfg?.trackpadZoomRate === 'number' && Number.isFinite(cfg.trackpadZoomRate)) {
        const v = Math.abs(cfg.trackpadZoomRate);
        return v > 0 ? v : undefined;
    }
    return undefined;
};

/**
 * dragPan.enable(options) 的参数清洗。
 *
 * 为什么要做范围收敛：
 * - 一些非法值（例如 0/负数）在 MapLibre 内部会参与速度/惯性计算
 * - 可能导致除零/无穷大/NaN，最终引发 Invalid LngLat (NaN, NaN)
 */
const normalizeDragPanOptions = (cfg?: MapLibreDragPanConfig): any | undefined => {
    if (!cfg)
        return undefined;
    const out: any = {};
    if (typeof cfg.linearity === 'number' && Number.isFinite(cfg.linearity) && cfg.linearity > 0 && cfg.linearity <= 1)
        out.linearity = cfg.linearity;
    if (typeof cfg.maxSpeed === 'number' && Number.isFinite(cfg.maxSpeed) && cfg.maxSpeed > 0)
        out.maxSpeed = cfg.maxSpeed;
    if (typeof cfg.deceleration === 'number' && Number.isFinite(cfg.deceleration) && cfg.deceleration > 0)
        out.deceleration = cfg.deceleration;
    return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * 统一封装 handler 的 enable/disable 调用。
 * - handlerName 对应 map 上的同名属性，例如 map.dragPan / map.scrollZoom
 * - enableArgs 用于支持个别 handler 的 enable(options) 形式
 * - 该方法不做 isEnabled 判断，属于“幂等/尽量幂等”的设置：重复 enable/disable 由 MapLibre 自己兜底
 */
const setHandlerEnabled = (map: MapLibreMap, handlerName: string, enabled: boolean, enableArgs?: any[]) => {
    const handler = (map as any)[handlerName];
    if (!handler)
        return;
    if (enabled) {
        if (typeof handler.enable === 'function') {
            if (enableArgs && enableArgs.length > 0)
                handler.enable(...enableArgs);
            else
                handler.enable();
        }
    } else {
        if (typeof handler.disable === 'function')
            handler.disable();
    }
};

/**
 * 将 interaction 配置应用到 map 的交互 handlers 上。
 *
 * 覆盖范围：
 * - 总开关：interaction.enabled
 * - handler 开关：dragPan/scrollZoom/... 等
 * - scrollZoom 参数：aroundCenter、wheelZoomRate、trackpadZoomRate
 * - 附加参数：bearingSnap、clickTolerance（若运行时 API 存在）
 * - cooperativeGestures（若运行时 API 存在）
 */
export const applyInteraction = (map: MapLibreMap, interaction?: MapLibreInteractionConfig) => {
    const enabled = normalizeInteractionEnabled(interaction?.enabled);
    const h = interaction?.handlers ?? {};

    const isOn = (key: keyof NonNullable<MapLibreInteractionConfig['handlers']>) => {
        if (!enabled)
            return false;
        return (h as any)[key] !== false;
    };

    setHandlerEnabled(map, 'dragPan', isOn('dragPan'), [normalizeDragPanOptions(interaction?.dragPan)].filter(Boolean));

    const wantScrollZoom = isOn('scrollZoom');
    if (wantScrollZoom) {
        const aroundCenter = Boolean(interaction?.scrollZoom?.aroundCenter);
        setHandlerEnabled(map, 'scrollZoom', true, aroundCenter ? [{ around: 'center' }] : []);
        try {
            const wr = normalizeWheelZoomRate(interaction?.scrollZoom);
            if (typeof wr === 'number')
                (map.scrollZoom as any).setWheelZoomRate(wr);
            const tr = normalizeTrackpadZoomRate(interaction?.scrollZoom);
            if (typeof tr === 'number')
                (map.scrollZoom as any).setZoomRate(tr);
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applyInteraction scrollZoom rate failed', e);
        }
    } else {
        setHandlerEnabled(map, 'scrollZoom', false);
    }

    setHandlerEnabled(map, 'boxZoom', isOn('boxZoom'));
    setHandlerEnabled(map, 'doubleClickZoom', isOn('doubleClickZoom'));
    setHandlerEnabled(map, 'dragRotate', isOn('dragRotate'));
    setHandlerEnabled(map, 'keyboard', isOn('keyboard'));
    setHandlerEnabled(map, 'touchZoomRotate', isOn('touchZoomRotate'));
    setHandlerEnabled(map, 'touchPitch', isOn('touchPitch'));

    if ((map as any).setBearingSnap) {
        try {
            (map as any).setBearingSnap(typeof interaction?.bearingSnap === 'number' ? interaction?.bearingSnap : undefined);
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applyInteraction setBearingSnap failed', e);
        }
    }
    if ((map as any).setClickTolerance) {
        try {
            (map as any).setClickTolerance(typeof interaction?.clickTolerance === 'number' ? interaction?.clickTolerance : undefined);
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applyInteraction setClickTolerance failed', e);
        }
    }

    const cg = (map as any).cooperativeGestures;
    if (cg && typeof cg.enable === 'function' && typeof cg.disable === 'function') {
        try {
            const want = enabled && Boolean(interaction?.cooperativeGestures);
            if (want)
                cg.enable();
            else
                cg.disable();
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applyInteraction cooperativeGestures failed', e);
        }
    }
};

const normalizeSkyColor = (v?: string, fallback?: string) => {
    if (typeof v === 'string' && v.trim() !== '')
        return v;
    if (typeof fallback === 'string' && fallback.trim() !== '')
        return fallback;
    return '#88C6FC';
};

const normalizeSkyNumber01 = (v?: number, fallback?: number) => {
    const x = typeof v === 'number' && Number.isFinite(v) ? v : (typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : undefined);
    if (typeof x !== 'number')
        return undefined;
    return Math.max(0, Math.min(1, x));
};

const normalizeSkyAtmosphereBlend = (cfg?: MapLibreSkyConfig['atmosphereBlend'], fallback?: any) => {
    if (cfg?.mode === 'zoom') {
        const z1 = typeof cfg.z1 === 'number' && Number.isFinite(cfg.z1) ? cfg.z1 : 10;
        const z2 = typeof cfg.z2 === 'number' && Number.isFinite(cfg.z2) ? cfg.z2 : 12;
        return [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1,
            z1, 1,
            z2, 0
        ];
    }
    if (cfg?.mode === 'const') {
        const v = normalizeSkyNumber01(cfg.value, undefined);
        if (typeof v === 'number')
            return v;
    }
    if (fallback != null)
        return fallback;
    return 0.8;
};

const putSkyTransition = (spec: any, key: string, t?: any) => {
    if (!t)
        return;
    const duration = typeof t.duration === 'number' && Number.isFinite(t.duration) ? Math.max(0, t.duration) : undefined;
    const delay = typeof t.delay === 'number' && Number.isFinite(t.delay) ? Math.max(0, t.delay) : undefined;
    if (duration == null && delay == null)
        return;
    spec[`${key}-transition`] = { duration: duration ?? 0, delay: delay ?? 0 };
};

export const applyTerrain = (map: MapLibreMap, terrain?: MapLibreTerrainConfig) => {
    const hasSetTerrain = typeof (map as any).setTerrain === 'function';
    if (!hasSetTerrain)
        return;
    if (!terrain)
        return;

    const enabled = terrain.enabled !== false;
    if (!enabled) {
        try {
            (map as any).setTerrain(null);
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applyTerrain disable setTerrain failed', e);
        }
        return;
    }

    if (!terrain.source) {
        console.warn('[MapLibreGisMapRuntime] applyTerrain skipped: missing terrain.source');
        try {
            (map as any).setTerrain(null);
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applyTerrain clear setTerrain failed', e);
        }
        return;
    }

    const exaggeration =
        typeof terrain.exaggeration === 'number' && Number.isFinite(terrain.exaggeration)
            ? Math.max(0, terrain.exaggeration)
            : undefined;

    const spec: any = { source: terrain.source };
    if (typeof exaggeration === 'number')
        spec.exaggeration = exaggeration;

    const apply = () => {
        try {
            (map as any).setTerrain(spec);
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applyTerrain setTerrain failed', e);
        }
    };

    try {
        const hasSource = typeof (map as any).getSource === 'function' ? Boolean((map as any).getSource(terrain.source)) : true;
        if (!hasSource) {
            console.warn('[MapLibreGisMapRuntime] applyTerrain delayed: terrain source not found', { source: terrain.source });
            requestAnimationFrame(() => {
                try {
                    const ok = typeof (map as any).getSource === 'function' ? Boolean((map as any).getSource(terrain.source)) : true;
                    if (ok)
                        apply();
                    else
                        console.warn('[MapLibreGisMapRuntime] applyTerrain still missing terrain source', { source: terrain.source });
                } catch (e) {
                    console.error('[MapLibreGisMapRuntime] applyTerrain retry failed', e);
                }
            });
            return;
        }
    } catch (e) {
        console.error('[MapLibreGisMapRuntime] applyTerrain check source failed', e);
    }

    apply();
};

export const applySky = (map: MapLibreMap, baseStyle: any, sky?: MapLibreSkyConfig) => {
    const hasSetSky = typeof (map as any).setSky === 'function';
    if (!hasSetSky)
        return;

    const baseSky = (() => {
        try {
            const prev = (map as any).__mlgisBaseSkySpec;
            if (prev)
                return prev;
            const s = (map as any).getSky?.();
            (map as any).__mlgisBaseSkySpec = s;
            return s;
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] capture base sky failed', e);
            return undefined;
        }
    })();

    const hasSkyInStyleJson = typeof baseStyle === 'object' && baseStyle && (baseStyle as any).sky;
    const enabled = sky?.enabled !== false;
    const mode = sky?.mode ?? 'inherit';

    if (!sky) {
        if (!hasSkyInStyleJson && !baseSky) {
            try {
                (map as any).setSky({
                    'atmosphere-blend': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 1,
                        5, 1,
                        7, 0
                    ]
                } as any);
            } catch (e) {
                console.error('[MapLibreGisMapRuntime] applySky default setSky failed', e);
            }
        }
        return;
    }

    if (!enabled) {
        try {
            (map as any).setSky(undefined);
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applySky disable setSky failed', e);
        }
        return;
    }

    if (mode === 'inherit') {
        try {
            const baseHasTransition = baseSky && typeof baseSky === 'object' && Object.keys(baseSky).some(k => k.endsWith('-transition'));
            if (baseSky)
                (map as any).setSky(baseSky, baseHasTransition ? { validate: false } : undefined);
            else
                (map as any).setSky(undefined);
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applySky inherit setSky failed', e);
        }
        return;
    }

    const base: any = baseSky ?? {};
    const spec: any = {
        'sky-color': normalizeSkyColor(sky.skyColor, base['sky-color']),
        'horizon-color': normalizeSkyColor(sky.horizonColor, base['horizon-color'] ?? '#ffffff'),
        'fog-color': normalizeSkyColor(sky.fogColor, base['fog-color'] ?? '#ffffff'),
    };

    const shb = normalizeSkyNumber01(sky.skyHorizonBlend, base['sky-horizon-blend']);
    if (typeof shb === 'number')
        spec['sky-horizon-blend'] = shb;
    const hfb = normalizeSkyNumber01(sky.horizonFogBlend, base['horizon-fog-blend']);
    if (typeof hfb === 'number')
        spec['horizon-fog-blend'] = hfb;
    const fgb = normalizeSkyNumber01(sky.fogGroundBlend, base['fog-ground-blend']);
    if (typeof fgb === 'number')
        spec['fog-ground-blend'] = fgb;

    spec['atmosphere-blend'] = normalizeSkyAtmosphereBlend(sky.atmosphereBlend, base['atmosphere-blend']);

    putSkyTransition(spec, 'sky-color', sky.skyColorTransition);
    putSkyTransition(spec, 'horizon-color', sky.horizonColorTransition);
    putSkyTransition(spec, 'fog-color', sky.fogColorTransition);
    putSkyTransition(spec, 'sky-horizon-blend', sky.skyHorizonBlendTransition);
    putSkyTransition(spec, 'horizon-fog-blend', sky.horizonFogBlendTransition);
    putSkyTransition(spec, 'fog-ground-blend', sky.fogGroundBlendTransition);
    putSkyTransition(spec, 'atmosphere-blend', sky.atmosphereBlendTransition);

    try {
        const hasTransition = Object.keys(spec).some(k => k.endsWith('-transition'));
        (map as any).setSky(spec, hasTransition ? { validate: false } : undefined);
    } catch (e) {
        console.error('[MapLibreGisMapRuntime] applySky override setSky failed', e);
    }
};

const normalizeLightPosition = (p?: MapLibreLightConfig['position']): [number, number, number] => {
    const r = typeof p?.r === 'number' && Number.isFinite(p.r) ? p.r : 1.15;
    const a = typeof p?.a === 'number' && Number.isFinite(p.a) ? p.a : 210;
    const x = typeof p?.p === 'number' && Number.isFinite(p.p) ? p.p : 30;
    return [r, a, x];
};

const normalizeLightIntensity = (v?: number): number => {
    if (typeof v !== 'number' || !Number.isFinite(v))
        return 0.5;
    return Math.max(0, Math.min(1, v));
};

const normalizeLightColor = (v?: string): string => {
    if (typeof v !== 'string' || v.trim() === '')
        return '#ffffff';
    return v;
};

export const applyLight = (map: MapLibreMap, light?: MapLibreLightConfig) => {
    const hasSetLight = typeof (map as any).setLight === 'function';
    if (!hasSetLight)
        return;

    const getStyleLight = () => {
        try {
            return (map as any).getStyle?.()?.light;
        } catch {
            return undefined;
        }
    };

    const defaultLight = { anchor: 'viewport', position: [1.15, 210, 30], color: '#ffffff', intensity: 0.5 } as any;
    const styleLight = getStyleLight();

    const enabled = light?.enabled !== false;
    if (!enabled) {
        try {
            (map as any).setLight({ ...(styleLight ?? defaultLight), intensity: 0 } as any);
        } catch (e) {
            console.error('[MapLibreGisMapRuntime] applyLight disable setLight failed', e);
        }
        return;
    }

    if (!light) {
        if (!styleLight) {
            try {
                (map as any).setLight(defaultLight);
            } catch (e) {
                console.error('[MapLibreGisMapRuntime] applyLight set default light failed', e);
            }
        }
        return;
    }

    const spec: any = {
        anchor: light.anchor ?? (styleLight?.anchor ?? defaultLight.anchor),
        position: normalizeLightPosition(light.position),
        color: normalizeLightColor(light.color),
        intensity: normalizeLightIntensity(light.intensity),
    };

    const putTransition = (key: string, t?: any) => {
        if (!t)
            return;
        const duration = typeof t.duration === 'number' && Number.isFinite(t.duration) ? Math.max(0, t.duration) : undefined;
        const delay = typeof t.delay === 'number' && Number.isFinite(t.delay) ? Math.max(0, t.delay) : undefined;
        if (duration == null && delay == null)
            return;
        spec[`${key}-transition`] = { duration: duration ?? 0, delay: delay ?? 0 };
    };

    putTransition('color', light.colorTransition as any);
    putTransition('intensity', light.intensityTransition as any);
    putTransition('position', light.positionTransition as any);

    try {
        (map as any).setLight(spec);
    } catch (e) {
        console.error('[MapLibreGisMapRuntime] applyLight setLight failed', e);
    }
};
