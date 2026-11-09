/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
/**
 * Maplibre-gis 投影配置面板解析工具函数
 */

import {MapLibreProjectionConfig, MapLibreProjectionType} from '@datavisool/sdk/types';

export type MapLibreInitProjectionOptions = {
    type: any;
};

const normalizeProjectionType = (t?: MapLibreProjectionType): MapLibreProjectionType => {
    if (t === 'globe' || t === 'vertical-perspective' || t === 'mercator')
        return t;
    return 'mercator';
};

export const parseMapLibreProjectionInitOptions = (projection?: MapLibreProjectionConfig): MapLibreInitProjectionOptions => {
    if (!projection)
        return {type: 'mercator'};

    if (projection.mode === 'zoom_interpolate' && projection.zoomInterpolate) {
        const {z1, z2, from, to} = projection.zoomInterpolate;
        const a = normalizeProjectionType(from);
        const b = normalizeProjectionType(to);
        return {type: ['interpolate', ['linear'], ['zoom'], z1, a, z2, b]};
    }

    return {type: normalizeProjectionType(projection.type)};
};
