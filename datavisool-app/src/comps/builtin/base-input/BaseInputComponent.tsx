/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ChangeEvent, ForwardedRef, forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {ComponentBaseProps} from "@datavisool/sdk/types";
import './BaseInputComponent.less';

export interface BaseInputComponentStyle {
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    backgroundColor?: string;
    borderRadius?: number;
    borderWidth?: number;
    borderColor?: string;
    borderStyle?: string;
    backgroundColorHover?: string;
    borderRadiusHover?: number;
    borderWidthHover?: number;
    borderColorHover?: string;
}

export interface BaseInputComponentProps extends ComponentBaseProps {
    style?: BaseInputComponentStyle;
}

export interface BaseInputComponentRef {
    updateConfig: (newConfig: BaseInputComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
}

export const BaseInputComponent = forwardRef((props: BaseInputComponentProps, ref: ForwardedRef<BaseInputComponentRef>) => {
    const [config, setConfig] = useState<BaseInputComponentProps>({...props});
    const {style} = config;
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => {
            setConfig({...newConfig});
            setHoverStyle(newConfig?.style ?? {});
        },
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
    }));

    const setHoverStyle = (config: BaseInputComponentStyle) => {
        const {
            backgroundColorHover = 'rgba(253, 93, 147, 0.1)',
            borderColorHover = '#FD5D93',
            borderRadiusHover = 6,
            borderWidthHover = 1
        } = config ?? {};
        inputRef.current?.style.setProperty("--backgroundColorHover", backgroundColorHover);
        inputRef.current?.style.setProperty("--borderRadiusHover", `${borderRadiusHover}px`);
        inputRef.current?.style.setProperty("--borderWidthHover", `${borderWidthHover}px`);
        inputRef.current?.style.setProperty("--borderColorHover", borderColorHover);
    }

    const onClick = () => {
        if ('click' in eventHandlerMap.current)
            eventHandlerMap.current['click']();
    }

    const onChange = (e: ChangeEvent<HTMLInputElement>) => {
        if ('valueChange' in eventHandlerMap.current)
            eventHandlerMap.current['valueChange'](e.target.value);
    }

    useEffect(() => {
        setHoverStyle(style ?? {});
    }, []);


    return (
        <div className="base-input-component" onClick={onClick} ref={inputRef}>
            <input type={"text"} style={{...style}} onChange={onChange}/>
        </div>
    );
});

export default BaseInputComponent;