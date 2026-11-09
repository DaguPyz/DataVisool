/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useEffect, useState} from 'react';
import {CodeEditor, globalMessage} from "@datavisool/ui";
import DataSourceConfig from '@/comps/common-component/data-source-config/DataSourceConfig.tsx';
import {DataConfigType} from '@datavisool/sdk/types';
import {GisSourceType, StructuredSourceConfig} from '@datavisool/sdk/types';
import {parseJsonOrThrow, safeJsonStringify} from '@/comps/maplibre-gis/layer/layerUtils.ts';
import {sourceTypeOptions} from './sourceUtils.ts';
import {normalizeDataConfigAsync} from '@/util/DataSourceConfigUtil.ts';
import './SourceEditorDrawer.less';
import {
    MapLibreButton as Button,
    MapLibreDrawer as Drawer,
    MapLibreField as Field,
    MapLibreInput as Input,
    MapLibreNumberInput as InputNumber,
    MapLibreSelect as Select,
    MapLibreSwitch as Switch
} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';

/**
 * 数据源编辑抽屉（SourceEditorDrawer）
 *
 * 设计目标：
 * - 以“结构化表单”为主编辑常用字段（name/type/tiles/url/bounds/...）
 * - 对复杂字段（例如 GeoJSON 内联数据、clusterProperties 等）提供代码编辑器
 * - 保存时输出一个完整的 StructuredSourceConfig，交由上层面板替换回 sources 列表
 *
 * 这里是纯 UI 层：
 * - 不直接操作 map
 * - 不直接调用 controller.update
 * - onSave 由外层 MapLibreGisSourcesConfig 负责落库（controller.update）
 */
export interface SourceEditorDrawerProps {
    open: boolean;
    source: StructuredSourceConfig | null;
    onClose: () => void;
    onSave: (next: StructuredSourceConfig) => void;
}

const splitLines = (text: string) => {
    return (text ?? '')
        .split('\n')
        .map(t => t.trim())
        .filter(Boolean);
};

const toLineText = (arr?: string[]) => {
    return (arr ?? []).join('\n');
};

const SourceEditorDrawer: React.FC<SourceEditorDrawerProps> = ({open, source, onClose, onSave}) => {
    const [draft, setDraft] = useState<StructuredSourceConfig | null>(null);
    const [dataJsonText, setDataJsonText] = useState('');
    const [tilesText, setTilesText] = useState('');
    const [urlsText, setUrlsText] = useState('');

    useEffect(() => {
        /**
         * 每次打开抽屉时，从 source 创建一份草稿 draft。
         * - draft 用于本地编辑，避免未保存就污染外层 sources
         * - 同时初始化若干“代码/多行文本”字段的展示字符串
         */
        if (!open || !source)
            return;
        setDraft({...source} as any);
        const st = source.sourceType;
        if (st === 'geojson') {
            setDataJsonText(safeJsonStringify((source as any).dataJson ?? {type: 'FeatureCollection', features: []}));
        } else {
            setDataJsonText('');
        }
        if (st === 'vector' || st === 'raster' || st === 'raster-dem') {
            setTilesText(toLineText((source as any).tiles));
        } else {
            setTilesText('');
        }
        if (st === 'video') {
            setUrlsText(toLineText((source as any).urls));
        } else {
            setUrlsText('');
        }
    }, [open, source]);

    const current = draft ?? source;
    const titleText = current ? `编辑数据源：${current.name}` : '编辑数据源';

    const updateBounds = (idx: 0 | 1 | 2 | 3, v: number | null) => {
        if (!draft)
            return;
        const cur = (draft.bounds ?? [undefined, undefined, undefined, undefined]) as any[];
        const next = [...cur];
        next[idx] = typeof v === 'number' && Number.isFinite(v) ? v : undefined;
        const normalized = next.every(x => x == null) ? undefined : (next as any);
        setDraft({...draft, bounds: normalized});
    };

    const updateCoordinates = (idx: number, axis: 0 | 1, v: number | null) => {
        if (!draft)
            return;
        const cur = (draft as any).coordinates as any;
        const base = Array.isArray(cur) && cur.length === 4 ? cur : [[0, 0], [0, 0], [0, 0], [0, 0]];
        const next = base.map((p: any) => ([...(Array.isArray(p) ? p : [0, 0])] as [number, number]));
        next[idx][axis] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
        setDraft({...draft, coordinates: next} as any);
    };

    const commit = () => {
        /**
         * 将 UI 草稿转换回 StructuredSourceConfig 并提交：
         * - GeoJSON 内联：解析 code editor 的 JSON 文本
         * - tiles/urls：按行拆分为数组
         * - 其余字段基本直接透传
         *
         * 注意：这里做的是“输入校验 + 结构化输出”，不负责 merge 逻辑。
         */
        if (!draft)
            return;
        try {
            const st = draft.sourceType;
            const next: any = {...draft};

            if (st === 'geojson') {
                const mode = next.dataMode ?? 'empty';
                if (mode === 'inline') {
                    next.dataJson = parseJsonOrThrow(dataJsonText, 'GeoJSON') ?? {
                        type: 'FeatureCollection',
                        features: []
                    };
                }
            }

            if (st === 'vector' || st === 'raster' || st === 'raster-dem') {
                const tiles = splitLines(tilesText);
                next.tiles = tiles.length > 0 ? tiles : undefined;
            }

            if (st === 'video') {
                const urls = splitLines(urlsText);
                next.urls = urls.length > 0 ? urls : undefined;
            }

            onSave(next as StructuredSourceConfig);
        } catch (e: any) {
            globalMessage.messageApi?.error(e?.message ?? '保存失败');
        }
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size={560}
            title={<span className={'mlgis-drawer-title-text'}>{titleText}</span>}
            extra={<Button type={'primary'} size={'small'} onClick={commit}
                           className={'mlgis-drawer-save'}>保存</Button>}
            className={'mlgis-source-drawer'}
        >
            {draft ? (
                <div className={'mlgis-drawer-content'}>
                    <div className={'mlgis-card'}>
                        <div className={'mlgis-card-title'}>
                            <span className={'mlgis-card-title-text'}>基础</span>
                            <span className={'mlgis-card-title-id'} title={draft.id}>{`ID：${draft.id}`}</span>
                        </div>
                        <div className={'mlgis-card-desc'}>配置 sourceId、类型与生命周期相关开关。sourceId 用于 Layer
                            绑定与运行时更新。
                        </div>
                        <div className={'mlgis-grid'}>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'名称'} tip={'展示在数据源列表中，建议用业务含义命名。'} inline={true}>
                                    <Input value={draft.name}
                                           onChange={(e) => setDraft({...draft, name: e.target.value})} size={'small'}/>
                                </Field>
                                <Field label={'启用'} tip={'关闭后不向地图注入该 source。'} inline={true}>
                                    <Switch checked={draft.visible !== false} size='small' style={{width: 35}}
                                            onChange={(v) => setDraft({...draft, visible: v})}/>
                                </Field>
                            </div>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'sourceId'}
                                       tip={'在 Style.sources 中的 key；Layer.sourceRef 使用该值引用。'} inline={true}>
                                    <Input value={draft.id} disabled={true} size={'small'}/>
                                </Field>
                                <Field label={'类型'} tip={'不同类型支持的字段不同；高级 JSON 可覆盖/补充。'}
                                       inline={true}>
                                    <Select
                                        value={draft.sourceType as GisSourceType}
                                        options={sourceTypeOptions}
                                        onChange={(v) => setDraft({...draft, sourceType: v} as any)}
                                        size={'small'}
                                        style={{width: '100%'}}
                                    />
                                </Field>
                            </div>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'最小缩放'} tip={'小于该缩放级别时可减少加载。'} inline={true}>
                                    <InputNumber style={{width: '100%'}} value={draft.minzoom}
                                                 onChange={(v) => setDraft({
                                                     ...draft,
                                                     minzoom: typeof v === 'number' ? v : undefined
                                                 })} min={0} max={100} size={'small'}/>
                                </Field>
                                <Field label={'最大缩放'} tip={'大于该缩放级别时可减少加载。'} inline={true}>
                                    <InputNumber style={{width: '100%'}} value={draft.maxzoom}
                                                 onChange={(v) => setDraft({
                                                     ...draft,
                                                     maxzoom: typeof v === 'number' ? v : undefined
                                                 })} min={0} max={100} size={'small'}/>
                                </Field>
                            </div>
                            <Field label={'版权信息'} tip={'版权信息，注意合规与授权。'} inline={true}>
                                <Input value={draft.attribution}
                                       onChange={(e) => setDraft({...draft, attribution: e.target.value})}
                                       size={'small'} style={{width: '100%'}}
                                       placeholder={'例如 © OpenStreetMap contributors'}/>
                            </Field>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'边界（最小经度）'} inline={true}>
                                    <InputNumber style={{width: '100%'}} value={draft.bounds?.[0]}
                                                 onChange={(v) => updateBounds(0, typeof v === 'number' ? v : null)}
                                                 size={'small'}/>
                                </Field>
                                <Field label={'边界（最小纬度）'} inline={true}>
                                    <InputNumber style={{width: '100%'}} value={draft.bounds?.[1]}
                                                 onChange={(v) => updateBounds(1, typeof v === 'number' ? v : null)}
                                                 size={'small'}/>
                                </Field>
                            </div>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'边界（最大经度）'} inline={true}>
                                    <InputNumber style={{width: '100%'}} value={draft.bounds?.[2]}
                                                 onChange={(v) => updateBounds(2, typeof v === 'number' ? v : null)}
                                                 size={'small'}/>
                                </Field>
                                <Field label={'边界（最大纬度）'} inline={true}>
                                    <InputNumber style={{width: '100%'}} value={draft.bounds?.[3]}
                                                 onChange={(v) => updateBounds(3, typeof v === 'number' ? v : null)}
                                                 size={'small'}/>
                                </Field>
                            </div>
                        </div>
                    </div>

                    {draft.sourceType === 'geojson' ? (
                        <div className={'mlgis-card'}>
                            <div className={'mlgis-card-title'}>GeoJSON</div>
                            <div className={'mlgis-card-desc'}>支持 URL、内联 JSON、或绑定组件数据源（运行时自动
                                setData）。
                            </div>
                            <div className={'mlgis-grid'}>
                                <Field label={'数据模式'} tip={'dataConfig 会在预览/运行态周期性拉取并写入该 source。'}
                                       inline={true}>
                                    <Select
                                        value={(draft as any).dataMode ?? 'empty'}
                                        options={[
                                            {label: '空数据（占位）', value: 'empty'},
                                            {label: 'URL', value: 'url'},
                                            {label: '内联 JSON', value: 'inline'},
                                            {label: 'DataConfig（动态）', value: 'dataConfig'},
                                        ]}
                                        onChange={(v) => setDraft({...draft, dataMode: v} as any)}
                                        size={'small'}
                                        style={{width: '100%'}}
                                    />
                                </Field>
                                {(draft as any).dataMode === 'url' ? (
                                    <Field label={'URL'} tip={'可以是 GeoJSON 文件地址，也可以是返回 GeoJSON 的接口。'}>
                                        <Input value={(draft as any).dataUrl}
                                               onChange={(e) => setDraft({...draft, dataUrl: e.target.value} as any)}
                                               size={'small'} placeholder={'https://.../data.geojson'}/>
                                    </Field>
                                ) : null}
                                {(draft as any).dataMode === 'inline' ? (
                                    <Field label={'GeoJSON（JSON）'} tip={'建议保持为 FeatureCollection。'}>
                                        <CodeEditor value={dataJsonText} onChange={(v) => setDataJsonText(v ?? '')}
                                                    language={'json'} height={180} fullScreen={true}/>
                                    </Field>
                                ) : null}
                                {(draft as any).dataMode === 'dataConfig' ? (
                                    <div className={'mlgis-datasource'}>
                                        <DataSourceConfig
                                            sourceLabel={'GeoJSON 数据源'}
                                            data={((draft as any).dataConfig ?? {
                                                sourceType: 'static',
                                                staticData: {value: {}},
                                                value: {}
                                            }) as DataConfigType}
                                            onSave={async (cfg) => {
                                                const currentDataConfig = (draft as any)?.dataConfig ?? {sourceType: 'static'};
                                                const normalizedConfig = await normalizeDataConfigAsync(currentDataConfig, cfg as Record<string, any>);
                                                setDraft({...draft, dataConfig: normalizedConfig} as any)
                                            }}
                                        />
                                    </div>
                                ) : null}
                                <div className={'mlgis-grid-2'}>
                                    <Field label={'聚合'} tip={'cluster=true 时启用聚合。'} inline={true}>
                                        <Switch checked={(draft as any).cluster === true} size='small'
                                                style={{width: 35}}
                                                onChange={(v) => setDraft({...draft, cluster: v} as any)}/>
                                    </Field>
                                    <Field label={'generateId'} tip={'自动生成 feature.id（用于表达式/联动）。'}
                                           inline={true}>
                                        <Switch checked={(draft as any).generateId === true} size='small'
                                                style={{width: 35}}
                                                onChange={(v) => setDraft({...draft, generateId: v} as any)}/>
                                    </Field>
                                </div>
                                {(draft as any).cluster === true ? (
                                    <div className={'mlgis-grid-2'}>
                                        <Field label={'clusterRadius'} inline={true}>
                                            <InputNumber style={{width: '100%'}} value={(draft as any).clusterRadius}
                                                         onChange={(v) => setDraft({
                                                             ...draft,
                                                             clusterRadius: typeof v === 'number' ? v : undefined
                                                         } as any)} min={0} size={'small'}/>
                                        </Field>
                                        <Field label={'clusterMaxZoom'} inline={true}>
                                            <InputNumber style={{width: '100%'}} value={(draft as any).clusterMaxZoom}
                                                         onChange={(v) => setDraft({
                                                             ...draft,
                                                             clusterMaxZoom: typeof v === 'number' ? v : undefined
                                                         } as any)} min={0} max={22} size={'small'}/>
                                        </Field>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {draft.sourceType === 'vector' || draft.sourceType === 'raster' || draft.sourceType === 'raster-dem' ? (
                        <div className={'mlgis-card'}>
                            <div className={'mlgis-card-title'}>瓦片</div>
                            <div className={'mlgis-card-desc'}>支持 TileJSON url 或 tiles 列表（每行一个 URL 模板）。</div>
                            <div className={'mlgis-grid'}>
                                <Field label={'TileJSON URL'} tip={'可选；如果提供则通常不需要 tiles。'}>
                                    <Input value={(draft as any).url}
                                           onChange={(e) => setDraft({...draft, url: e.target.value} as any)}
                                           size={'small'} placeholder={'https://.../tiles.json'}/>
                                </Field>
                                <Field label={'Tiles'} tip={'每行一个；例如 https://.../{z}/{x}/{y}.pbf 或 .png。'}>
                                    <CodeEditor value={tilesText} onChange={(v) => setTilesText(v ?? '')}
                                                language={'javascript'} height={120} fullScreen={true}/>
                                </Field>
                                {draft.sourceType !== 'vector' ? (
                                    <Field label={'tileSize'} tip={'栅格/DEM 常用 256 或 512。'} inline={true}>
                                        <InputNumber style={{width: '100%'}} value={(draft as any).tileSize}
                                                     onChange={(v) => setDraft({
                                                         ...draft,
                                                         tileSize: typeof v === 'number' ? v : undefined
                                                     } as any)} min={1} size={'small'}/>
                                    </Field>
                                ) : null}
                                {draft.sourceType === 'raster-dem' ? (
                                    <Field label={'encoding'} tip={'terrarium / mapbox。'} inline={true}>
                                        <Select
                                            value={(draft as any).encoding ?? 'terrarium'}
                                            options={[
                                                {label: 'terrarium', value: 'terrarium'},
                                                {label: 'mapbox', value: 'mapbox'},
                                            ]}
                                            onChange={(v) => setDraft({...draft, encoding: v} as any)}
                                            size={'small'}
                                            style={{width: '100%'}}
                                        />
                                    </Field>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {draft.sourceType === 'image' ? (
                        <div className={'mlgis-card'}>
                            <div className={'mlgis-card-title'}>Image</div>
                            <div className={'mlgis-card-desc'}>图片覆盖需要 URL 与四角坐标（lng/lat）。</div>
                            <div className={'mlgis-grid'}>
                                <Field label={'URL'}>
                                    <Input value={(draft as any).url}
                                           onChange={(e) => setDraft({...draft, url: e.target.value} as any)}
                                           size={'small'} placeholder={'https://.../overlay.png'}/>
                                </Field>
                                <div className={'mlgis-grid'}>
                                    {[0, 1, 2, 3].map(i => (
                                        <div key={i} className={'mlgis-grid-2'}>
                                            <Field label={`P${i + 1} lng`} inline={true}>
                                                <InputNumber style={{width: '100%'}}
                                                             value={(draft as any).coordinates?.[i]?.[0]}
                                                             onChange={(v) => updateCoordinates(i, 0, typeof v === 'number' ? v : null)}
                                                             size={'small'}/>
                                            </Field>
                                            <Field label={`P${i + 1} lat`} inline={true}>
                                                <InputNumber style={{width: '100%'}}
                                                             value={(draft as any).coordinates?.[i]?.[1]}
                                                             onChange={(v) => updateCoordinates(i, 1, typeof v === 'number' ? v : null)}
                                                             size={'small'}/>
                                            </Field>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {draft.sourceType === 'video' ? (
                        <div className={'mlgis-card'}>
                            <div className={'mlgis-card-title'}>Video</div>
                            <div className={'mlgis-card-desc'}>Video source 需要 urls 与四角坐标（lng/lat）。</div>
                            <div className={'mlgis-grid'}>
                                <Field label={'URLs'} tip={'每行一个视频地址。'}>
                                    <CodeEditor value={urlsText} onChange={(v) => setUrlsText(v ?? '')}
                                                language={'javascript'} height={120} fullScreen={true}/>
                                </Field>
                                <div className={'mlgis-grid'}>
                                    {[0, 1, 2, 3].map(i => (
                                        <div key={i} className={'mlgis-grid-2'}>
                                            <Field label={`P${i + 1} lng`} inline={true}>
                                                <InputNumber style={{width: '100%'}}
                                                             value={(draft as any).coordinates?.[i]?.[0]}
                                                             onChange={(v) => updateCoordinates(i, 0, typeof v === 'number' ? v : null)}
                                                             size={'small'}/>
                                            </Field>
                                            <Field label={`P${i + 1} lat`} inline={true}>
                                                <InputNumber style={{width: '100%'}}
                                                             value={(draft as any).coordinates?.[i]?.[1]}
                                                             onChange={(v) => updateCoordinates(i, 1, typeof v === 'number' ? v : null)}
                                                             size={'small'}/>
                                            </Field>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {draft.sourceType === 'canvas' ? (
                        <div className={'mlgis-card'}>
                            <div className={'mlgis-card-title'}>Canvas</div>
                            <div className={'mlgis-card-desc'}>Canvas source 需要 canvasId（同页面元素）与四角坐标。</div>
                            <div className={'mlgis-grid'}>
                                <Field label={'canvasId'}>
                                    <Input value={(draft as any).canvasId}
                                           onChange={(e) => setDraft({...draft, canvasId: e.target.value} as any)}
                                           size={'small'} placeholder={'DOM canvas id'}/>
                                </Field>
                                <div className={'mlgis-grid'}>
                                    {[0, 1, 2, 3].map(i => (
                                        <div key={i} className={'mlgis-grid-2'}>
                                            <Field label={`P${i + 1} lng`} inline={true}>
                                                <InputNumber style={{width: '100%'}}
                                                             value={(draft as any).coordinates?.[i]?.[0]}
                                                             onChange={(v) => updateCoordinates(i, 0, typeof v === 'number' ? v : null)}
                                                             size={'small'}/>
                                            </Field>
                                            <Field label={`P${i + 1} lat`} inline={true}>
                                                <InputNumber style={{width: '100%'}}
                                                             value={(draft as any).coordinates?.[i]?.[1]}
                                                             onChange={(v) => updateCoordinates(i, 1, typeof v === 'number' ? v : null)}
                                                             size={'small'}/>
                                            </Field>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </Drawer>
    );
};

export default SourceEditorDrawer;
