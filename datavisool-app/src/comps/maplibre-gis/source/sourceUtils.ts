/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {IdGenerate} from '@datavisool/sdk';
import {DataConfigType} from '@datavisool/sdk/types';
import {GisSourceType, StructuredSourceConfig} from '@datavisool/sdk/types';

/**
 * 数据源（StructuredSourceConfig）相关的 UI 默认值与选项。
 *
 * 注意：
 * - 这里生成的是“结构化配置”，最终会由 controller.buildStructuredSource 转换成 map.addSource 的 spec
 * - 对 geojson 默认使用 dataConfig 模式，便于与项目的数据源体系（ComponentDataUpdater）对接
 */
const defaultGeoJsonDataConfig: DataConfigType = {
    sourceType: 'static',
    staticData: {value: {type: 'FeatureCollection', features: []}},
    value: {type: 'FeatureCollection', features: []},
};

export const sourceTypeOptions: Array<{label: string; value: GisSourceType}> = [
    {label: 'GeoJSON', value: 'geojson'},
    {label: 'Vector Tiles', value: 'vector'},
    {label: 'Raster Tiles', value: 'raster'},
    {label: 'Raster DEM', value: 'raster-dem'},
    {label: 'Image', value: 'image'},
    {label: 'Video', value: 'video'},
    {label: 'Canvas', value: 'canvas'},
];

export const defaultSource = (sourceType: GisSourceType = 'geojson'): StructuredSourceConfig => {
    /**
     * 为不同 sourceType 生成尽量“可编辑/可保存”的初始结构。
     * - 一些类型要求必填字段（例如 image/video/canvas 的 coordinates），这里给出占位值
     */
    const id = IdGenerate.generateId();
    const base = {
        id,
        name: '数据源',
        visible: true,
        sourceType,
    } as any;

    if (sourceType === 'geojson') {
        return {
            ...base,
            dataMode: 'dataConfig',
            dataConfig: defaultGeoJsonDataConfig,
            cluster: false,
        } as StructuredSourceConfig;
    }

    if (sourceType === 'vector') {
        return {
            ...base,
            tiles: [],
        } as StructuredSourceConfig;
    }

    if (sourceType === 'raster') {
        return {
            ...base,
            tiles: [],
            tileSize: 256,
        } as StructuredSourceConfig;
    }

    if (sourceType === 'raster-dem') {
        return {
            ...base,
            tiles: [],
            tileSize: 256,
            encoding: 'terrarium',
        } as StructuredSourceConfig;
    }

    if (sourceType === 'image') {
        return {
            ...base,
            url: '',
            coordinates: [
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
            ],
        } as StructuredSourceConfig;
    }

    if (sourceType === 'video') {
        return {
            ...base,
            urls: [],
            coordinates: [
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
            ],
        } as StructuredSourceConfig;
    }

    return {
        ...base,
        canvasId: '',
        coordinates: [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
        ],
    } as StructuredSourceConfig;
};
