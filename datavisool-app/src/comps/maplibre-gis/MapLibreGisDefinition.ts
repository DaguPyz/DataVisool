/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import { lazy } from "react";
import AbstractDesignerDefinition from "@/framework/core/AbstractDesignerDefinition.ts";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";
import { ClazzTemplate } from "@datavisool/sdk/types";
import { EventInfo } from "@datavisool/sdk/types";
import mapLibreGisImg from './maplibre.webp';
import MapLibreGisController from "./MapLibreGisController.ts";
import { MapLibreGisComponentProps } from "./MapLibreGisComponent.tsx";
import {
    Camera,
    Click,
    ColorFilter,
    Connect,
    Earth,
    Layers,
    Light,
    Mountain,
    SettingOne,
    SettingTwo,
    Sun,
    Theme
} from "@icon-park/react";

const MapLibreGisConfig = lazy(() => import('./map-base/MapLibreGisConfig.tsx'));
const MapLibreGisCameraConfig = lazy(() => import('./camera/MapLibreGisCameraConfig.tsx'));
const MapLibreGisInteractionConfig = lazy(() => import('./interaction/MapLibreGisInteractionConfig.tsx'));
const MapLibreGisProjectionConfig = lazy(() => import('./projection/MapLibreGisProjectionConfig.tsx'));
const MapLibreGisSourcesConfig = lazy(() => import('./source/MapLibreGisSourcesConfig.tsx'));
const MapLibreGisLayersConfig = lazy(() => import('./layer/MapLibreGisLayersConfig.tsx'));
const MapLibreGisLightConfig = lazy(() => import('./light/MapLibreGisLightConfig.tsx'));
const MapLibreGisSkyConfig = lazy(() => import('./sky/MapLibreGisSkyConfig.tsx'));
const MapLibreGisTerrainConfig = lazy(() => import('./terrain/MapLibreGisTerrainConfig.tsx'));

/**
 * 组件定义（Designer Definition）
 *
 * 该文件是设计器侧的“注册信息”：
 * - 基础信息（尺寸/分类/名称）
 * - 绑定 controller
 * - 右侧配置面板菜单（getMenuList + getMenuToConfigContentMap）
 * - 组件初始配置（getInitConfig）
 * - 事件列表（getEventList）
 *
 * 注意：
 * - 这里返回的是“配置面板组件”，配置面板内部会通过 controller.getConfig()/controller.update() 读写配置
 * - MapLibre 的实际渲染与运行态更新由 MapLibreGisController + MapLibreGisComponent 完成
 */
export default class MapLibreGisDefinition extends AbstractDesignerDefinition<MapLibreGisController, MapLibreGisComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: 'GIS(MapLibre)',
            compKey: 'MapLibreGis',
            categorize: 'map',
            width: 640,
            height: 360,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "MapLibreGis",
            compName: "GIS(MapLibre)",
            summary: "GIS(MapLibre)，用于GIS地图展示和地理空间数据渲染。",
            featureTags: ["GIS(MapLibre)", "GIS地图", "空间可视化", "地图渲染", "地理信息"],
            applicableScenes: ["区域分布分析", "地理位置展示", "轨迹/点位展示", "地图看板"],
            capabilities: ["支持地图底图", "支持地理空间数据", "支持交互缩放平移"],
            constraints: [],
            aliases: ["MapLibre GIS", "GIS Map"],
            categorize: "map",
        };
    }

    getAiStylePromptTs(): string {
        return `export type GisLayerType =
    | 'background'
    | 'fill'
    | 'fill-extrusion'
    | 'line'
    | 'circle'
    | 'symbol'
    | 'raster'
    | 'heatmap'
    | 'hillshade';

/**
 * 支持的数据源类型（与 maplibre style spec 中的 source.type 对齐）。
 */
export type GisSourceType = 'geojson' | 'vector' | 'raster' | 'image' | 'raster-dem' | 'video' | 'canvas';

/**
 * 瓦片方案（Tile scheme）。
 * - xyz：常见 Web 瓦片方案
 * - tms：TMS（行号方向与 xyz 不同）
 */
export type GisTileScheme = 'xyz' | 'tms';

/**
 * 结构化数据源配置的联合类型。
 * - 用 sourceType 做 discriminant（判别字段）
 * - UI/编辑器侧可根据 sourceType 展示不同字段
 */
export type StructuredSourceConfig =
    | StructuredGeoJsonSourceConfig
    | StructuredVectorSourceConfig
    | StructuredRasterSourceConfig
    | StructuredRasterDemSourceConfig
    | StructuredImageSourceConfig
    | StructuredVideoSourceConfig
    | StructuredCanvasSourceConfig;

/**
 * 所有结构化数据源的公共字段。
 *
 * 说明：
 * - id：sourceId，最终会作为 map.addSource(id, spec) 的 id；必须唯一且稳定
 * - name：用于 UI 展示
 * - visible：UI/业务层的“是否注入到地图”开关（不是 maplibre 原生字段）
 * - attribution/bounds/minzoom/maxzoom/volatile：会被映射到 maplibre 的 SourceSpecification（若该类型支持）
 */
export interface StructuredSourceBaseConfig {
    id: string;
    name: string;
    visible?: boolean;
    sourceType: GisSourceType;
    attribution?: string;
    bounds?: [number, number, number, number];
    minzoom?: number;
    maxzoom?: number;
    volatile?: boolean;
}

/**
 * GeoJSON 数据源配置。
 *
 * dataMode：
 * - empty：空 FeatureCollection，占位（source 存在但无数据）
 * - url：通过 dataUrl 指向远端 GeoJSON
 * - inline：通过 dataJson 直接内联 GeoJSON 对象
 * - dataConfig：对接项目的数据源体系（DataConfigType），由 controller 在运行态拉取并 setData
 *
 * 其余字段基本对应 maplibre GeoJSON source 选项（cluster/generateId/promoteId 等）。
 */
export interface StructuredGeoJsonSourceConfig extends StructuredSourceBaseConfig {
    sourceType: 'geojson';
    dataMode?: 'empty' | 'url' | 'inline' | 'dataConfig';
    dataUrl?: string;
    dataJson?: any;
    dataConfig?: DataConfigType;
    generateId?: boolean;
    promoteId?: string | string[];
    cluster?: boolean;
    clusterRadius?: number;
    clusterMaxZoom?: number;
    clusterProperties?: any;
    buffer?: number;
    tolerance?: number;
    lineMetrics?: boolean;
}

/**
 * Vector tiles 数据源配置。
 * - url：TileJSON URL
 * - tiles：URL 模板数组（{z}/{x}/{y} 等）
 * - scheme：xyz/tms
 */
export interface StructuredVectorSourceConfig extends StructuredSourceBaseConfig {
    sourceType: 'vector';
    url?: string;
    tiles?: string[];
    scheme?: GisTileScheme;
    promoteId?: string | string[];
}

/**
 * Raster tiles 数据源配置。
 */
export interface StructuredRasterSourceConfig extends StructuredSourceBaseConfig {
    sourceType: 'raster';
    url?: string;
    tiles?: string[];
    tileSize?: number;
    scheme?: GisTileScheme;
}

/**
 * Raster DEM 数据源配置（用于地形/高程）。
 * - encoding：terrarium/mapbox 两种常见编码
 */
export interface StructuredRasterDemSourceConfig extends StructuredSourceBaseConfig {
    sourceType: 'raster-dem';
    url?: string;
    tiles?: string[];
    tileSize?: number;
    scheme?: GisTileScheme;
    encoding?: 'terrarium' | 'mapbox';
}

/**
 * Image 数据源（静态图片覆盖）。
 * - coordinates：图片四角经纬度（顺序与 maplibre spec 一致）
 */
export interface StructuredImageSourceConfig extends StructuredSourceBaseConfig {
    sourceType: 'image';
    url?: string;
    coordinates?: [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * Video 数据源（视频覆盖）。
 */
export interface StructuredVideoSourceConfig extends StructuredSourceBaseConfig {
    sourceType: 'video';
    urls?: string[];
    coordinates?: [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * Canvas 数据源（将某个 canvas 作为纹理覆盖）。
 * - canvasId：页面上的 canvas 元素 id（运行态会映射到 maplibre 的 canvas 字段）
 */
export interface StructuredCanvasSourceConfig extends StructuredSourceBaseConfig {
    sourceType: 'canvas';
    canvasId?: string;
    coordinates?: [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * MapLibre 基础配置（底图与基础开关）。
 * - styleUrl：底图样式来源（指向 MapLibre/Mapbox Style JSON）
 * - previewDataInEditor：编辑模式下是否加载动态数据（用于减少设计器资源消耗）
 */
export interface MapLibreBaseConfig {
    styleUrl?: string;
    previewDataInEditor?: boolean;
}

/**
 * 相机配置模式：
 * - center：按 center/zoom/bearing/pitch 定位
 * - bounds：按 bounds + fitBoundsOptions 自动定位
 */
export type MapLibreCameraMode = 'center' | 'bounds';

/**
 * map.fitBounds 的可选项（面板只暴露常用字段）。
 */
export interface MapLibreFitBoundsOptionsConfig {
    padding?: number | {top?: number; bottom?: number; left?: number; right?: number};
    maxZoom?: number;
    linear?: boolean;
}

/**
 * 相机约束（会映射到 map.setMaxBounds / setMinZoom / setMaxPitch 等 API）。
 */
export interface MapLibreCameraConstraintsConfig {
    maxBounds?: [number, number, number, number];
    minZoom?: number;
    maxZoom?: number;
    minPitch?: number;
    maxPitch?: number;
}

/**
 * 相机配置（camera）。
 * - mode 决定使用 center 还是 bounds 路径
 * - constraints 为可选的“限制项”
 */
export interface MapLibreCameraConfig {
    mode: MapLibreCameraMode;
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
    bounds?: [number, number, number, number];
    fitBoundsOptions?: MapLibreFitBoundsOptionsConfig;
    constraints?: MapLibreCameraConstraintsConfig;
}

/**
 * MapLibre 支持的投影类型（本项目当前只暴露这三种）。
 */
export type MapLibreProjectionType = 'mercator' | 'globe' | 'vertical-perspective';

/**
 * 投影配置模式：
 * - static：固定投影
 * - zoom_interpolate：按 zoom 线性切换投影（内部会构造 expression）
 */
export type MapLibreProjectionMode = 'static' | 'zoom_interpolate';

/**
 * zoom_interpolate 的结构化配置：
 * - z1/z2：缩放阈值
 * - from/to：低/高缩放使用的投影类型
 */
export interface MapLibreProjectionZoomInterpolateConfig {
    z1: number;
    z2: number;
    from: MapLibreProjectionType;
    to: MapLibreProjectionType;
}

/**
 * 投影配置（projection）。
 * - static：使用 type
 * - zoom_interpolate：使用 zoomInterpolate（type 可选作为兼容/回退）
 */
export interface MapLibreProjectionConfig {
    mode: MapLibreProjectionMode;
    type?: MapLibreProjectionType;
    zoomInterpolate?: MapLibreProjectionZoomInterpolateConfig;
}

export type MapLibreLightAnchor = 'map' | 'viewport';

export interface MapLibreLightPositionConfig {
    r: number;
    a: number;
    p: number;
}

export interface MapLibreLightTransitionConfig {
    duration?: number;
    delay?: number;
}

export interface MapLibreLightConfig {
    enabled?: boolean;
    anchor?: MapLibreLightAnchor;
    position?: MapLibreLightPositionConfig;
    color?: string;
    intensity?: number;
    colorTransition?: MapLibreLightTransitionConfig;
    intensityTransition?: MapLibreLightTransitionConfig;
    positionTransition?: MapLibreLightTransitionConfig;
}

export type MapLibreSkyMode = 'inherit' | 'override';

export interface MapLibreSkyTransitionConfig {
    duration?: number;
    delay?: number;
}

export type MapLibreSkyAtmosphereBlendMode = 'const' | 'zoom';

export interface MapLibreSkyAtmosphereBlendConfig {
    mode: MapLibreSkyAtmosphereBlendMode;
    value?: number;
    z1?: number;
    z2?: number;
}

export interface MapLibreSkyConfig {
    enabled?: boolean;
    mode?: MapLibreSkyMode;
    skyColor?: string;
    horizonColor?: string;
    fogColor?: string;
    skyHorizonBlend?: number;
    horizonFogBlend?: number;
    fogGroundBlend?: number;
    atmosphereBlend?: MapLibreSkyAtmosphereBlendConfig;
    skyColorTransition?: MapLibreSkyTransitionConfig;
    horizonColorTransition?: MapLibreSkyTransitionConfig;
    fogColorTransition?: MapLibreSkyTransitionConfig;
    skyHorizonBlendTransition?: MapLibreSkyTransitionConfig;
    horizonFogBlendTransition?: MapLibreSkyTransitionConfig;
    fogGroundBlendTransition?: MapLibreSkyTransitionConfig;
    atmosphereBlendTransition?: MapLibreSkyTransitionConfig;
}

export interface MapLibreTerrainConfig {
    enabled?: boolean;
    source?: string;
    exaggeration?: number;
}

/**
 * scrollZoom 相关配置（面板暴露常用选项）。
 * - aroundCenter：围绕视口中心缩放（否则围绕鼠标位置）
 * - wheelZoomRate/trackpadZoomRate：缩放速率（运行态会做安全化处理）
 */
export interface MapLibreScrollZoomConfig {
    aroundCenter?: boolean;
    wheelZoomRate?: number;
    trackpadZoomRate?: number;
}

/**
 * dragPan 相关配置（用于调整拖拽“手感”）。
 * 注意：运行态会对参数做范围收敛，避免把 handler 带崩（NaN）。
 */
export interface MapLibreDragPanConfig {
    linearity?: number;
    maxSpeed?: number;
    deceleration?: number;
}

/**
 * 交互 handlers 的开关集合。
 * - 每个字段为 true/false，表示“是否启用该交互”
 * - 若字段为 undefined，表示使用默认（一般视为 true）
 */
export interface MapLibreInteractionHandlersConfig {
    dragPan?: boolean;
    scrollZoom?: boolean;
    boxZoom?: boolean;
    doubleClickZoom?: boolean;
    dragRotate?: boolean;
    keyboard?: boolean;
    touchZoomRotate?: boolean;
    touchPitch?: boolean;
}

/**
 * 交互配置（interaction）。
 *
 * enabled：
 * - 面板级总开关（决定最终交互是否启用）
 *
 * cooperativeGestures：
 * - MapLibre 的“协作手势”模式（通常用于移动端避免误操作）
 *
 * clickTolerance/bearingSnap：
 * - map 构造或运行态 setter 支持的细节参数（不同版本可能存在差异）
 */
export interface MapLibreInteractionConfig {
    enabled?: boolean;
    handlers?: MapLibreInteractionHandlersConfig;
    cooperativeGestures?: boolean;
    clickTolerance?: number;
    bearingSnap?: number;
    scrollZoom?: MapLibreScrollZoomConfig;
    dragPan?: MapLibreDragPanConfig;
}

/**
 * 图层过滤器组的逻辑运算：
 * - all：全部满足
 * - any：满足任意一个
 * - none：全部不满足
 */
export type LayerFilterGroupOp = 'all' | 'any' | 'none';

/**
 * 支持的几何类型（用于 geometry-type 过滤器）。
 */
export type LayerGeometryType = 'Point' | 'LineString' | 'Polygon';

/**
 * 过滤条件的值类型（用于 UI 选择与输入组件）。
 */
export type LayerFilterValueType = 'string' | 'number' | 'boolean';

/**
 * 比较操作符（会映射为 MapLibre filter 表达式中的 ==/!=/>/=...）。
 */
export type LayerFilterCompareOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

/**
 * 所有过滤条件的公共字段。
 * - id：UI 中每条条件的稳定标识（用于增删改）
 * - kind：判别字段，用于决定具体结构
 */
export interface LayerFilterConditionBase {
    id: string;
    kind: 'geometry' | 'compare' | 'exists' | 'in';
}

/**
 * 按几何类型过滤（Point/LineString/Polygon）。
 */
export interface LayerFilterGeometryCondition extends LayerFilterConditionBase {
    kind: 'geometry';
    geometryType: LayerGeometryType;
}

/**
 * 按属性比较过滤。
 * - key：feature 属性名
 * - op/value：比较方式与值
 */
export interface LayerFilterCompareCondition extends LayerFilterConditionBase {
    kind: 'compare';
    key: string;
    op: LayerFilterCompareOp;
    valueType: LayerFilterValueType;
    value: string | number | boolean;
}

/**
 * 按属性存在性过滤（has/!has）。
 */
export interface LayerFilterExistsCondition extends LayerFilterConditionBase {
    kind: 'exists';
    key: string;
    exists: boolean;
}

/**
 * 按属性值是否属于集合过滤（in / !in）。
 * - valueType 仅支持 string/number（避免 boolean 集合带来的 UI 歧义）
 */
export interface LayerFilterInCondition extends LayerFilterConditionBase {
    kind: 'in';
    key: string;
    not: boolean;
    valueType: Exclude<LayerFilterValueType, 'boolean'>;
    values: Array<string | number>;
}

/**
 * 结构化过滤条件联合类型。
 */
export type LayerFilterCondition =
    | LayerFilterGeometryCondition
    | LayerFilterCompareCondition
    | LayerFilterExistsCondition
    | LayerFilterInCondition;

/**
 * 结构化过滤器组配置：
 * - op 决定 items 的组合方式（all/any/none）
 * - items 是条件列表
 *
 * 保存时会由 layerFilterCompiler 编译为 layer.filter 表达式。
 */
export interface LayerFilterGroupConfig {
    op: LayerFilterGroupOp;
    items: LayerFilterCondition[];
}

/**
 * 图层样式表达式的模式（与 LayerFieldMode 对齐）。
 */
export type LayerStyleValueMode =
    | 'const'
    | 'prop_get'
    | 'prop_match'
    | 'prop_interpolate'
    | 'zoom_step'
    | 'zoom_interpolate';

/**
 * style expression 的 stop（输入值 → 输出值）。
 * - input 通常是 zoom 或 feature 属性（数值）
 */
export interface LayerStyleStop<T> {
    input: number;
    value: T;
}

/**
 * 常量值样式（直接输出 value）。
 */
export interface LayerStyleConstValue<T> {
    mode: 'const';
    value: T;
}

/**
 * 从 feature 属性读取值（['get', property]）。
 */
export interface LayerStylePropGetValue {
    mode: 'prop_get';
    property: string;
}

/**
 * 按 feature 属性做 match 分支（['match', ['get', property], ...]）。
 */
export interface LayerStylePropMatchValue<T> {
    mode: 'prop_match';
    property: string;
    cases: Array<{input: string | number | boolean; value: T}>;
    defaultValue: T;
}

/**
 * 按 feature 属性做线性插值（['interpolate', ['linear'], ['get', property], ...]）。
 */
export interface LayerStylePropInterpolateValue<T> {
    mode: 'prop_interpolate';
    property: string;
    stops: Array<LayerStyleStop<T>>;
}

/**
 * 按 zoom 做 step 分段（['step', ['zoom'], defaultValue, ...]）。
 */
export interface LayerStyleZoomStepValue<T> {
    mode: 'zoom_step';
    defaultValue: T;
    stops: Array<LayerStyleStop<T>>;
}

/**
 * 按 zoom 做线性插值（['interpolate', ['linear'], ['zoom'], ...]）。
 */
export interface LayerStyleZoomInterpolateValue<T> {
    mode: 'zoom_interpolate';
    stops: Array<LayerStyleStop<T>>;
}

/**
 * 结构化样式值配置联合类型。
 * - 保存时会由 layerStyleCompiler 编译为 paint/layout 的 expression 值
 */
export type LayerStyleValueConfig<T = any> =
    | LayerStyleConstValue<T>
    | LayerStylePropGetValue
    | LayerStylePropMatchValue<T>
    | LayerStylePropInterpolateValue<T>
    | LayerStyleZoomStepValue<T>
    | LayerStyleZoomInterpolateValue<T>;

/**
 * 结构化样式配置：
 * - paint/layout 为“字段 → 结构化表达式”的字典
 */
export interface LayerStyleConfig {
    paint?: Record<string, LayerStyleValueConfig>;
    layout?: Record<string, LayerStyleValueConfig>;
}

/**
 * 结构化图层配置（Layer）。
 *
 * 说明：
 * - type/sourceRef/sourceLayer 是最小必要信息
 * - paint/layout/filter 是最终会映射到 map.addLayer 的字段（允许 any/expression）
 * - filterConfig/styleConfig 仅用于编辑器：保存时会编译并合并到 filter/paint/layout
 */
export interface StructuredLayerConfig {
    id: string;
    name: string;
    visible?: boolean;
    type: GisLayerType;
    sourceRef?: string;
    sourceLayer?: string;
    filterConfig?: LayerFilterGroupConfig;
    styleConfig?: LayerStyleConfig;
    paint?: Record<string, any>;
    layout?: Record<string, any>;
    filter?: any;
    minzoom?: number;
    maxzoom?: number;
}

/**
 * MapLibre 组件的 style 总配置。
 * - base/camera/projection/interaction 是基础能力配置
 * - sources/layers 是结构化的数据注入与渲染层配置
 */
export interface MapLibreGisComponentStyle {
    base: MapLibreBaseConfig;
    camera: MapLibreCameraConfig;
    projection: MapLibreProjectionConfig;
    interaction: MapLibreInteractionConfig;
    light?: MapLibreLightConfig;
    sky?: MapLibreSkyConfig;
    terrain?: MapLibreTerrainConfig;
    sources?: StructuredSourceConfig[];
    layers: StructuredLayerConfig[];
}`.trim();
    }


    getController(): ClazzTemplate<MapLibreGisController> | null {
        return MapLibreGisController;
    }

    getChartImg(): string | null {
        return mapLibreGisImg;
    }

    getMenuList(): Array<MenuInfo> {
        return [
            { icon: SettingOne, name: '基础', key: 'base' },
            { icon: SettingTwo, name: '地图', key: 'map_base' },
            { icon: Connect, name: '数据源', key: 'sources' },
            { icon: Layers, name: '图层', key: 'layers' },
            { icon: Camera, name: '视角', key: 'camera' },
            { icon: Click, name: '交互', key: 'interaction' },
            { icon: Earth, name: '投影', key: 'projection' },
            { icon: Sun, name: '光照', key: 'light' },
            { icon: Light, name: '天空', key: 'sky' },
            { icon: Mountain, name: '地形', key: 'terrain' },
            { icon: ColorFilter, name: '滤镜', key: 'filter' },
            { icon: Theme, name: '主题', key: 'theme' },
        ];
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        /**
         * 继承基类默认的菜单映射，但删除 data/style：
         * - 该组件把“数据源/图层/相机/交互”等收敛到自己的结构化配置里（style.sources/style.layers/...）
         * - 不使用通用的 data/style 面板
         */
        const base = super.getMenuToConfigContentMap();
        delete base['data'];
        delete base['style'];
        return {
            ...base,
            map_base: MapLibreGisConfig,
            camera: MapLibreGisCameraConfig,
            interaction: MapLibreGisInteractionConfig,
            projection: MapLibreGisProjectionConfig,
            light: MapLibreGisLightConfig,
            sky: MapLibreGisSkyConfig,
            terrain: MapLibreGisTerrainConfig,
            sources: MapLibreGisSourcesConfig,
            layers: MapLibreGisLayersConfig,
        };
    }

    getInitConfig(): MapLibreGisComponentProps {
        /**
         * 默认配置尽量满足“开箱即用”：
         * - 使用官方 demo styleUrl
         * - 初始化一个可视角（center/zoom/bearing/pitch）
         * - projection 使用 mercator
         * - interaction 默认开启常见 handlers，并给出合理默认参数
         */
        return {
            base: {
                id: '',
                name: 'GIS(MapLibre)',
                type: 'MapLibreGis',
            },
            style: {
                base: {
                    styleUrl: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
                },
                camera: {
                    mode: 'center',
                    center: [120.2446746826172, 30.199146446037616],
                    zoom: 2,
                    bearing: 0,
                    pitch: 0,
                },
                projection: {
                    mode: 'static',
                    type: 'mercator',
                },
                light: {
                    enabled: true,
                    anchor: 'map',
                    position: { r: 1.5, a: 90, p: 80 },
                    color: '#ffffff',
                    intensity: 0.5,
                },
                sky: {
                    enabled: true,
                    mode: 'inherit',
                    skyColor: '#88C6FC',
                    horizonColor: '#ffffff',
                    fogColor: '#ffffff',
                    skyHorizonBlend: 0.8,
                    horizonFogBlend: 0.8,
                    fogGroundBlend: 0.5,
                    atmosphereBlend: { mode: 'zoom', z1: 10, z2: 12 },
                },
                interaction: {
                    enabled: true,
                    handlers: {
                        dragPan: true,
                        scrollZoom: true,
                        boxZoom: true,
                        doubleClickZoom: true,
                        dragRotate: true,
                        keyboard: true,
                        touchZoomRotate: true,
                        touchPitch: true,
                    },
                    cooperativeGestures: false,
                    clickTolerance: 3,
                    bearingSnap: 7,
                    scrollZoom: { aroundCenter: false, wheelZoomRate: 1 / 450, trackpadZoomRate: 1 / 100 },
                    dragPan: { linearity: 0, maxSpeed: 1400, deceleration: 2500 },
                },
                sources: [],
                layers: [],
            },
            filter: {
                enable: false,
                blur: 0,
                brightness: 1,
                contrast: 1,
                opacity: 1,
                saturate: 1,
                hueRotate: 0,
            }
        };
    }

    getEventList(): EventInfo[] {
        const events = super.getEventList();
        return events.concat([
            { id: 'click', name: '地图点击' },
            { id: 'featureClick', name: '要素点击' },
            { id: 'moveEnd', name: '视角变化' },
            { id: 'zoomEnd', name: '缩放结束' },
            { id: 'dataChange', name: '数据更新' },
        ]);
    }
}
