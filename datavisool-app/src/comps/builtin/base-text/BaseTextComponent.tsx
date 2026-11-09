/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ChangeEvent, Component, ForwardedRef, forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import './BaseTextComponent.less';
import {ComponentBaseProps} from "@datavisool/sdk/types";
import {DesignerMode} from "@datavisool/sdk/types";
import {ObjectUtil} from "@datavisool/sdk";

export interface BaseTextComponentStyle {
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    alignItems?: string;
    justifyContent?: string;
    strokeWidth?: number;
    strokeColor?: string;
    letterSpacing?: number;
    lineHeight?: number;
    textAlign?: string;
    backgroundImage?: string;
    backgroundClip?: string;
    WebkitBackgroundClip?: string;
    WebkitTextFillColor?: string;
    cursor?: string;
}

export interface BaseTextComponentProps extends ComponentBaseProps {
    style?: BaseTextComponentStyle;
}

export interface BaseTextComponentRef {
    updateConfig: (newConfig: BaseTextComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
}

export const BaseTextComponent = forwardRef((props: BaseTextComponentProps, ref: ForwardedRef<BaseTextComponentRef>) => {
    const [config, setConfig] = useState<BaseTextComponentProps>({...props});
    const {style, data} = config;
    const [edit, setEdit] = useState(false);
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const textRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => {
            setConfig({...newConfig});
            newConfig?.style && setStyle(newConfig.style);
        },
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
    }));

    const onClick = () => {
        if ('click' in eventHandlerMap.current)
            eventHandlerMap.current['click']();
    }

    const setStyle = (config: BaseTextComponentStyle) => {
        Object.keys({...config}).forEach((key) => {
            textRef.current?.style?.setProperty(`--${key}`, style![key as keyof BaseTextComponentStyle] as string)
        })
    }

    /**
     * 只在编辑模式下有效
     * @param e
     */
    const changeContent = (e: ChangeEvent<HTMLInputElement>) => {
        if (data)
            data['value'] = e.target.value;
        if (data?.staticData) {
            if (typeof (data?.staticData as any) === 'string')
                data.staticData = {value: e.target.value};
            else
                data.staticData = ObjectUtil.merge(data.staticData, {value: e.target.value})
        }
        if (!config?.base?.id || !window.DATAVISOOL_ENV.currentManager.layerManager?.layerConfigs)
            return;
        window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs[config.base.id].name = e.target.value;
        if (!window.DATAVISOOL_ENV.layerInstances)
            return;
        const layerInstance = window.DATAVISOOL_ENV.layerInstances[config.base?.id];
        layerInstance && (layerInstance as Component).setState({name: e.target.value});
    }

    const getContent = () => {
        if (typeof data?.value === "string")
            return data.value;
        console.warn(`组件【${config.base?.name}】数据格式错误`)
        return data?.value?.toString()
    }

    useEffect(() => {
        style && setStyle(style);
    }, []);

    return (
        <div onDoubleClick={() => window.DATAVISOOL_ENV.mode === DesignerMode.EDIT && setEdit(true)}
             ref={textRef}
             className={'base-text-component'}
             onKeyDown={(e) => e.stopPropagation()}
             onClick={onClick}>
            {edit ? <input
                ref={(ref) => ref?.select()}
                onChange={changeContent}
                onBlur={() => setEdit(false)}
                autoFocus={true}
                type={'text'}
                defaultValue={getContent()}/> : getContent()}
        </div>
    );
});

export default BaseTextComponent;