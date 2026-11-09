/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {GisLayerType} from '@datavisool/sdk/types';

/**
 * 图层字段元数据（用于 LayerEditorDrawer）
 *
 * 该文件定义：
 * - 不同 layer.type 可编辑的字段集合（paint/layout）
 * - 每个字段支持的“配置模式”（常量、按 feature 属性取值、按 zoom 插值等）
 *
 * 这些定义会驱动 UI：
 * - 生成字段表单
 * - 生成对应的 style expression（见 layerStyleCompiler.ts）
 */
export type LayerFieldSection = 'paint' | 'layout';

export type LayerFieldValueKind = 'number' | 'color' | 'string' | 'boolean' | 'enum' | 'number_array';

export type LayerFieldMode =
    | 'const'
    | 'prop_get'
    | 'prop_match'
    | 'prop_interpolate'
    | 'zoom_step'
    | 'zoom_interpolate';

export interface LayerFieldDef {
    section: LayerFieldSection;
    key: string;
    label: string;
    kind: LayerFieldValueKind;
    modes: LayerFieldMode[];
    options?: Array<{label: string; value: string}>;
}

/**
 * 按 GisLayerType 列出可编辑字段。
 * - key 对应 MapLibre Style Spec 中 paint/layout 的字段名
 * - modes 用于限制 UI 能提供的表达式构造方式
 */
export const layerFieldDefsByType: Record<GisLayerType, LayerFieldDef[]> = {
    background: [
        {section: 'paint', key: 'background-color', label: '背景颜色', kind: 'color', modes: ['const']},
        {section: 'paint', key: 'background-opacity', label: '背景透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step']},
    ],
    circle: [
        {section: 'paint', key: 'circle-radius', label: '半径', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_interpolate', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'circle-color', label: '颜色', kind: 'color', modes: ['const', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'circle-blur', label: '模糊', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'circle-opacity', label: '透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'circle-stroke-color', label: '描边颜色', kind: 'color', modes: ['const', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'circle-stroke-width', label: '描边宽度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'circle-stroke-opacity', label: '描边透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'circle-translate', label: '平移', kind: 'number_array', modes: ['const']},
        {section: 'paint', key: 'circle-translate-anchor', label: '平移锚点', kind: 'enum', modes: ['const'], options: [{label: 'map', value: 'map'}, {label: 'viewport', value: 'viewport'}]},
    ],
    line: [
        {section: 'layout', key: 'line-cap', label: '端点样式', kind: 'enum', modes: ['const'], options: [{label: 'butt', value: 'butt'}, {label: 'round', value: 'round'}, {label: 'square', value: 'square'}]},
        {section: 'layout', key: 'line-join', label: '连接样式', kind: 'enum', modes: ['const'], options: [{label: 'bevel', value: 'bevel'}, {label: 'round', value: 'round'}, {label: 'miter', value: 'miter'}]},
        {section: 'layout', key: 'line-miter-limit', label: '斜接限制', kind: 'number', modes: ['const']},
        {section: 'layout', key: 'line-round-limit', label: '圆角限制', kind: 'number', modes: ['const']},
        {section: 'paint', key: 'line-color', label: '颜色', kind: 'color', modes: ['const', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'line-width', label: '线宽', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_interpolate', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'line-gap-width', label: '间隙宽度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'line-offset', label: '偏移', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'line-blur', label: '模糊', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'line-opacity', label: '透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'line-translate', label: '平移', kind: 'number_array', modes: ['const']},
        {section: 'paint', key: 'line-translate-anchor', label: '平移锚点', kind: 'enum', modes: ['const'], options: [{label: 'map', value: 'map'}, {label: 'viewport', value: 'viewport'}]},
    ],
    fill: [
        {section: 'paint', key: 'fill-color', label: '填充颜色', kind: 'color', modes: ['const', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'fill-opacity', label: '填充透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'fill-outline-color', label: '描边颜色', kind: 'color', modes: ['const', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'fill-translate', label: '平移', kind: 'number_array', modes: ['const']},
        {section: 'paint', key: 'fill-translate-anchor', label: '平移锚点', kind: 'enum', modes: ['const'], options: [{label: 'map', value: 'map'}, {label: 'viewport', value: 'viewport'}]},
    ],
    'fill-extrusion': [
        {section: 'paint', key: 'fill-extrusion-color', label: '颜色', kind: 'color', modes: ['const', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'fill-extrusion-opacity', label: '透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'fill-extrusion-height', label: '高度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_interpolate', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'fill-extrusion-base', label: '基底高度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'fill-extrusion-vertical-gradient', label: '垂直渐变', kind: 'boolean', modes: ['const']},
    ],
    symbol: [
        {section: 'layout', key: 'symbol-placement', label: '布局方式', kind: 'enum', modes: ['const'], options: [{label: 'point', value: 'point'}, {label: 'line', value: 'line'}, {label: 'line-center', value: 'line-center'}]},
        {section: 'layout', key: 'symbol-spacing', label: '符号间距', kind: 'number', modes: ['const']},
        {section: 'layout', key: 'icon-image', label: '图标', kind: 'string', modes: ['const', 'prop_get']},
        {section: 'layout', key: 'icon-size', label: '图标大小', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'layout', key: 'icon-allow-overlap', label: '图标允许重叠', kind: 'boolean', modes: ['const']},
        {section: 'layout', key: 'icon-ignore-placement', label: '图标忽略避让', kind: 'boolean', modes: ['const']},
        {section: 'layout', key: 'icon-optional', label: '图标可选', kind: 'boolean', modes: ['const']},
        {section: 'layout', key: 'text-field', label: '文字内容', kind: 'string', modes: ['const', 'prop_get']},
        {section: 'layout', key: 'text-size', label: '文字大小', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'layout', key: 'text-offset', label: '文字偏移', kind: 'number_array', modes: ['const']},
        {section: 'layout', key: 'text-anchor', label: '文字锚点', kind: 'enum', modes: ['const'], options: [
            {label: 'center', value: 'center'},
            {label: 'left', value: 'left'},
            {label: 'right', value: 'right'},
            {label: 'top', value: 'top'},
            {label: 'bottom', value: 'bottom'},
            {label: 'top-left', value: 'top-left'},
            {label: 'top-right', value: 'top-right'},
            {label: 'bottom-left', value: 'bottom-left'},
            {label: 'bottom-right', value: 'bottom-right'},
        ]},
        {section: 'layout', key: 'text-allow-overlap', label: '文字允许重叠', kind: 'boolean', modes: ['const']},
        {section: 'layout', key: 'text-ignore-placement', label: '文字忽略避让', kind: 'boolean', modes: ['const']},
        {section: 'layout', key: 'text-optional', label: '文字可选', kind: 'boolean', modes: ['const']},
        {section: 'paint', key: 'text-color', label: '文字颜色', kind: 'color', modes: ['const', 'prop_match', 'prop_get']},
        {section: 'paint', key: 'text-halo-blur', label: '文字描边模糊', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'text-halo-color', label: '文字描边颜色', kind: 'color', modes: ['const', 'prop_get']},
        {section: 'paint', key: 'text-halo-width', label: '文字描边宽度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'text-opacity', label: '文字透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'icon-opacity', label: '图标透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'icon-color', label: '图标颜色', kind: 'color', modes: ['const', 'prop_match', 'prop_get']},
    ],
    raster: [
        {section: 'paint', key: 'raster-opacity', label: '透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step']},
        {section: 'paint', key: 'raster-saturation', label: '饱和度', kind: 'number', modes: ['const']},
        {section: 'paint', key: 'raster-contrast', label: '对比度', kind: 'number', modes: ['const']},
        {section: 'paint', key: 'raster-brightness-min', label: '亮度最小', kind: 'number', modes: ['const']},
        {section: 'paint', key: 'raster-brightness-max', label: '亮度最大', kind: 'number', modes: ['const']},
        {section: 'paint', key: 'raster-hue-rotate', label: '色相旋转', kind: 'number', modes: ['const']},
    ],
    heatmap: [
        {section: 'paint', key: 'heatmap-intensity', label: '强度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'heatmap-radius', label: '半径', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step', 'prop_get']},
        {section: 'paint', key: 'heatmap-opacity', label: '透明度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step']},
        {section: 'paint', key: 'heatmap-weight', label: '权重', kind: 'number', modes: ['const', 'prop_get']},
    ],
    hillshade: [
        {section: 'paint', key: 'hillshade-exaggeration', label: '夸张度', kind: 'number', modes: ['const', 'zoom_interpolate', 'zoom_step']},
        {section: 'paint', key: 'hillshade-illumination-direction', label: '光照方向', kind: 'number', modes: ['const']},
        {section: 'paint', key: 'hillshade-illumination-anchor', label: '光照锚点', kind: 'enum', modes: ['const'], options: [{label: 'map', value: 'map'}, {label: 'viewport', value: 'viewport'}]},
        {section: 'paint', key: 'hillshade-shadow-color', label: '阴影颜色', kind: 'color', modes: ['const']},
        {section: 'paint', key: 'hillshade-highlight-color', label: '高光颜色', kind: 'color', modes: ['const']},
        {section: 'paint', key: 'hillshade-accent-color', label: '强调颜色', kind: 'color', modes: ['const']},
    ],
};
