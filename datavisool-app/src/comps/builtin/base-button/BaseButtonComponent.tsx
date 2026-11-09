/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ForwardedRef, forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {ComponentBaseProps} from "@datavisool/sdk/types";
import './BaseButtonComponent.less';

interface BaseButtonComponentStyle {
    content: string;
    color: string;
    fontSize: number;
    fontWeight: number;
    fontFamily: string;
    letterSpacing: number;
    backgroundColor: string;
    borderRadius: number;
    borderWidth: number;
    borderColor: string;
    borderStyle: string;
    speed: number;
    scannerColor: string;
    hoverShadow: string;
    hoverBackgroundColor: string;
}

export interface BaseButtonComponentProps extends ComponentBaseProps {
    style?: BaseButtonComponentStyle;
}

export interface BaseButtonComponentRef {
    updateConfig: (newConfig: BaseButtonComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
}

export const BaseButtonComponent = forwardRef((props: BaseButtonComponentProps, ref: ForwardedRef<BaseButtonComponentRef>) => {
    const [config, setConfig] = useState<BaseButtonComponentProps>({...props});
    const {style} = config;
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const btnRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => {
            setConfig({...newConfig});
            newConfig?.style && setStyle(newConfig.style);
        },
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
    }));

    const setStyle = (config: BaseButtonComponentStyle) => {
        Object.keys({...config}).forEach((key) => {
            if (key !== 'content')
                btnRef.current?.style?.setProperty(`--${key}`, style![key as keyof BaseButtonComponentStyle] as string)
        })
    }

    const onClick = () => {
        if ('click' in eventHandlerMap.current)
            eventHandlerMap.current['click']();
    }

    useEffect(() => {
        style && setStyle(style);
    }, []);

    return (
        <div className="base-button-component" onClick={onClick} ref={btnRef}>
            <button>{style?.content}</button>
        </div>
    );
});

export default BaseButtonComponent;