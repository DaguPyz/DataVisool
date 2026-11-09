/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import layerListStore from "@/designer/left/layer-list/LayerListStore.ts";
import './SearchLayer.less';
import {useCallback, useEffect, useRef, useState} from "react";
import {ILayerItem} from "@datavisool/sdk/types";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import {Dialog, Input, Tag} from "@datavisool/ui";
import rightStore from "@/designer/right/RightStore.ts";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import {IdGenerate} from "@datavisool/sdk";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";
import {globalMessage} from "@datavisool/ui";
import {AddOne, Components, Layers, Search, Target} from "@icon-park/react";
import searchLayerVisual from "./assets/search-layer-visual.webp";
import {getEffectiveLayerState} from "@/designer/operate-provider/selection/SelectionPolicy.ts";

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

const excludedComponentKeys = new Set(["LoopContainer", "group"]);

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

const matchesSearchText = (keyword: string, values: Array<string | undefined>): boolean => {
    return values.some((value) => typeof value === "string" && value.toLowerCase().includes(keyword));
};

const getLayerResults = (keyword: string): SearchLayerResult[] => {
    const layerConfigs = window.DATAVISOOL_ENV?.currentManager?.layerManager?.layerConfigs ?? {};
    return Object.values(layerConfigs)
        .filter((layer): layer is ILayerItem => {
            return !!layer && typeof layer.id === "string" && layer.id.trim().length > 0 && typeof layer.type === "string" && layer.type.trim().length > 0;
        })
        .filter((layer) => matchesSearchText(keyword, [layer.name, layer.type, layer.id]))
        .map((layer) => {
            const state = getEffectiveLayerState(layer.id!, layerConfigs);
            return {
                id: layer.id!,
                name: layer.name?.trim() || "未命名图层",
                type: layer.type!,
                order: layer.order,
                hide: state.hidden,
                lock: state.locked,
            };
        })
        .sort((left, right) => {
            return left.name.localeCompare(right.name, "zh-Hans-CN") || left.type.localeCompare(right.type, "zh-Hans-CN");
        });
};

const getComponentResults = (keyword: string): SearchComponentResult[] => {
    return Object.values(DesignerLoader.definitionMap ?? {})
        .map((definition) => definition.getBaseInfo())
        .filter((baseInfo) => !excludedComponentKeys.has(baseInfo.compKey))
        .filter((baseInfo) => matchesSearchText(keyword, [
            baseInfo.compName,
            baseInfo.compKey,
            baseInfo.categorize,
            baseInfo.subCategorize,
            baseInfo.source,
        ]))
        .map((baseInfo) => ({
            compKey: baseInfo.compKey,
            compName: baseInfo.compName,
            source: baseInfo.source,
            categorize: baseInfo.categorize,
            subCategorize: baseInfo.subCategorize,
            width: baseInfo.width,
            height: baseInfo.height,
            chartImg: DesignerLoader.definitionMap[baseInfo.compKey]?.getChartImg?.() ?? null,
        }))
        .sort((left, right) => {
            return left.compName.localeCompare(right.compName, "zh-Hans-CN") || left.compKey.localeCompare(right.compKey, "zh-Hans-CN");
        });
};

const resolveCanvasCenter = (itemWidth: number, itemHeight: number): [number, number] => {
    const canvasConfig = window.DATAVISOOL_ENV?.currentManager?.canvasManager?.canvasConfig ?? {};
    const canvasWidth = Number(canvasConfig.width ?? 0);
    const canvasHeight = Number(canvasConfig.height ?? 0);
    if (canvasWidth <= 0 || canvasHeight <= 0)
        return [0, 0];
    const x = Math.max(0, Math.round((canvasWidth - itemWidth) / 2));
    const y = Math.max(0, Math.round((canvasHeight - itemHeight) / 2));
    return [x, y];
};

export const SearchLayer = observer(() => {
    const [keyword, setKeyword] = useState("");
    const [layerResults, setLayerResults] = useState<SearchLayerResult[]>([]);
    const [componentResults, setComponentResults] = useState<SearchComponentResult[]>([]);
    const {searchLayer} = layerListStore;
    const inputRef = useRef<HTMLDivElement>(null);
    const normalizedKeyword = normalizeSearchText(keyword);
    const hasKeyword = normalizedKeyword.length > 0;

    const onClose = useCallback(() => {
        layerListStore.setSearchLayer(false);
        setLayerResults([]);
        setComponentResults([]);
        setKeyword("");
        eventOperateStore.focusDesignerCanvas();
    }, []);

    useEffect(() => {
        if (!normalizedKeyword) {
            setLayerResults([]);
            setComponentResults([]);
            return;
        }
        setLayerResults(getLayerResults(normalizedKeyword));
        setComponentResults(getComponentResults(normalizedKeyword));
    }, [normalizedKeyword]);

    useEffect(() => {
        if (!searchLayer) {
            return;
        }
        let focusFrame = 0;
        const mountFrame = window.requestAnimationFrame(() => {
            focusFrame = window.requestAnimationFrame(() => {
                inputRef.current?.querySelector<HTMLInputElement>(".datavisool-input-native")?.focus();
            });
        });
        return () => {
            window.cancelAnimationFrame(mountFrame);
            window.cancelAnimationFrame(focusFrame);
        };
    }, [searchLayer]);

    const locateLayer = useCallback((item: SearchLayerResult) => {
        const layer = window.DATAVISOOL_ENV?.currentManager?.layerManager?.layerConfigs?.[item.id];
        if (!layer?.type) {
            globalMessage.messageApi?.warning("未找到对应图层");
            return;
        }
        onClose();
        window.setTimeout(() => {
            rightStore.activeConfig(item.id, layer.type!);
            eventOperateStore.setTargetIds([item.id], 'search');
            eventOperateStore.focusDesignerCanvas();
        }, 10);
    }, [onClose]);

    const addComponent = useCallback((item: SearchComponentResult) => {
        const definition = DesignerLoader.definitionMap[item.compKey];
        if (!definition) {
            globalMessage.messageApi?.error(`未找到组件定义：${item.compName}`);
            return;
        }

        const baseInfo = definition.getBaseInfo();
        const id = IdGenerate.generateId();
        const width = baseInfo.width ?? item.width ?? 320;
        const height = baseInfo.height ?? item.height ?? 200;
        const [x, y] = resolveCanvasCenter(width, height);
        const movableItem: ILayerItem = {
            id,
            name: baseInfo.compName,
            type: item.compKey,
            x,
            y,
            width,
            height,
            lock: false,
            hide: false,
        };

        eventOperateStore.setAddRecordCompId(id);
        historyRecordOperateProxy.doAdd(movableItem);
        onClose();
        window.setTimeout(() => {
            rightStore.activeConfig(id, item.compKey);
            eventOperateStore.setTargetIds([id]);
            eventOperateStore.focusDesignerCanvas();
        }, 10);
    }, [onClose]);

    const renderEmptyState = (label: string) => {
        return (
            <div className="search-layer-empty-state">
                {hasKeyword ? `未找到匹配的${label}` : `输入关键字后显示${label}结果`}
            </div>
        );
    };

    return (
        <Dialog
            title={null}
            className={"search-layer-dialog"}
            width={1040}
            centered={true}
            open={searchLayer}
            onClose={onClose}
            mask
            showClose
        >
            <div className={"search-layer-content"}>
                <div className={"search-layer-hero"}>
                    <img className={"search-layer-hero-visual"} src={searchLayerVisual} alt={"搜索图层组件视觉图"}/>
                    <div className={"search-layer-hero-copy"}>
                        <span className={"search-layer-title-icon"}>
                            <Search size={32}/>
                        </span>
                        <div className={"search-layer-title-wrap"}>
                            <div className={"search-layer-title"}>{"搜索图层 / 组件"}</div>
                            <div className={"search-layer-subtitle"}>{"快速定位已有图层，或把组件直接插入画布中心"}</div>
                        </div>
                    </div>
                    <div className={"search-layer-hero-stats"}>
                        <div className={"search-layer-stat"}>
                            <span>{"图层结果"}</span>
                            <strong>{layerResults.length}</strong>
                        </div>
                        <div className={"search-layer-stat"}>
                            <span>{"组件结果"}</span>
                            <strong>{componentResults.length}</strong>
                        </div>
                    </div>
                </div>

                <div className={"search-layer-input"} ref={inputRef}>
                    <Input
                        value={keyword}
                        placeholder={"请输入图层名、组件名或组件 Key"}
                        inputSize={"lg"}
                        allowClear
                        prefix={<Search size={18} fill={"currentColor"}/>}
                        suffix={<span className={"search-layer-input-tip"}>{"实时搜索"}</span>}
                        onChange={setKeyword}
                    />
                </div>
                <div className={"search-layer-grid"}>
                    <section className={"search-layer-panel"}>
                        <div className={"search-layer-panel-header"}>
                            <span className={"search-layer-panel-title"}>
                                <Layers size={18}/>
                                {"图层定位"}
                            </span>
                            <Tag color={"cyan"}>{layerResults.length}</Tag>
                        </div>
                        <div className={"search-layer-panel-desc"}>{"点击结果后会定位并选中目标图层"}</div>
                        <div className={"search-layer-list"}>
                            {layerResults.length > 0 ? layerResults.map((item) => (
                                <button
                                    key={item.id}
                                    type={"button"}
                                    className={"search-layer-item search-layer-layer-item"}
                                    onClick={() => locateLayer(item)}
                                    title={"点击后定位并选中该图层"}
                                >
                                    <span className={"search-layer-item-icon search-layer-item-icon-blue"}>
                                        <Target size={18}/>
                                    </span>
                                    <div className={"search-layer-item-main"}>
                                        <div className={"search-layer-item-title"}>{item.name}</div>
                                        <div className={"search-layer-item-meta"}>
                                            <Tag color={"cyan"}>{item.type}</Tag>
                                            {item.hide ? <Tag color={"orange"}>已隐藏</Tag> : null}
                                            {item.lock ? <Tag color={"red"}>已锁定</Tag> : null}
                                            <span className={"search-layer-item-sub"} title={item.id}>{item.id}</span>
                                        </div>
                                    </div>
                                </button>
                            )) : renderEmptyState("图层")}
                        </div>
                    </section>
                    <section className={"search-layer-panel"}>
                        <div className={"search-layer-panel-header"}>
                            <span className={"search-layer-panel-title"}>
                                <Components size={18}/>
                                {"组件插入"}
                            </span>
                            <Tag color={"purple"}>{componentResults.length}</Tag>
                        </div>
                        <div className={"search-layer-panel-desc"}>{"点击结果后会插入画布中心并选中组件"}</div>
                        <div className={"search-layer-list"}>
                            {componentResults.length > 0 ? componentResults.map((item) => {
                                const categoryText = [item.categorize, item.subCategorize].filter(Boolean).join(" / ");
                                return (
                                    <button
                                        key={item.compKey}
                                        type={"button"}
                                        className={"search-layer-item search-layer-component-item"}
                                        onClick={() => addComponent(item)}
                                        title={"点击后插入到画布并选中"}
                                    >
                                        <div className={"search-layer-component-body"}>
                                            <span className={"search-layer-item-icon search-layer-item-icon-purple"}>
                                                <AddOne size={18}/>
                                            </span>
                                            <div className={"search-layer-item-main"}>
                                                <div className={"search-layer-item-title"}>{item.compName}</div>
                                                <div className={"search-layer-item-meta"}>
                                                    <Tag color={"purple"}>{item.compKey}</Tag>
                                                    {item.source ? <Tag color={"cyan"}>{item.source}</Tag> : null}
                                                </div>
                                                {categoryText ? (
                                                    <div className={"search-layer-item-sub"} title={categoryText}>{categoryText}</div>
                                                ) : null}
                                            </div>
                                            <div className={`search-layer-item-preview ${item.chartImg ? "search-layer-item-preview-has-img" : "search-layer-item-preview-empty"}`}>
                                                {item.chartImg ? (
                                                    <img src={item.chartImg} alt={`${item.compName} 预览图`}/>
                                                ) : (
                                                    <span>暂无预览</span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            }) : renderEmptyState("组件")}
                        </div>
                    </section>
                </div>
            </div>
        </Dialog>
    );
});

export default SearchLayer;
