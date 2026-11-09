/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useEffect, useMemo, useState} from 'react';
import {globalMessage} from "@datavisool/ui";
import {IdGenerate} from '@datavisool/sdk';
import {
    LayerFilterCompareCondition,
    LayerFilterCompareOp,
    LayerFilterCondition,
    LayerFilterGroupConfig,
    LayerFilterValueType,
    LayerStyleConfig,
    LayerStyleValueConfig,
    StructuredLayerConfig,
    StructuredSourceConfig,
} from '@datavisool/sdk/types';
import { layerTypeOptions } from './layerUtils.ts';
import { compileLayerFilter } from './layerFilterCompiler.ts';
import { layerFieldDefsByType, LayerFieldDef, LayerFieldValueKind } from './layerFieldDefs.ts';
import { compileLayerStyle } from './layerStyleCompiler.ts';
import './LayerEditorDrawer.less';
import {
    MapLibreButton as Button,
    MapLibreColorPicker as ColorPicker,
    MapLibreDrawer as Drawer,
    MapLibreField as Field,
    MapLibreInput as Input,
    MapLibreNumberInput as InputNumber,
    MapLibreSelect as Select,
    MapLibreSwitch as Switch
} from '@/comps/maplibre-gis/comm/MapLibreGisConfigUI.tsx';

/**
 * 图层编辑抽屉（LayerEditorDrawer）
 *
 * 设计目标：
 * - 用结构化表单来编辑 layer 的常用字段（type/sourceRef/sourceLayer/paint/layout/visibility）
 * - 以“结构化过滤器/样式配置”生成最终 MapLibre 表达式（filter/style），避免直接手写复杂 JSON
 *
 * 注意：
 * - onSave 输出的是完整的 StructuredLayerConfig，由外层 MapLibreGisLayersConfig 替换回 layers 列表
 * - controller.applyLayers 会把 layers 转换为 map.addLayer(...)，并处理可见性/默认 paint/layout 等
 */
export interface LayerEditorDrawerProps {
    open: boolean;
    layer: StructuredLayerConfig | null;
    sources: StructuredSourceConfig[];
    onClose: () => void;
    onSave: (next: StructuredLayerConfig) => void;
}

const LayerEditorDrawer: React.FC<LayerEditorDrawerProps> = ({ open, layer, sources, onClose, onSave }) => {
    const [draft, setDraft] = useState<StructuredLayerConfig | null>(null);
    const [styleSearch, setStyleSearch] = useState('');

    useEffect(() => {
        /**
         * 打开抽屉时把 layer 复制成可编辑草稿 draft。
         * - paint/layout 做浅拷贝，避免编辑过程直接修改外层引用
         */
        if (!open || !layer)
            return;
        setDraft({
            ...(layer as any),
            paint: { ...(layer.paint ?? {}) },
            layout: { ...(layer.layout ?? {}) },
        });
    }, [open, layer]);

    const currentLayer = draft ?? layer;
    const titleText = currentLayer ? `编辑图层：${currentLayer.name}` : '编辑图层';

    const safeSources = useMemo(() => (Array.isArray(sources) ? sources : []), [sources]);
    const sourceOptions = useMemo(() => {
        return [{ label: '不绑定（使用图层内置数据源）', value: '' }, ...safeSources.map(s => ({ label: `${s.name}（${s.id}）`, value: s.id }))];
    }, [safeSources]);

    const selectedSource = useMemo(() => {
        if (!draft?.sourceRef)
            return null;
        return safeSources.find(s => s.id === draft.sourceRef) ?? null;
    }, [draft?.sourceRef, safeSources]);

    const commit = () => {
        /**
         * 保存：把草稿转换为最终的 StructuredLayerConfig。
         * - 校验：vector source 需要 sourceLayer；非 background 需要绑定 sourceRef
         * - filterConfig → filter（compileLayerFilter）
         * - styleConfig → paint/layout（compileLayerStyle 后 merge 到原 paint/layout）
         */
        if (!draft)
            return;
        const baseDraft: any = { ...draft };
        if (baseDraft.type === 'background')
            baseDraft.sourceRef = undefined;
        if (selectedSource?.sourceType === 'vector') {
            const sl = (baseDraft.sourceLayer ?? '').trim();
            if (!sl) {
                globalMessage.messageApi?.error('Vector 数据源需要配置“源图层”');
                return;
            }
        }
        if (baseDraft.type !== 'background' && (!baseDraft.sourceRef || String(baseDraft.sourceRef).trim() === '')) {
            globalMessage.messageApi?.error('请先绑定数据源');
            return;
        }
        const compiledFilter = baseDraft.filterConfig ? compileLayerFilter(baseDraft.filterConfig) : undefined;
        let next: StructuredLayerConfig = { ...baseDraft, filter: compiledFilter };
        if (baseDraft.styleConfig) {
            const compiled = compileLayerStyle(baseDraft.styleConfig);
            next = {
                ...next,
                paint: { ...(baseDraft.paint ?? {}), ...(compiled.paint ?? {}) },
                layout: { ...(baseDraft.layout ?? {}), ...(compiled.layout ?? {}) },
            };
        }
        onSave(next);
    };

    const updateSourceBinding = (sourceId: string) => {
        if (!draft)
            return;
        const nextRef = sourceId && sourceId !== '' ? sourceId : undefined;
        if (!nextRef) {
            setDraft({ ...draft, sourceRef: undefined });
            return;
        }
        const src = safeSources.find(s => s.id === nextRef) ?? null;
        const next: any = { ...draft, sourceRef: nextRef };
        if (src?.sourceType !== 'vector')
            next.sourceLayer = undefined;
        setDraft(next);
    };

    const ensureFilterConfig = () => {
        if (!draft)
            return;
        if (draft.filterConfig)
            return;
        const next: LayerFilterGroupConfig = { op: 'all', items: [] };
        setDraft({ ...draft, filterConfig: next });
    };

    const setFilterEnabled = (enabled: boolean) => {
        if (!draft)
            return;
        if (!enabled) {
            const next: any = { ...draft };
            next.filterConfig = undefined;
            next.filter = undefined;
            setDraft(next);
            return;
        }
        ensureFilterConfig();
    };

    const addCondition = (kind: LayerFilterCondition['kind']) => {
        if (!draft)
            return;
        const base: any = { id: IdGenerate.generateId(), kind };
        let nextCond: LayerFilterCondition;
        if (kind === 'geometry') {
            nextCond = { ...base, geometryType: 'Point' };
        } else if (kind === 'compare') {
            nextCond = { ...base, key: '', op: 'eq' as LayerFilterCompareOp, valueType: 'string' as LayerFilterValueType, value: '' };
        } else if (kind === 'exists') {
            nextCond = { ...base, key: '', exists: true };
        } else {
            nextCond = { ...base, key: '', not: false, valueType: 'string', values: [] };
        }
        const cfg = draft.filterConfig ?? { op: 'all', items: [] };
        setDraft({ ...draft, filterConfig: { ...cfg, items: [...cfg.items, nextCond] } });
    };

    const updateCondition = (id: string, patch: Partial<LayerFilterCondition>) => {
        if (!draft?.filterConfig)
            return;
        const nextItems = draft.filterConfig.items.map((c) => (c.id === id ? ({ ...(c as any), ...(patch as any) } as LayerFilterCondition) : c));
        setDraft({ ...draft, filterConfig: { ...draft.filterConfig, items: nextItems } });
    };

    const deleteCondition = (id: string) => {
        if (!draft?.filterConfig)
            return;
        setDraft({ ...draft, filterConfig: { ...draft.filterConfig, items: draft.filterConfig.items.filter(c => c.id !== id) } });
    };

    const switchConditionKind = (id: string, nextKind: LayerFilterCondition['kind']) => {
        if (!draft?.filterConfig)
            return;
        const current = draft.filterConfig.items.find(c => c.id === id);
        if (!current || current.kind === nextKind)
            return;

        const base: any = { id, kind: nextKind };
        let nextCond: LayerFilterCondition;
        if (nextKind === 'geometry') {
            nextCond = { ...base, geometryType: (current as any).geometryType ?? 'Point' };
        } else if (nextKind === 'compare') {
            const prev = current as any;
            const key = typeof prev.key === 'string' ? prev.key : '';
            const op = (prev.op ?? 'eq') as LayerFilterCompareOp;
            const valueType = (prev.valueType ?? 'string') as LayerFilterValueType;
            const value =
                prev.kind === 'compare'
                    ? prev.value
                    : (valueType === 'number' ? 0 : valueType === 'boolean' ? false : '');
            nextCond = { ...base, key, op, valueType, value };
        } else if (nextKind === 'exists') {
            const prev = current as any;
            const key = typeof prev.key === 'string' ? prev.key : '';
            nextCond = { ...base, key, exists: true };
        } else {
            const prev = current as any;
            const key = typeof prev.key === 'string' ? prev.key : '';
            const valueType = (prev.valueType === 'number' ? 'number' : 'string') as any;
            const values = Array.isArray(prev.values) ? prev.values : [];
            nextCond = { ...base, key, not: false, valueType, values };
        }

        const nextItems = draft.filterConfig.items.map((c) => (c.id === id ? nextCond : c));
        setDraft({ ...draft, filterConfig: { ...draft.filterConfig, items: nextItems } });
    };

    const renderConditionValueInput = (c: LayerFilterCompareCondition) => {
        if (c.valueType === 'number') {
            return (
                <InputNumber
                    style={{ width: '100%' }}
                    value={typeof c.value === 'number' ? c.value : undefined}
                    onChange={(v) => updateCondition(c.id, { value: typeof v === 'number' ? v : 0 })}
                    size={'small'}
                />
            );
        }
        if (c.valueType === 'boolean') {
            return (
                <Switch
                    checked={Boolean(c.value)}
                    size={'small'}
                    style={{ width: 35 }}
                    onChange={(v) => updateCondition(c.id, { value: v })}
                />
            );
        }
        return (
            <Input
                value={typeof c.value === 'string' ? c.value : ''}
                onChange={(e) => updateCondition(c.id, { value: e.target.value })}
                size={'small'}
            />
        );
    };

    const ensureStyleConfig = () => {
        if (!draft)
            return;
        if (draft.styleConfig)
            return;
        const next: LayerStyleConfig = { paint: {}, layout: {} };
        setDraft({ ...draft, styleConfig: next });
    };

    const setStyleField = (section: 'paint' | 'layout', key: string, cfg?: LayerStyleValueConfig) => {
        if (!draft)
            return;
        const current = draft.styleConfig ?? { paint: {}, layout: {} };
        const map = { ...(current[section] ?? {}) } as Record<string, LayerStyleValueConfig>;
        if (!cfg) {
            delete map[key];
        } else {
            map[key] = cfg;
        }
        const next = { ...current, [section]: map } as LayerStyleConfig;
        setDraft({ ...draft, styleConfig: next });
    };

    const getStyleField = (section: 'paint' | 'layout', key: string): LayerStyleValueConfig | undefined => {
        return (draft?.styleConfig as any)?.[section]?.[key] as any;
    };

    const defaultConstValue = (kind: LayerFieldValueKind): any => {
        if (kind === 'number')
            return 0;
        if (kind === 'color')
            return '#4FB8FF';
        if (kind === 'boolean')
            return true;
        if (kind === 'number_array')
            return [0, 0];
        return '';
    };

    const renderValueEditor = (kind: LayerFieldValueKind, value: any, onChange: (v: any) => void) => {
        if (kind === 'number') {
            return (
                <InputNumber
                    style={{ width: '100%' }}
                    value={typeof value === 'number' ? value : undefined}
                    onChange={(v) => onChange(typeof v === 'number' ? v : 0)}
                    size={'small'}
                />
            );
        }
        if (kind === 'boolean') {
            return (
                <Switch checked={Boolean(value)} size='small' style={{ width: 35 }} onChange={(v) => onChange(v)} />
            );
        }
        if (kind === 'number_array') {
            const arr = Array.isArray(value) ? value : [0, 0];
            return (
                <div style={{ display: 'flex', gap: 8 }}>
                    <InputNumber style={{ width: '100%' }} value={typeof arr[0] === 'number' ? arr[0] : 0} onChange={(v) => onChange([typeof v === 'number' ? v : 0, typeof arr[1] === 'number' ? arr[1] : 0])} size={'small'} />
                    <InputNumber style={{ width: '100%' }} value={typeof arr[1] === 'number' ? arr[1] : 0} onChange={(v) => onChange([typeof arr[0] === 'number' ? arr[0] : 0, typeof v === 'number' ? v : 0])} size={'small'} />
                </div>
            );
        }
        if (kind === 'color') {
            const v = typeof value === 'string' && value.trim() !== '' ? value : '#4FB8FF';
            return (
                <div style={{ width: '100%' }}>
                    <ColorPicker
                        size={'small'}
                        value={v}
                        onChange={(color) => onChange(color.toHexString())}
                        showText
                    />
                </div>
            );
        }
        return (
            <Input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} size={'small'} />
        );
    };

    const renderStopsEditor = (kind: LayerFieldValueKind, stops: Array<{ input: number; value: any }>, onChange: (next: Array<{ input: number; value: any }>) => void, inputLabel: string) => {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stops.map((s, idx) => (
                    <div key={idx} className={'mlgis-style-stop-row'}>
                        <InputNumber
                            style={{ width: '100%' }}
                            value={s.input}
                            onChange={(v) => {
                                const next = stops.slice();
                                next[idx] = { ...next[idx], input: typeof v === 'number' ? v : 0 };
                                onChange(next);
                            }}
                            size={'small'}
                            placeholder={inputLabel}
                        />
                        <div className={'mlgis-style-stop-value'}>
                            {renderValueEditor(kind, s.value, (v) => {
                                const next = stops.slice();
                                next[idx] = { ...next[idx], value: v };
                                onChange(next);
                            })}
                        </div>
                        <Button danger={true} size={'small'} onClick={() => onChange(stops.filter((_, i) => i !== idx))}>删除</Button>
                    </div>
                ))}
                <Button size={'small'} onClick={() => onChange([...stops, { input: 0, value: defaultConstValue(kind) }])}>新增断点</Button>
            </div>
        );
    };

    const renderStyleField = (def: LayerFieldDef) => {
        const cfg = getStyleField(def.section, def.key);
        const mode = (cfg as any)?.mode ?? 'const';
        const modeOptions = def.modes.map((m) => {
            const labelMap: Record<string, string> = {
                const: '常量',
                prop_get: '取属性',
                prop_match: '按属性匹配',
                prop_interpolate: '按属性插值',
                zoom_step: '按缩放分段',
                zoom_interpolate: '按缩放插值',
            };
            return { label: labelMap[m] ?? m, value: m };
        });

        const setMode = (m: any) => {
            ensureStyleConfig();
            if (m === 'const') {
                setStyleField(def.section, def.key, { mode: 'const', value: defaultConstValue(def.kind) } as any);
                return;
            }
            if (m === 'prop_get') {
                setStyleField(def.section, def.key, { mode: 'prop_get', property: '' } as any);
                return;
            }
            if (m === 'prop_match') {
                setStyleField(def.section, def.key, { mode: 'prop_match', property: '', cases: [], defaultValue: defaultConstValue(def.kind) } as any);
                return;
            }
            if (m === 'prop_interpolate') {
                setStyleField(def.section, def.key, { mode: 'prop_interpolate', property: '', stops: [{ input: 0, value: defaultConstValue(def.kind) }] } as any);
                return;
            }
            if (m === 'zoom_step') {
                setStyleField(def.section, def.key, { mode: 'zoom_step', defaultValue: defaultConstValue(def.kind), stops: [{ input: 10, value: defaultConstValue(def.kind) }] } as any);
                return;
            }
            setStyleField(def.section, def.key, { mode: 'zoom_interpolate', stops: [{ input: 10, value: defaultConstValue(def.kind) }, { input: 14, value: defaultConstValue(def.kind) }] } as any);
        };

        const blockStyle: React.CSSProperties = {
            border: '1px solid var(--datavisool-color-border)',
            borderRadius: 8,
            padding: '10px 10px 12px',
            background: 'rgba(59, 130, 255, 0.07)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
        };

        const metaStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
        };

        const sectionPillStyle: React.CSSProperties = {
            flex: '0 0 auto',
            padding: '2px 6px',
            borderRadius: 6,
            border: '1px solid var(--datavisool-color-border)',
            background: 'rgba(124, 58, 237, 0.14)',
            color: 'var(--datavisool-color-text-secondary)',
            fontSize: 11,
            lineHeight: '14px',
        };

        const keyStyle: React.CSSProperties = {
            flex: '1 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--datavisool-color-text-tertiary)',
            fontSize: 12,
            lineHeight: '16px',
        };

        const headerStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
        };

        const actionsStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '0 0 auto',
        };

        const bodyStyle: React.CSSProperties = {
            border: '1px solid var(--datavisool-color-border)',
            borderRadius: 8,
            padding: 10,
            background: 'rgba(7, 16, 34, 0.55)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
        };

        return (
            <Field key={`${def.section}:${def.key}`} label={def.label} tip={def.key}>
                <div style={blockStyle}>
                    <div style={headerStyle}>
                        <div style={metaStyle}>
                            <span style={sectionPillStyle}>{def.section === 'paint' ? 'Paint' : 'Layout'}</span>
                            <span style={keyStyle}>{def.key}</span>
                        </div>
                        <div style={actionsStyle}>
                            <Select
                                value={mode}
                                options={modeOptions}
                                onChange={(v) => setMode(v)}
                                size={'small'}
                                style={{ width: 140 }}
                            />
                            <Button size={'small'} danger={true} onClick={() => setStyleField(def.section, def.key, undefined)}>清空</Button>
                        </div>
                    </div>

                    <div style={bodyStyle}>
                        {mode === 'const' ? (
                            def.kind === 'enum' ? (
                                <Select
                                    value={(cfg as any)?.value ?? ''}
                                    options={def.options ?? []}
                                    onChange={(v) => setStyleField(def.section, def.key, { mode: 'const', value: v } as any)}
                                    size={'small'}
                                    style={{ width: '100%' }}
                                />
                            ) : (
                                renderValueEditor(def.kind, (cfg as any)?.value ?? defaultConstValue(def.kind), (v) => setStyleField(def.section, def.key, { mode: 'const', value: v } as any))
                            )
                        ) : null}

                        {mode === 'prop_get' ? (
                            <Input
                                value={(cfg as any)?.property ?? ''}
                                onChange={(e) => setStyleField(def.section, def.key, { mode: 'prop_get', property: e.target.value } as any)}
                                size={'small'}
                                placeholder={'属性名'}
                            />
                        ) : null}

                        {mode === 'zoom_interpolate' ? (
                            renderStopsEditor(def.kind, (cfg as any)?.stops ?? [], (stops) => setStyleField(def.section, def.key, { mode: 'zoom_interpolate', stops } as any), 'zoom')
                        ) : null}

                        {mode === 'zoom_step' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div>
                                    <div style={{ marginBottom: 6, color: 'var(--datavisool-color-text-tertiary)', fontSize: 12 }}>默认值</div>
                                    {renderValueEditor(def.kind, (cfg as any)?.defaultValue ?? defaultConstValue(def.kind), (v) => setStyleField(def.section, def.key, { ...(cfg as any), mode: 'zoom_step', defaultValue: v } as any))}
                                </div>
                                {renderStopsEditor(def.kind, (cfg as any)?.stops ?? [], (stops) => setStyleField(def.section, def.key, { ...(cfg as any), mode: 'zoom_step', stops } as any), 'zoom')}
                            </div>
                        ) : null}

                        {mode === 'prop_interpolate' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Input
                                    value={(cfg as any)?.property ?? ''}
                                    onChange={(e) => setStyleField(def.section, def.key, { ...(cfg as any), mode: 'prop_interpolate', property: e.target.value } as any)}
                                    size={'small'}
                                    placeholder={'属性名'}
                                />
                                {renderStopsEditor(def.kind, (cfg as any)?.stops ?? [], (stops) => setStyleField(def.section, def.key, { ...(cfg as any), mode: 'prop_interpolate', stops } as any), '值')}
                            </div>
                        ) : null}

                        {mode === 'prop_match' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Input
                                    value={(cfg as any)?.property ?? ''}
                                    onChange={(e) => setStyleField(def.section, def.key, { ...(cfg as any), mode: 'prop_match', property: e.target.value } as any)}
                                    size={'small'}
                                    placeholder={'属性名'}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {((cfg as any)?.cases ?? []).map((it: any, idx: number) => (
                                        <div key={idx} className={'mlgis-style-match-row'}>
                                            <Input
                                                value={typeof it.input === 'string' || typeof it.input === 'number' ? String(it.input) : ''}
                                                onChange={(e) => {
                                                    const t = e.target.value;
                                                    const n = Number(t);
                                                    const input = t.trim() !== '' && Number.isFinite(n) ? n : t;
                                                    const nextCases = ((cfg as any).cases ?? []).slice();
                                                    nextCases[idx] = { ...nextCases[idx], input };
                                                    setStyleField(def.section, def.key, { ...(cfg as any), mode: 'prop_match', cases: nextCases } as any);
                                                }}
                                                size={'small'}
                                                placeholder={'属性值'}
                                                style={{ width: '100%' }}
                                            />
                                            <div className={'mlgis-style-match-value'}>
                                                {renderValueEditor(def.kind, it.value, (v) => {
                                                    const nextCases = ((cfg as any).cases ?? []).slice();
                                                    nextCases[idx] = { ...nextCases[idx], value: v };
                                                    setStyleField(def.section, def.key, { ...(cfg as any), mode: 'prop_match', cases: nextCases } as any);
                                                })}
                                            </div>
                                            <Button danger={true} size={'small'} onClick={() => {
                                                const nextCases = ((cfg as any).cases ?? []).filter((_: any, i: number) => i !== idx);
                                                setStyleField(def.section, def.key, { ...(cfg as any), mode: 'prop_match', cases: nextCases } as any);
                                            }}>删除</Button>
                                        </div>
                                    ))}
                                    <Button size={'small'} onClick={() => {
                                        const nextCases = [...(((cfg as any)?.cases ?? []) as any[]), { input: '', value: defaultConstValue(def.kind) }];
                                        setStyleField(def.section, def.key, { ...(cfg as any), mode: 'prop_match', cases: nextCases } as any);
                                    }}>新增匹配项</Button>
                                    <div>
                                        <div style={{ marginBottom: 6, color: 'var(--datavisool-color-text-tertiary)', fontSize: 12 }}>默认值</div>
                                        {renderValueEditor(def.kind, (cfg as any)?.defaultValue ?? defaultConstValue(def.kind), (v) => setStyleField(def.section, def.key, { ...(cfg as any), mode: 'prop_match', defaultValue: v } as any))}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </Field>
        );
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size={560}
            title={<span className={'mlgis-drawer-title-text'}>{titleText}</span>}
            extra={<Button type={'primary'} size={'small'} onClick={commit} className={'mlgis-drawer-save'}>保存</Button>}
            className={'mlgis-layer-drawer'}
        >
            {draft ? (
                <div className={'mlgis-drawer-content'}>
                    <div className={'mlgis-card'}>
                        <div className={'mlgis-card-title'}>
                            <span className={'mlgis-card-title-text'}>基础</span>
                            <span className={'mlgis-card-title-id'} title={draft.id}>{`ID：${draft.id}`}</span>
                        </div>
                        <div className={'mlgis-card-desc'}>设置图层名称、类型、可见性与缩放范围。</div>
                        <div className={'mlgis-grid'}>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'名称'} inline={true}>
                                    <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} size={'small'} />
                                </Field>
                                <Field label={'可见'} inline={true}>
                                    <Switch checked={draft.visible !== false} size='small' style={{ width: 35 }} onChange={(v) => setDraft({ ...draft, visible: v })} />
                                </Field>
                            </div>
                            <Field label={'图层类型'} tip={'决定渲染方式，如点/线/面/符号/栅格等。'} inline={true}>
                                <Select
                                    value={draft.type}
                                    options={layerTypeOptions}
                                    onChange={(v) => setDraft({ ...draft, type: v })}
                                    size={'small'}
                                    style={{ width: '100%' }}
                                />
                            </Field>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'最小缩放'} inline={true}>
                                    <InputNumber style={{ width: '100%' }} value={draft.minzoom} onChange={(v) => setDraft({ ...draft, minzoom: typeof v === 'number' ? v : undefined })} min={0} max={100} size={'small'} />
                                </Field>
                                <Field label={'最大缩放'} inline={true}>
                                    <InputNumber style={{ width: '100%' }} value={draft.maxzoom} onChange={(v) => setDraft({ ...draft, maxzoom: typeof v === 'number' ? v : undefined })} min={0} max={100} size={'small'} />
                                </Field>
                            </div>
                        </div>
                    </div>

                    <div className={'mlgis-card'}>
                        <div className={'mlgis-card-title'}>数据源</div>
                        <div className={'mlgis-card-desc'}>选择 Sources 面板中的数据源，并配置必要的图层字段。</div>
                        <div className={'mlgis-grid'}>
                            <Field label={'绑定数据源'} tip={'绑定后图层将直接引用该 sourceId。'}>
                                <Select
                                    value={draft.sourceRef ?? ''}
                                    options={sourceOptions}
                                    onChange={(v) => updateSourceBinding(v)}
                                    size={'small'}
                                    style={{ width: '100%' }}
                                />
                            </Field>

                            {selectedSource?.sourceType === 'vector' ? (
                                <Field label={'源图层'} tip={'Vector tiles 内部的 layer 名称。'}>
                                    <Input
                                        value={draft.sourceLayer}
                                        onChange={(e) => setDraft({ ...draft, sourceLayer: e.target.value })}
                                        size={'small'}
                                        placeholder={'例如: building / roads'}
                                    />
                                </Field>
                            ) : null}
                        </div>
                    </div>

                    <div className={'mlgis-card'}>
                        <div className={'mlgis-card-title'}>过滤器</div>
                        <div className={'mlgis-card-desc'}>通过配置筛选需要渲染的要素，例如只渲染 Point 或属性满足条件的要素。</div>
                        <div className={'mlgis-grid'}>
                            <div className={'mlgis-grid-2'}>
                                <Field label={'启用过滤器'} inline={true}>
                                    <Switch checked={Boolean(draft.filterConfig)} size='small' style={{ width: 35 }} onChange={(v) => setFilterEnabled(v)} />
                                </Field>
                                <Field label={'组合方式'} inline={true}>
                                    <Select
                                        value={draft.filterConfig?.op ?? 'all'}
                                        options={[
                                            { label: '满足全部条件（AND）', value: 'all' },
                                            { label: '满足任一条件（OR）', value: 'any' },
                                            { label: '全部不满足（NOT OR）', value: 'none' },
                                        ]}
                                        onChange={(v) => {
                                            const cfg = draft.filterConfig ?? { op: 'all', items: [] };
                                            setDraft({ ...draft, filterConfig: { ...cfg, op: v } });
                                        }}
                                        size={'small'}
                                        style={{ width: '100%' }}
                                        disabled={!draft.filterConfig}
                                    />
                                </Field>
                            </div>

                            <div className={'mlgis-grid'}>
                                {(draft.filterConfig?.items ?? []).map((c) => (
                                    <div key={c.id} className={'mlgis-grid-2'}>
                                        <Select
                                            value={c.kind}
                                            options={[
                                                { label: '几何类型', value: 'geometry' },
                                                { label: '属性比较', value: 'compare' },
                                                { label: '属性存在', value: 'exists' },
                                                { label: '属性包含', value: 'in' },
                                            ]}
                                            onChange={(v) => {
                                                switchConditionKind(c.id, v as any);
                                            }}
                                            size={'small'}
                                            style={{ width: '100%' }}
                                            disabled={!draft.filterConfig}
                                        />
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <div style={{ flex: 1 }}>
                                                {c.kind === 'geometry' ? (
                                                    <Select
                                                        value={(c as any).geometryType}
                                                        options={[
                                                            { label: '点（Point）', value: 'Point' },
                                                            { label: '线（LineString）', value: 'LineString' },
                                                            { label: '面（Polygon）', value: 'Polygon' },
                                                        ]}
                                                        onChange={(v) => updateCondition(c.id, { geometryType: v } as any)}
                                                        size={'small'}
                                                        style={{ width: '100%' }}
                                                        disabled={!draft.filterConfig}
                                                    />
                                                ) : null}

                                                {c.kind === 'exists' ? (
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <Input
                                                            value={(c as any).key}
                                                            onChange={(e) => updateCondition(c.id, { key: e.target.value } as any)}
                                                            size={'small'}
                                                            placeholder={'属性名'}
                                                            disabled={!draft.filterConfig}
                                                        />
                                                        <Select
                                                            value={(c as any).exists ? '1' : '0'}
                                                            options={[
                                                                { label: '存在', value: '1' },
                                                                { label: '不存在', value: '0' },
                                                            ]}
                                                            onChange={(v) => updateCondition(c.id, { exists: v === '1' } as any)}
                                                            size={'small'}
                                                            style={{ width: 110 }}
                                                            disabled={!draft.filterConfig}
                                                        />
                                                    </div>
                                                ) : null}

                                                {c.kind === 'in' ? (
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <Input
                                                            value={(c as any).key}
                                                            onChange={(e) => updateCondition(c.id, { key: e.target.value } as any)}
                                                            size={'small'}
                                                            placeholder={'属性名'}
                                                            disabled={!draft.filterConfig}
                                                        />
                                                        <Select
                                                            value={(c as any).valueType}
                                                            options={[
                                                                { label: '字符串', value: 'string' },
                                                                { label: '数字', value: 'number' },
                                                            ]}
                                                            onChange={(v) => updateCondition(c.id, { valueType: v } as any)}
                                                            size={'small'}
                                                            style={{ width: 110 }}
                                                            disabled={!draft.filterConfig}
                                                        />
                                                        <Select
                                                            value={(c as any).not ? '1' : '0'}
                                                            options={[
                                                                { label: '包含', value: '0' },
                                                                { label: '不包含', value: '1' },
                                                            ]}
                                                            onChange={(v) => updateCondition(c.id, { not: v === '1' } as any)}
                                                            size={'small'}
                                                            style={{ width: 110 }}
                                                            disabled={!draft.filterConfig}
                                                        />
                                                    </div>
                                                ) : null}

                                                {c.kind === 'in' ? (
                                                    <Input
                                                        value={Array.isArray((c as any).values) ? (c as any).values.join(',') : ''}
                                                        onChange={(e) => {
                                                            const raw = e.target.value;
                                                            const vt = (c as any).valueType;
                                                            const parts = raw.split(',').map(t => t.trim()).filter(Boolean);
                                                            const values = vt === 'number' ? parts.map(p => Number(p)).filter(n => Number.isFinite(n)) : parts;
                                                            updateCondition(c.id, { values } as any);
                                                        }}
                                                        size={'small'}
                                                        placeholder={'值列表，用逗号分隔'}
                                                        disabled={!draft.filterConfig}
                                                        style={{ marginTop: 8 }}
                                                    />
                                                ) : null}

                                                {c.kind === 'compare' ? (
                                                    <div className={'mlgis-filter-compare'}>
                                                        <div className={'mlgis-filter-compare-row1'}>
                                                            <Input
                                                                value={(c as any).key}
                                                                style={{ width: 120 }}
                                                                onChange={(e) => updateCondition(c.id, { key: e.target.value } as any)}
                                                                size={'small'}
                                                                placeholder={'属性名'}
                                                                disabled={!draft.filterConfig}
                                                            />
                                                            <Select
                                                                value={(c as any).op}
                                                                options={[
                                                                    { label: '=', value: 'eq' },
                                                                    { label: '≠', value: 'neq' },
                                                                    { label: '>', value: 'gt' },
                                                                    { label: '≥', value: 'gte' },
                                                                    { label: '<', value: 'lt' },
                                                                    { label: '≤', value: 'lte' },
                                                                ]}
                                                                onChange={(v) => updateCondition(c.id, { op: v } as any)}
                                                                size={'small'}
                                                                disabled={!draft.filterConfig}
                                                            />
                                                            <Select
                                                                value={(c as any).valueType}
                                                                options={[
                                                                    { label: '字符串', value: 'string' },
                                                                    { label: '数字', value: 'number' },
                                                                    { label: '布尔', value: 'boolean' },
                                                                ]}
                                                                onChange={(v) => updateCondition(c.id, { valueType: v, value: v === 'number' ? 0 : v === 'boolean' ? false : '' } as any)}
                                                                size={'small'}
                                                                disabled={!draft.filterConfig}
                                                            />
                                                        </div>
                                                        <div className={'mlgis-filter-compare-row2'}>
                                                            {renderConditionValueInput(c as any)}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <Button
                                                    danger={true}
                                                    size={'small'}
                                                    onClick={() => deleteCondition(c.id)}
                                                    disabled={!draft.filterConfig}
                                                >
                                                    删除
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: 8 }}>
                                <Button size={'small'} onClick={() => { setFilterEnabled(true); addCondition('geometry'); }} disabled={false}>+ 几何类型</Button>
                                <Button size={'small'} onClick={() => { setFilterEnabled(true); addCondition('compare'); }} disabled={false}>+ 属性比较</Button>
                                <Button size={'small'} onClick={() => { setFilterEnabled(true); addCondition('exists'); }} disabled={false}>+ 属性存在</Button>
                                <Button size={'small'} onClick={() => { setFilterEnabled(true); addCondition('in'); }} disabled={false}>+ 属性包含</Button>
                            </div>
                        </div>
                    </div>

                    <div className={'mlgis-card'}>
                        <div className={'mlgis-card-title'}>样式</div>
                        <div className={'mlgis-card-desc'}>通过配置设置图层样式，支持常量/按缩放/按属性三类常用模式。</div>
                        <div className={'mlgis-grid'}>
                            <Input
                                value={styleSearch}
                                onChange={(e) => setStyleSearch(e.target.value)}
                                size={'small'}
                                placeholder={'搜索样式字段（支持中文名/字段 key）'}
                            />
                            {(() => {
                                const defs = layerFieldDefsByType[draft.type] ?? [];
                                const q = styleSearch.trim().toLowerCase();
                                const filtered = q ? defs.filter(d => d.label.toLowerCase().includes(q) || d.key.toLowerCase().includes(q)) : defs;
                                return filtered.map(renderStyleField);
                            })()}
                        </div>
                    </div>
                </div>
            ) : null}
        </Drawer>
    );
};

export default LayerEditorDrawer;
