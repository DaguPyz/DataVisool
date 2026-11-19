/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useId} from 'react';
import type {IFilterConfigType} from '@datavisool/sdk/types';
import {Slider, Switch} from '@datavisool/ui';
import {Brightness, ColorFilter, Contrast, Filter, PreviewOpen} from '@icon-park/react';

const filterSliderItems = [
    {key: 'blur', label: '模糊', desc: 'Blur', min: 0, max: 100, step: 0.01, icon: Filter, valueFormatter: (value: number) => `${value.toFixed(2)}px`},
    {key: 'brightness', label: '亮度', desc: 'Brightness', min: 0, max: 2, step: 0.01, icon: Brightness, valueFormatter: (value: number) => `${Math.round(value * 100)}%`},
    {key: 'contrast', label: '对比度', desc: 'Contrast', min: 0, max: 2, step: 0.01, icon: Contrast, valueFormatter: (value: number) => `${Math.round(value * 100)}%`},
    {key: 'opacity', label: '透明度', desc: 'Opacity', min: 0, max: 1, step: 0.01, icon: PreviewOpen, valueFormatter: (value: number) => `${Math.round(value * 100)}%`},
    {key: 'saturate', label: '饱和度', desc: 'Saturate', min: 0, max: 2, step: 0.01, icon: ColorFilter, valueFormatter: (value: number) => `${Math.round(value * 100)}%`},
    {key: 'hueRotate', label: '色调', desc: 'Hue', min: 0, max: 360, step: 1, icon: ColorFilter, valueFormatter: (value: number) => `${Math.round(value)}°`},
] as const;

export interface FilterControlsProps {
    variant: 'component' | 'global';
    config: Required<IFilterConfigType>;
    previewImage: string;
    onChange(config: IFilterConfigType): void;
    title?: string;
    description?: string;
    enableLabel?: string;
    enableDescription?: string;
    previewCaption?: string;
    parametersTitle?: string;
}

const buildFilterStyle = (config: Required<IFilterConfigType>) => ({
    filter: `blur(${config.blur}px) brightness(${config.brightness}) contrast(${config.contrast}) opacity(${config.opacity}) saturate(${config.saturate}) hue-rotate(${config.hueRotate}deg)`,
});

export default function FilterControls(props: FilterControlsProps) {
    const {variant, config, previewImage, onChange} = props;
    const global = variant === 'global';
    const id = useId();
    const previewStyle = config.enable ? buildFilterStyle(config) : undefined;
    const update = <K extends keyof IFilterConfigType>(key: K, value: IFilterConfigType[K]) => onChange({...config, [key]: value});

    return (
        <>
            {!global && (
                <header className="filter-config-header">
                    <div className="filter-config-title-row">
                        <h3>{props.title ?? '组件滤镜'}</h3>
                        <span className={`filter-config-state ${config.enable ? 'enabled' : ''}`} role="status">
                            {config.enable ? '已开启' : '未开启'}
                        </span>
                    </div>
                    <p>{props.description ?? '调整当前组件的模糊、明暗和色彩。'}</p>
                </header>
            )}
            <div className={global ? 'global-filter-overview' : 'filter-config-overview'}>
                <div className={global ? 'global-filter-enable-row' : 'filter-config-enable-row'}>
                    <div className={global ? 'global-filter-enable-copy' : 'filter-config-enable-copy'}>
                        <label htmlFor={`${id}-enable`}>{props.enableLabel ?? (global ? '启用全局滤镜' : '启用组件滤镜')}</label>
                        <p>{props.enableDescription ?? (global ? '开启后，参数会实时作用于当前画布。' : '实时应用到选中组件。')}</p>
                    </div>
                    <Switch
                        id={`${id}-enable`}
                        value={config.enable}
                        onChange={checked => update('enable', checked)}
                        className={global ? 'global-filter-switch-field' : 'filter-config-switch-field'}
                        controlClassName={global ? 'global-filter-switch' : 'filter-config-switch'}
                        switchSize="sm"
                    />
                </div>
                <figure className={global ? 'global-filter-visual' : 'filter-config-visual'}>
                    {global ? <img src={previewImage} alt="" style={previewStyle}/> : (
                        <div className="filter-config-preview-image"><img src={previewImage} alt="" style={previewStyle}/></div>
                    )}
                    <figcaption>{props.previewCaption ?? '效果预览'}</figcaption>
                </figure>
            </div>
            <section className={global ? 'global-filter-parameters' : 'filter-config-parameters'} aria-labelledby={`${id}-parameters`}>
                {global ? <h3 id={`${id}-parameters`}>{props.parametersTitle ?? '滤镜参数'}</h3> : <h4 id={`${id}-parameters`}>{props.parametersTitle ?? '滤镜参数'}</h4>}
                <div className={global ? 'global-filter-sliders' : 'filter-config-sliders'}>
                    {filterSliderItems.map(item => {
                        const Icon = item.icon;
                        return (
                            <div className={global ? 'global-filter-slider-item' : 'filter-config-slider-item'} key={item.key}>
                                <div className={global ? 'global-filter-slider-label' : 'filter-config-slider-label'}>
                                    <span className={global ? 'global-filter-slider-icon' : 'filter-config-slider-icon'} aria-hidden="true">
                                        <Icon theme="outline" size={global ? 20 : 18} fill="currentColor"/>
                                    </span>
                                    {global ? <span>{item.label}</span> : (
                                        <span className="filter-config-slider-name"><span>{item.label}</span><small>{item.desc}</small></span>
                                    )}
                                    {global && <small>{item.desc}</small>}
                                </div>
                                <Slider
                                    name={item.label}
                                    value={config[item.key]}
                                    min={item.min}
                                    max={item.max}
                                    step={item.step}
                                    showValue
                                    valueFormatter={item.valueFormatter}
                                    onChange={value => update(item.key, value)}
                                    controlClassName={global ? 'global-filter-slider' : 'filter-config-slider'}
                                    containerClassName={global ? undefined : 'filter-config-slider-field'}
                                />
                            </div>
                        );
                    })}
                </div>
            </section>
        </>
    );
}
