/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {ForwardedRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import './TextScrollerComponent.less';
import {debounce} from "lodash";
import {ComponentBaseProps} from "@datavisool/sdk/types";

export interface TextScrollerComponentStyle {
    speed?: number;
    fontSize?: number;
    color?: string;
    fontFamily?: string;
    fontWeight?: number;
    backgroundImage?: string;
    backgroundClip?: string;
    WebkitBackgroundClip?: string;
    WebkitTextFillColor?: string;
}

export interface TextScrollerComponentProps extends ComponentBaseProps {
    style?: TextScrollerComponentStyle;
}

export interface TextScrollerComponentRef {
    updateConfig: (newConfig: TextScrollerComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
}

const TextScrollerComponent = React.forwardRef((props: TextScrollerComponentProps,
                                                ref: ForwardedRef<TextScrollerComponentRef>) => {
    const [config, setConfig] = useState<TextScrollerComponentProps>({...props});
    const {speed, ...rest} = config.style!;

    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const textScrollerRef = useRef<HTMLDivElement>(null);
    const textContainerRef = useRef<HTMLDivElement>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => setConfig({...newConfig}),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
    }));

    useEffect(() => {
        if (textContainerRef.current) {
            resizeObserverRef.current = new ResizeObserver(debounce((entries) => {
                for (const entry of entries) {
                    const {width} = entry.contentRect;
                    textContainerRef.current!.style.setProperty('--container-width', `${width}px`);
                }
            }, 100));
            // 开始观察
            resizeObserverRef.current!.observe(textContainerRef.current);
        }
    }, []);
    useEffect(() => {
        const v = (speed || 0) > 0 ? 1 / (speed || 0) : 0;
        textContainerRef.current?.style.setProperty("--speed", `${v}s`);
    }, [config]);


    return (
        <div className="text-scroller-container" ref={textContainerRef}>
            <div className="text-scroller" style={{...rest}} ref={textScrollerRef}>
                {config?.data?.value}
            </div>
        </div>
    );
});

export default TextScrollerComponent;