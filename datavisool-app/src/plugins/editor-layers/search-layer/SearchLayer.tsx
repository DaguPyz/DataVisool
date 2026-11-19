/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {LayerCanvas} from '../LayerConsumer.ts';

import './SearchLayer.less';
import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type {EditorLayerDomain, EditorLayerNode} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorLayersState} from '../EditorLayersState.ts';
import {Dialog, Input, Tag} from '@datavisool/ui';
import {IdGenerate} from '@datavisool/sdk';
import {globalMessage} from '@datavisool/ui';
import {AddOne, Components, Layers, Search, Target} from '@icon-park/react';
import searchLayerVisual from './assets/search-layer-visual.webp';

interface SearchLayerResult {
    id: string;
    name: string;
    type: string;
    order?: number;
    hide: boolean;
    lock: boolean;
}

interface SearchComponentResult {
    compKey: string;
    compName: string;
    source?: string;
    categorize?: string;
    subCategorize?: string;
    width?: number;
    height?: number;
    chartImg?: string | null;
}

const excludedComponentKeys = new Set(['LoopContainer', 'group']);
const normalizeSearchText = (value: string) => value.trim().toLowerCase();
const matchesSearchText = (keyword: string, values: Array<string | undefined>) =>
    values.some(value => typeof value === 'string' && value.toLowerCase().includes(keyword));

const flattenTree = (layers: readonly EditorLayerNode[]): EditorLayerNode[] => {
    const result: EditorLayerNode[] = [];
    const visit = (items: readonly EditorLayerNode[]) => items.forEach(layer => {
        result.push(layer);
        if (layer.children) visit(layer.children);
    });
    visit(layers);
    return result;
};

const getLayerResults = (keyword: string, domain: EditorLayerDomain): SearchLayerResult[] => flattenTree(domain.readTree())
    .filter(layer => typeof layer.id === 'string' && Boolean(layer.id.trim()) && typeof layer.type === 'string' && Boolean(layer.type.trim()))
    .filter(layer => matchesSearchText(keyword, [layer.name, layer.type, layer.id]))
    .map(layer => ({
        id: layer.id!,
        name: layer.name?.trim() || '未命名图层',
        type: layer.type!,
        order: layer.order,
        hide: layer.effectiveHidden,
        lock: layer.effectiveLocked,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN') || left.type.localeCompare(right.type, 'zh-Hans-CN'));

const getComponentResults = (keyword: string, catalog: DesignerCatalog): SearchComponentResult[] => catalog.listComponents()
    .filter(component => !excludedComponentKeys.has(component.key))
    .filter(component => matchesSearchText(keyword, [
        component.baseInfo.compName,
        component.key,
        component.baseInfo.categorize,
        component.baseInfo.subCategorize,
        component.baseInfo.source,
    ]))
    .map(component => ({
        compKey: component.key,
        compName: component.baseInfo.compName,
        source: component.baseInfo.source,
        categorize: component.baseInfo.categorize,
        subCategorize: component.baseInfo.subCategorize,
        width: component.baseInfo.width,
        height: component.baseInfo.height,
        chartImg: component.chartImage,
    }))
    .sort((left, right) => left.compName.localeCompare(right.compName, 'zh-Hans-CN') || left.compKey.localeCompare(right.compKey, 'zh-Hans-CN'));

export const SearchLayer = ({
    canvas,
    state,
    catalog,
    prepareLayerDomain,
}: {
    canvas: LayerCanvas;
    state: EditorLayersState;
    catalog: DesignerCatalog;
    prepareLayerDomain(signal?: AbortSignal): Promise<EditorLayerDomain>;
}) => {
    const stateVersion = useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot);
    const [domain, setDomain] = useState<EditorLayerDomain | null>(null);
    const inputRef = useRef<HTMLDivElement>(null);
    const keyword = state.searchKeyword;
    const isOpen = state.searchOpen;
    const sceneEpoch = state.readSceneEpoch();
    const normalizedKeyword = normalizeSearchText(keyword);
    const hasKeyword = normalizedKeyword.length > 0;
    const activeDomain = domain?.isActive() && domain.sceneVersion === state.readSceneVersion() ? domain : null;

    useEffect(() => {
        if (!isOpen) {
            setDomain(null);
            return;
        }
        const consumer = new AbortController();
        let current = true;
        void prepareLayerDomain(consumer.signal).then(nextDomain => {
            if (!current || consumer.signal.aborted || !nextDomain.isActive()) return;
            state.setScene(nextDomain.sceneVersion);
            setDomain(nextDomain);
        }).catch(error => {
            if (!consumer.signal.aborted && (error as Error)?.name !== 'AbortError')
                console.error('准备图层搜索失败', error);
        });
        return () => {
            current = false;
            consumer.abort();
        };
    }, [isOpen, prepareLayerDomain, sceneEpoch, state]);

    useEffect(() => {
        if (!isOpen || !activeDomain) return;
        state.scheduleSearchFrame(() => {
            state.scheduleSearchFrame(() => {
                inputRef.current?.querySelector<HTMLInputElement>('.datavisool-input-native')?.focus();
            });
        });
        return () => {
            state.cancelSearchFrames();
        };
    }, [activeDomain, isOpen, state]);

    const layerResults = useMemo(() => {
        if (!normalizedKeyword || !activeDomain) return [];
        return getLayerResults(normalizedKeyword, activeDomain);
    }, [activeDomain, normalizedKeyword, stateVersion]);
    const componentResults = useMemo(() => {
        if (!normalizedKeyword) return [];
        return getComponentResults(normalizedKeyword, catalog);
    }, [catalog, normalizedKeyword]);

    const onClose = useCallback(() => {
        state.setSearchOpen(false);
        state.setSearchKeyword('');
        canvas.focus();
    }, [canvas, state]);

    const selectResult = useCallback((id: string, source: 'search' | 'system') => {
        const sceneVersion = activeDomain?.sceneVersion;
        onClose();
        if (sceneVersion === undefined || !activeDomain) return;
        state.scheduleTimeout(() => {
            if (!canvas.isSceneActive(sceneVersion) || state.readSceneVersion() !== sceneVersion) return;
            canvas.select([id], source, {kind: 'inspect', id});
            canvas.focus();
        }, 10);
    }, [activeDomain, canvas, onClose, state]);

    const locateLayer = useCallback((item: SearchLayerResult) => {
        if (!activeDomain?.readLayer(item.id)?.type) {
            globalMessage.messageApi?.warning('未找到对应图层');
            return;
        }
        selectResult(item.id, 'search');
    }, [activeDomain, selectResult]);

    const addComponent = useCallback((item: SearchComponentResult) => {
        if (!activeDomain?.isActive()) return;
        const component = catalog.getComponent(item.compKey);
        if (!component) {
            globalMessage.messageApi?.error(`未找到组件定义：${item.compName}`);
            return;
        }
        const baseInfo = component.baseInfo;
        const id = IdGenerate.generateId();
        const width = baseInfo.width ?? item.width ?? 320;
        const height = baseInfo.height ?? item.height ?? 200;
        const size = activeDomain.readCanvasSize();
        const x = size ? Math.max(0, Math.round((size.width - width) / 2)) : 0;
        const y = size ? Math.max(0, Math.round((size.height - height) / 2)) : 0;
        canvas.insertLayer({
            id,
            name: baseInfo.compName,
            type: item.compKey,
            x,
            y,
            width,
            height,
            lock: false,
            hide: false,
        }, catalog.createInitialConfig(item.compKey));
        state.refresh();
        selectResult(id, 'system');
    }, [activeDomain, canvas, catalog, selectResult, state]);

    const renderEmptyState = (label: string) => <div className="search-layer-empty-state">{hasKeyword ? `未找到匹配的${label}` : `输入关键字后显示${label}结果`}</div>;

    return (
        <Dialog title={null} className="search-layer-dialog" width={1040} centered open={isOpen} onClose={onClose} mask showClose>
            <div className="search-layer-content" onMouseDownCapture={state.blockInteractionIfPaused}
                 onClickCapture={state.blockInteractionIfPaused} onKeyDownCapture={state.blockInteractionIfPaused}>
                <div className="search-layer-hero">
                    <img className="search-layer-hero-visual" src={searchLayerVisual} alt="搜索图层与组件"/>
                    <div className="search-layer-hero-copy">
                        <span className="search-layer-title-icon"><Search size={32}/></span>
                        <div className="search-layer-title-wrap">
                            <div className="search-layer-title">搜索图层 / 组件</div>
                            <div className="search-layer-subtitle">快速定位已有图层，或把组件直接插入画布中心</div>
                        </div>
                    </div>
                    <div className="search-layer-hero-stats">
                        <div className="search-layer-stat"><span>图层结果</span><strong>{layerResults.length}</strong></div>
                        <div className="search-layer-stat"><span>组件结果</span><strong>{componentResults.length}</strong></div>
                    </div>
                </div>
                <div className="search-layer-input" ref={inputRef}>
                    <Input value={keyword} placeholder="请输入图层名、组件名或组件 Key" inputSize="lg" allowClear
                           prefix={<Search size={18} fill="currentColor"/>} suffix={<span className="search-layer-input-tip">实时搜索</span>} onChange={state.setSearchKeyword}/>
                </div>
                <div className="search-layer-grid">
                    <section className="search-layer-panel">
                        <div className="search-layer-panel-header"><span className="search-layer-panel-title"><Layers size={18}/>图层定位</span><Tag color="cyan">{layerResults.length}</Tag></div>
                        <div className="search-layer-panel-desc">点击结果后会定位并选中目标图层</div>
                        <div className="search-layer-list">
                            {layerResults.length > 0 ? layerResults.map(item => (
                                <button key={item.id} type="button" className="search-layer-item search-layer-layer-item" onClick={() => locateLayer(item)} title="点击后定位并选中该图层">
                                    <span className="search-layer-item-icon search-layer-item-icon-blue"><Target size={18}/></span>
                                    <div className="search-layer-item-main">
                                        <div className="search-layer-item-title">{item.name}</div>
                                        <div className="search-layer-item-meta">
                                            <Tag color="cyan">{item.type}</Tag>
                                            {item.hide ? <Tag color="orange">已隐藏</Tag> : null}
                                            {item.lock ? <Tag color="red">已锁定</Tag> : null}
                                            <span className="search-layer-item-sub" title={item.id}>{item.id}</span>
                                        </div>
                                    </div>
                                </button>
                            )) : renderEmptyState('图层')}
                        </div>
                    </section>
                    <section className="search-layer-panel">
                        <div className="search-layer-panel-header"><span className="search-layer-panel-title"><Components size={18}/>组件插入</span><Tag color="purple">{componentResults.length}</Tag></div>
                        <div className="search-layer-panel-desc">点击结果后会插入画布中心并选中组件</div>
                        <div className="search-layer-list">
                            {componentResults.length > 0 ? componentResults.map(item => {
                                const categoryText = [item.categorize, item.subCategorize].filter(Boolean).join(' / ');
                                return (
                                    <button key={item.compKey} type="button" className="search-layer-item search-layer-component-item" onClick={() => addComponent(item)} title="点击后插入到画布并选中">
                                        <div className="search-layer-component-body">
                                            <span className="search-layer-item-icon search-layer-item-icon-purple"><AddOne size={18}/></span>
                                            <div className="search-layer-item-main">
                                                <div className="search-layer-item-title">{item.compName}</div>
                                                <div className="search-layer-item-meta"><Tag color="purple">{item.compKey}</Tag>{item.source ? <Tag color="cyan">{item.source}</Tag> : null}</div>
                                                {categoryText ? <div className="search-layer-item-sub" title={categoryText}>{categoryText}</div> : null}
                                            </div>
                                            <div className={`search-layer-item-preview ${item.chartImg ? 'search-layer-item-preview-has-img' : 'search-layer-item-preview-empty'}`}>
                                                {item.chartImg ? <img src={item.chartImg} alt={`${item.compName} 预览图`}/> : <span>暂无预览</span>}
                                            </div>
                                        </div>
                                    </button>
                                );
                            }) : renderEmptyState('组件')}
                        </div>
                    </section>
                </div>
            </div>
        </Dialog>
    );

};

export default SearchLayer;
