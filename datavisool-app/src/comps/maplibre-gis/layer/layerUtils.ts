/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {IdGenerate} from '@datavisool/sdk';
import {GisLayerType, GisSourceType, StructuredLayerConfig} from '@datavisool/sdk/types';

/**
 * 图层/数据源编辑相关的通用工具。
 *
 * 注意：该文件只服务“编辑面板/抽屉”侧，不直接操作 map。
 */
export const layerTypeOptions: Array<{label: string; value: GisLayerType}> = [
    {label: '背景（background）', value: 'background'},
    {label: '点（circle）', value: 'circle'},
    {label: '线（line）', value: 'line'},
    {label: '面（fill）', value: 'fill'},
    {label: '拉伸面（fill-extrusion）', value: 'fill-extrusion'},
    {label: '符号（symbol）', value: 'symbol'},
    {label: '热力（heatmap）', value: 'heatmap'},
    {label: '栅格（raster）', value: 'raster'},
    {label: '阴影（hillshade）', value: 'hillshade'},
];

export const sourceTypeOptions: Array<{label: string; value: GisSourceType}> = [
    {label: 'GeoJSON（数据源）', value: 'geojson'},
    {label: 'Vector Tiles', value: 'vector'},
    {label: 'Raster Tiles', value: 'raster'},
    {label: 'Raster DEM', value: 'raster-dem'},
];

/**
 * 生成一个默认图层配置（供创建/复制时使用）。
 * - 这里只是“结构化配置”的默认值，不等同于最终 map.addLayer 的完整 spec
 */
export const defaultLayer = (): StructuredLayerConfig => ({
    id: IdGenerate.generateId(),
    name: '图层',
    visible: true,
    type: 'circle',
    sourceRef: undefined,
    sourceLayer: undefined,
    paint: {},
    layout: {},
    filter: undefined,
});

/**
 * JSON.stringify 的安全封装：
 * - 避免循环引用导致编辑器无法打开
 * - 统一 2 空格缩进，便于 CodeEditor 查看/修改
 */
export const safeJsonStringify = (v: any) => {
    try {
        return JSON.stringify(v ?? {}, null, 2);
    } catch {
        return '{}';
    }
};

/**
 * JSON.parse 的校验封装：
 * - 空字符串视为 undefined（表示“未提供”）
 * - 解析失败抛出带 label 的错误，供 UI 统一提示
 */
export const parseJsonOrThrow = (text: string, label: string) => {
    const t = (text ?? '').trim();
    if (!t)
        return undefined;
    try {
        return JSON.parse(t);
    } catch {
        throw new Error(`${label} JSON 格式错误`);
    }
};
