/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from 'mobx-react';
import './GlobalFilterConfigImpl.less';
import designerHeaderStore from "@/designer/header/DesignerHeaderStore";
import {IFilterConfigType} from "@datavisool/sdk/types";
import {Button, Dialog, Slider, Switch} from "@datavisool/ui";
import {Brightness, Check, ColorFilter, Contrast, Filter, PreviewOpen} from "@icon-park/react";
import globalFilterVisual from './assets/global-filter-visual.webp';

const defaultGlobalFilterConfig: Required<IFilterConfigType> = {
    enable: false,
    blur: 0,
    brightness: 1,
    contrast: 1,
    opacity: 1,
    saturate: 1,
    hueRotate: 0
};

type FilterNumberKey = 'blur' | 'brightness' | 'contrast' | 'opacity' | 'saturate' | 'hueRotate';

const filterSliderItems: {
    key: FilterNumberKey;
    label: string;
    desc: string;
    min: number;
    max: number;
    step: number;
    icon: typeof Filter;
    valueFormatter: (value: number) => string;
}[] = [
    {
        key: 'blur',
        label: '模糊',
        desc: 'Blur',
        min: 0,
        max: 100,
        step: 0.01,
        icon: Filter,
        valueFormatter: (value) => `${value.toFixed(2)}px`
    },
    {
        key: 'brightness',
        label: '亮度',
        desc: 'Brightness',
        min: 0,
        max: 2,
        step: 0.01,
        icon: Brightness,
        valueFormatter: (value) => `${Math.round(value * 100)}%`
    },
    {
        key: 'contrast',
        label: '对比度',
        desc: 'Contrast',
        min: 0,
        max: 2,
        step: 0.01,
        icon: Contrast,
        valueFormatter: (value) => `${Math.round(value * 100)}%`
    },
    {
        key: 'opacity',
        label: '透明度',
        desc: 'Opacity',
        min: 0,
        max: 1,
        step: 0.01,
        icon: PreviewOpen,
        valueFormatter: (value) => `${Math.round(value * 100)}%`
    },
    {
        key: 'saturate',
        label: '饱和度',
        desc: 'Saturate',
        min: 0,
        max: 2,
        step: 0.01,
        icon: ColorFilter,
        valueFormatter: (value) => `${Math.round(value * 100)}%`
    },
    {
        key: 'hueRotate',
        label: '色调',
        desc: 'Hue',
        min: 0,
        max: 360,
        step: 1,
        icon: ColorFilter,
        valueFormatter: (value) => `${Math.round(value)}°`
    }
];

const buildFilterStyle = (config: Required<IFilterConfigType>) => {
    const {blur, brightness, contrast, opacity, saturate, hueRotate} = config;
    return {
        filter: `blur(${blur}px) brightness(${brightness}) contrast(${contrast}) opacity(${opacity}) saturate(${saturate}) hue-rotate(${hueRotate}deg)`
    };
};

const GlobalFilterConfigImpl = observer(() => {
    const {globalFilterManger} = window.DATAVISOOL_ENV.currentManager;
    const {currentKey} = designerHeaderStore;
    const isOpen = currentKey === 'global-filter';
    const config = {...defaultGlobalFilterConfig, ...globalFilterManger!.config};
    const previewStyle = config.enable ? buildFilterStyle(config) : undefined;

    const onClose = () => {
        designerHeaderStore.setCurrentKey('');
    };

    const updateConfig = <K extends keyof IFilterConfigType>(key: K, value: IFilterConfigType[K]) => {
        globalFilterManger!.updateConfig({[key]: value} as Partial<IFilterConfigType>);
    };

    return (
        <Dialog
            className="datavisool-global-filter-dialog"
            bodyClassName="datavisool-global-filter-body"
            width="min(760px, calc(100vw - 32px))"
            open={isOpen}
            onClose={onClose}
            mask
            centered
            hideHeader
            showClose
        >
            <div className="datavisool-global-filter-config">
                <header className="global-filter-header">
                    <div className="global-filter-heading">
                        <div className="global-filter-title-row">
                            <h2>全局滤镜</h2>
                            <span className={`global-filter-state ${config.enable ? 'enabled' : ''}`} role="status">
                                {config.enable ? '已开启' : '未开启'}
                            </span>
                        </div>
                        <p>统一调整画布的模糊、亮度、对比度与色彩。</p>
                    </div>
                </header>

                <div className="global-filter-panel">
                    <div className="global-filter-overview">
                        <div className="global-filter-enable-row">
                            <div className="global-filter-enable-copy">
                                <label htmlFor="global-filter-enable">启用全局滤镜</label>
                                <p>开启后，参数会实时作用于当前画布。</p>
                            </div>
                            <Switch
                                id="global-filter-enable"
                                value={config.enable}
                                onChange={(checked) => updateConfig('enable', checked)}
                                className="global-filter-switch-field"
                                controlClassName="global-filter-switch"
                                switchSize="sm"
                            />
                        </div>
                        <figure className="global-filter-visual">
                            <img src={globalFilterVisual} alt="" style={previewStyle}/>
                            <figcaption>效果预览</figcaption>
                        </figure>
                    </div>

                    <section className="global-filter-parameters" aria-labelledby="global-filter-parameters-title">
                        <h3 id="global-filter-parameters-title">滤镜参数</h3>
                        <div className="global-filter-sliders">
                            {filterSliderItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div className="global-filter-slider-item" key={item.key}>
                                        <div className="global-filter-slider-label">
                                            <span className="global-filter-slider-icon" aria-hidden="true">
                                                <Icon theme="outline" size={20} strokeWidth={1.5} fill="currentColor"/>
                                            </span>
                                            <span>{item.label}</span>
                                            <small>{item.desc}</small>
                                        </div>
                                        <Slider
                                            name={item.label}
                                            value={config[item.key]}
                                            min={item.min}
                                            max={item.max}
                                            step={item.step}
                                            showValue
                                            valueFormatter={item.valueFormatter}
                                            onChange={(value) => updateConfig(item.key, value)}
                                            controlClassName="global-filter-slider"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>

                <footer className="global-filter-footer">
                    <Button type="primary" onClick={onClose} className="btn-confirm" icon={<Check theme="outline" size={16} strokeWidth={1.75} fill="currentColor"/>}>
                        完成
                    </Button>
                </footer>
            </div>
        </Dialog>
    );
});

export default GlobalFilterConfigImpl;
