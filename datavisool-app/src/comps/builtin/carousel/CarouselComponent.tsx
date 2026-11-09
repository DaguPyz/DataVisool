/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {ForwardedRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {ComponentBaseProps} from "@datavisool/sdk/types";
import './CarouselComponent.less';
import defaultData from './carousel.webp';

export interface CarouselComponentStyle {
    //自动播放
    autoplay?: boolean;
    //自动播放速度
    autoplaySpeed?: number;
    //显示按钮
    dots?: boolean;
    //渐变切换
    fade?: boolean;
    //切换动效时间
    speed?: number;
}

export interface CarouselComponentProps extends ComponentBaseProps {
    style?: CarouselComponentStyle;
}

export interface CarouselComponentRef {
    updateConfig: (newConfig: CarouselComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    changeVisible: (visible: boolean) => void;
}

const normalizeCarouselData = (value: unknown): string[] => {
    if (!Array.isArray(value))
        return [defaultData, defaultData];
    const imageList = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return imageList.length > 0 ? imageList : [defaultData, defaultData];
};

const CarouselComponent = React.forwardRef((props: CarouselComponentProps,
                                            ref: ForwardedRef<CarouselComponentRef>) => {
    const [config, setConfig] = useState<CarouselComponentProps>({...props});
    const [visible, setVisible] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);

    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => setConfig({...newConfig}),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        changeVisible: (visible) => setVisible(visible)
    }));

    const onClick = () => {
        if ('click' in eventHandlerMap.current) {
            eventHandlerMap.current['click']();
        }
    }

    const data = normalizeCarouselData(config?.data?.value);
    const carouselStyle = config.style ?? {};
    const autoplaySpeed = carouselStyle.autoplaySpeed ?? 3000;
    const transitionMs = carouselStyle.speed ?? 500;
    const safeActiveIndex = data.length > 0 ? activeIndex % data.length : 0;

    useEffect(() => {
        if (!carouselStyle.autoplay || data.length <= 1)
            return;
        const timer = window.setInterval(() => {
            setActiveIndex((index) => (index + 1) % data.length);
        }, autoplaySpeed);
        return () => window.clearInterval(timer);
    }, [autoplaySpeed, carouselStyle.autoplay, data.length]);

    if (!visible)
        return null;

    return (
        <div style={{width: '100%', height: '100%', overflow: 'hidden'}} onClick={onClick} className={'datavisool-carousel'}>
            <div
                className="datavisool-carousel-track"
                style={{
                    display: 'flex',
                    width: `${data.length * 100}%`,
                    height: '100%',
                    transform: carouselStyle.fade ? undefined : `translateX(-${safeActiveIndex * (100 / data.length)}%)`,
                    transition: `transform ${transitionMs}ms ease`,
                    position: 'relative',
                }}
            >
                {data.map((src: string, index: number) => (
                    <div
                        key={index}
                        style={{
                            flex: `0 0 ${100 / data.length}%`,
                            height: '100%',
                            opacity: carouselStyle.fade ? (safeActiveIndex === index ? 1 : 0) : 1,
                            position: carouselStyle.fade ? 'absolute' : 'relative',
                            inset: carouselStyle.fade ? 0 : undefined,
                            transition: `opacity ${transitionMs}ms ease`,
                        }}
                    >
                        <img alt={'轮播图' + index} src={src}/>
                    </div>
                ))}
            </div>
            {carouselStyle.dots !== false && data.length > 1 ? (
                <div className="datavisool-carousel-dots">
                    {data.map((_: string, index: number) => (
                        <button
                            key={index}
                            type="button"
                            className={safeActiveIndex === index ? 'active' : ''}
                            aria-label={`切换到第 ${index + 1} 张`}
                            onClick={(event) => {
                                event.stopPropagation();
                                setActiveIndex(index);
                            }}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
});

export default CarouselComponent;
