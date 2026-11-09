/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
/**
 * Maplibre-gis 交互配置面板解析工具函数
 */

import {MapLibreDragPanConfig, MapLibreInteractionConfig} from '@datavisool/sdk/types';

export type MapLibreInitInteractionOptions = {
    cooperativeGestures?: boolean;
    clickTolerance?: number;
    bearingSnap?: number;
    dragPan?: boolean | any;
    scrollZoom?: boolean | any;
    boxZoom?: boolean;
    doubleClickZoom?: boolean;
    dragRotate?: boolean;
    keyboard?: boolean;
    touchZoomRotate?: boolean;
    touchPitch?: boolean;
};

/**
 * 解析 maplibre-gis 交互配置面板中的交互配置项，生成 maplibre-gl-js 初始化时可直接识别的交互配置格式。
 * @param interaction
 */
export const parseMapLibreInteractionHandlersInitOptions = (interaction?: MapLibreInteractionConfig): MapLibreInitInteractionOptions => {
    const out: MapLibreInitInteractionOptions = {};
    if (!interaction)
        return out;

    const enabled = interaction.enabled !== false;
    const h = interaction.handlers ?? {};

    const isOn = (key: keyof NonNullable<MapLibreInteractionConfig['handlers']>) => {
        if (!enabled)
            return false;
        return (h as any)[key] !== false;
    };

    const normalizeDragPanOptions = (cfg?: MapLibreDragPanConfig): any | undefined => {
        if (!cfg)
            return undefined;
        const o: any = {};
        if (typeof cfg.linearity === 'number' && Number.isFinite(cfg.linearity) && cfg.linearity > 0 && cfg.linearity <= 1)
            o.linearity = cfg.linearity;
        if (typeof cfg.maxSpeed === 'number' && Number.isFinite(cfg.maxSpeed) && cfg.maxSpeed > 0)
            o.maxSpeed = cfg.maxSpeed;
        if (typeof cfg.deceleration === 'number' && Number.isFinite(cfg.deceleration) && cfg.deceleration > 0)
            o.deceleration = cfg.deceleration;
        return Object.keys(o).length > 0 ? o : undefined;
    };

    if (typeof interaction.cooperativeGestures === 'boolean')
        out.cooperativeGestures = enabled && interaction.cooperativeGestures;
    if (typeof interaction.clickTolerance === 'number' && Number.isFinite(interaction.clickTolerance))
        out.clickTolerance = interaction.clickTolerance;
    if (typeof interaction.bearingSnap === 'number' && Number.isFinite(interaction.bearingSnap))
        out.bearingSnap = interaction.bearingSnap;

    const dragPanOn = isOn('dragPan');
    out.dragPan = dragPanOn ? (normalizeDragPanOptions(interaction.dragPan) ?? true) : false;

    const scrollZoomOn = isOn('scrollZoom');
    if (scrollZoomOn) {
        const aroundCenter = Boolean(interaction.scrollZoom?.aroundCenter);
        out.scrollZoom = aroundCenter ? {around: 'center'} : true;
    } else {
        out.scrollZoom = false;
    }

    out.boxZoom = isOn('boxZoom');
    out.doubleClickZoom = isOn('doubleClickZoom');
    out.dragRotate = isOn('dragRotate');
    out.keyboard = isOn('keyboard');
    out.touchZoomRotate = isOn('touchZoomRotate');
    out.touchPitch = isOn('touchPitch');

    return out;
};
