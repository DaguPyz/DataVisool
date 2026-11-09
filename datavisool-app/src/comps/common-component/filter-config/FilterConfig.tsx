/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './FilterConfig.less';
import {useCallback, useEffect, useId, useRef, useState} from "react";
import {ObjectUtil} from "@datavisool/sdk";
import {AbstractDesignerController} from "@datavisool/sdk/core";
import {IFilterConfigType} from "@datavisool/sdk/types";
import {Slider, Switch} from "@datavisool/ui";
import {Brightness, ColorFilter, Contrast, Filter, PreviewOpen} from "@icon-park/react";
import filterConfigVisual from './assets/filter-config-visual.webp';

const defaultConfig: Required<IFilterConfigType> = {
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
    },
];

export interface FilterConfigProps {
    controller?: AbstractDesignerController;
    config?: IFilterConfigType;
    onChange?: (config: IFilterConfigType) => void;
}

const normalizeConfig = (config?: IFilterConfigType): Required<IFilterConfigType> => ({
    ...defaultConfig,
    ...(config || {})
});

const buildFilterStyle = (config: Required<IFilterConfigType>) => {
    const {blur, brightness, contrast, opacity, saturate, hueRotate} = config;
    return {
        filter: `blur(${blur}px) brightness(${brightness}) contrast(${contrast}) opacity(${opacity}) saturate(${saturate}) hue-rotate(${hueRotate}deg)`
    };
};

export default function FilterConfig(props: FilterConfigProps) {
    const {controller, config: propConfig, onChange} = props;
    const filterId = useId();
    const getInitialConfig = useCallback(() => {
        if (controller)
            return normalizeConfig(controller.getConfig()?.filter as IFilterConfigType);
        return normalizeConfig(propConfig);
    }, [controller, propConfig]);

    const [config, setConfig] = useState<Required<IFilterConfigType>>(getInitialConfig);
    const configRef = useRef(config);
    const previewStyle = config.enable ? buildFilterStyle(config) : undefined;

    useEffect(() => {
        const nextConfig = getInitialConfig();
        configRef.current = nextConfig;
        setConfig(nextConfig);
    }, [getInitialConfig]);

    const updateConfig = <K extends keyof IFilterConfigType>(key: K, value: IFilterConfigType[K]) => {
        const nextConfig = ObjectUtil.merge({...configRef.current}, {[key]: value}) as Required<IFilterConfigType>;
        configRef.current = nextConfig;
        setConfig(nextConfig);

        if (controller) {
            controller.updateFilter(nextConfig);
        } else if (onChange) {
            onChange(nextConfig);
        }
    };

    return (
        <div className={'filter-config'}>
            <header className="filter-config-header">
                <div className="filter-config-title-row">
                    <h3>组件滤镜</h3>
                    <span className={`filter-config-state ${config.enable ? 'enabled' : ''}`} role="status">
                        {config.enable ? '已开启' : '未开启'}
                    </span>
                </div>
                <p>调整当前组件的模糊、明暗和色彩。</p>
            </header>

            <div className="filter-config-overview">
                <div className="filter-config-enable-row">
                    <div className="filter-config-enable-copy">
                        <label htmlFor={`${filterId}-enable`}>启用组件滤镜</label>
                        <p>实时应用到选中组件。</p>
                    </div>
                    <Switch
                        id={`${filterId}-enable`}
                        value={config.enable}
                        onChange={(checked) => updateConfig('enable', checked)}
                        className="filter-config-switch-field"
                        controlClassName="filter-config-switch"
                        switchSize="sm"
                    />
                </div>
                <figure className="filter-config-visual">
                    <div className="filter-config-preview-image">
                        <img src={filterConfigVisual} alt="" style={previewStyle}/>
                    </div>
                    <figcaption>效果预览</figcaption>
                </figure>
            </div>

            <section className="filter-config-parameters" aria-labelledby={`${filterId}-parameters`}>
                <h4 id={`${filterId}-parameters`}>滤镜参数</h4>
                <div className="filter-config-sliders">
                    {filterSliderItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <div className="filter-config-slider-item" key={item.key}>
                                <div className="filter-config-slider-label">
                                    <span className="filter-config-slider-icon" aria-hidden="true">
                                        <Icon theme="outline" size={18} fill="currentColor"/>
                                    </span>
                                    <span className="filter-config-slider-name">
                                        <span>{item.label}</span>
                                        <small>{item.desc}</small>
                                    </span>
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
                                    controlClassName="filter-config-slider"
                                    containerClassName="filter-config-slider-field"
                                />
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );

}
