/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {Map as MapLibreMap} from "maplibre-gl";

/**
 * Maplibre-gis 相机配置面板解析工具函数
 */

import {
    MapLibreCameraConfig,
    MapLibreCameraConstraintsConfig
} from '@datavisool/sdk/types';

export type MapLibreInitCameraOptions = {
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
    minZoom?: number;
    maxZoom?: number;
    minPitch?: number;
    maxPitch?: number;
    maxBounds?: [[number, number], [number, number]];
};

const normalizeCenter = (v?: any): [number, number] | undefined => {
    if (!Array.isArray(v) || v.length < 2)
        return undefined;
    const lng = Number(v[0]);
    const lat = Number(v[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat))
        return undefined;
    return [lng, lat];
};

const normalizeBounds = (b?: [number, number, number, number]): [[number, number], [number, number]] | undefined => {
    if (!b || b.length !== 4)
        return undefined;
    const [w, s, e, n] = b;
    if (![w, s, e, n].every(Number.isFinite))
        return undefined;
    return [[w, s], [e, n]];
};

const normalizeConstraints = (c?: MapLibreCameraConstraintsConfig): Partial<MapLibreInitCameraOptions> => {
    if (!c)
        return {};
    const out: Partial<MapLibreInitCameraOptions> = {};
    const b = normalizeBounds(c.maxBounds);
    if (b)
        out.maxBounds = b;
    if (typeof c.minZoom === 'number' && Number.isFinite(c.minZoom))
        out.minZoom = c.minZoom;
    if (typeof c.maxZoom === 'number' && Number.isFinite(c.maxZoom))
        out.maxZoom = c.maxZoom;
    if (typeof c.minPitch === 'number' && Number.isFinite(c.minPitch))
        out.minPitch = c.minPitch;
    if (typeof c.maxPitch === 'number' && Number.isFinite(c.maxPitch))
        out.maxPitch = c.maxPitch;
    return out;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const normalizeBearing = (bearing: number) => {
    const m = ((bearing % 360) + 360) % 360;
    return m > 180 ? m - 360 : m;
};

const warnCorrected = (key: string, from: any, to: any) => {
    if (from === to)
        return;
    console.warn(`[MapLibreGisCamera] ${key} corrected`, { from, to });
};

/**
 * 解析相机配置面板，生成 MapLibre 初始化相机参数。
 * @param camera
 */
export const parseMapLibreCameraInitOptions = (camera?: MapLibreCameraConfig): MapLibreInitCameraOptions => {
    const out: MapLibreInitCameraOptions = {};
    if (!camera)
        return out;

    Object.assign(out, normalizeConstraints(camera.constraints));
    const c = normalizeCenter(camera.center);
    if (c) {
        const lng0 = c[0];
        const lat0 = c[1];
        const lng = clamp(lng0, -180, 180);
        const lat = clamp(lat0, -90, 90);
        if (lng !== lng0)
            warnCorrected('center[0](lng)', lng0, lng);
        if (lat !== lat0)
            warnCorrected('center[1](lat)', lat0, lat);
        out.center = [lng, lat];
    }

    if (typeof out.minZoom === 'number' && typeof out.maxZoom === 'number' && out.minZoom > out.maxZoom) {
        warnCorrected('constraints(minZoom/maxZoom)', { minZoom: out.minZoom, maxZoom: out.maxZoom }, { minZoom: out.maxZoom, maxZoom: out.minZoom });
        const t = out.minZoom;
        out.minZoom = out.maxZoom;
        out.maxZoom = t;
    }
    if (typeof out.minPitch === 'number' && typeof out.maxPitch === 'number' && out.minPitch > out.maxPitch) {
        warnCorrected('constraints(minPitch/maxPitch)', { minPitch: out.minPitch, maxPitch: out.maxPitch }, { minPitch: out.maxPitch, maxPitch: out.minPitch });
        const t = out.minPitch;
        out.minPitch = out.maxPitch;
        out.maxPitch = t;
    }

    if (typeof camera.zoom === 'number' && Number.isFinite(camera.zoom)) {
        const minZoom = typeof out.minZoom === 'number' && Number.isFinite(out.minZoom) ? out.minZoom : 0;
        const maxZoom = typeof out.maxZoom === 'number' && Number.isFinite(out.maxZoom) ? out.maxZoom : 24;
        const z = clamp(camera.zoom, minZoom, maxZoom);
        if (z !== camera.zoom)
            warnCorrected('zoom', camera.zoom, z);
        out.zoom = z;
    }

    if (typeof camera.bearing === 'number' && Number.isFinite(camera.bearing)) {
        const b = normalizeBearing(camera.bearing);
        if (b !== camera.bearing)
            warnCorrected('bearing', camera.bearing, b);
        out.bearing = b;
    }
    if (typeof camera.pitch === 'number' && Number.isFinite(camera.pitch)) {
        const minPitch = typeof out.minPitch === 'number' && Number.isFinite(out.minPitch) ? out.minPitch : 0;
        const maxPitch = typeof out.maxPitch === 'number' && Number.isFinite(out.maxPitch) ? out.maxPitch : 180;
        const p = clamp(camera.pitch, minPitch, maxPitch);
        if (p !== camera.pitch)
            warnCorrected('pitch', camera.pitch, p);
        out.pitch = p;
    }

    return out;
};


/**
 * 从当前 map 读取“相机状态”，用于把当前视角回填到配置面板。
 */
export const readCurrentCamera = (map: MapLibreMap | null): {
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number
} | null => {
    if (!map)
        return null;
    const c = map.getCenter();
    return {
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
    };
}
