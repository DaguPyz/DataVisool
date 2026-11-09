/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {ForwardedRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import './DateTimeComponent.less';
import {ComponentInfoType} from "@datavisool/sdk/types";
import {IFilterConfigType} from "@datavisool/sdk/types";

export interface DateTimeComponentStyle {
    fontSize?: number;
    color?: string;
    fontFamily?: string;
    fontWeight?: number;
    alignItems?: string;
    justifyContent?: string;
    letterSpacing?: string;
    formatType?: FormatType;
}

export interface DateTimeComponentProps {
    base?: ComponentInfoType;
    style?: DateTimeComponentStyle;
    filter?: IFilterConfigType;
}

export interface DateTimeComponentRef {
    updateConfig: (newConfig: DateTimeComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    destroy: () => void;
    changeVisible: (visible: boolean) => void;
}

export enum FormatType {
    DASH = '0',// 2021-01-01 12:00:00
    SLASH = '1', // 2021/01/01 12:00:00
    CN = '2', // 2021年01月01日 12时00分00秒
}

function formatDateTime(format: string): string {
    const current = new Date();
    // 获取年、月、日
    const year = current.getFullYear();
    const month = (current.getMonth() + 1).toString().padStart(2, '0');
    const day = current.getDate().toString().padStart(2, '0');
    // 获取小时、分钟、秒
    const hours = current.getHours().toString().padStart(2, '0');
    const minutes = current.getMinutes().toString().padStart(2, '0');
    const seconds = current.getSeconds().toString().padStart(2, '0');

    switch (format) {
        case FormatType.SLASH:
            return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
        case FormatType.CN:
            return `${year}年${month}月${day}日 ${hours}时${minutes}分${seconds}秒`;
        default:
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
}

const DateTimeComponent = React.forwardRef((props: DateTimeComponentProps,
                                            ref: ForwardedRef<DateTimeComponentRef>) => {
    const [config, setConfig] = useState<DateTimeComponentProps>({...props});
    const {formatType = FormatType.CN, ...style} = config?.style ?? {};
    const [datetime, setDateTime] = useState<string>(formatDateTime(formatType));
    const [visible, setVisible] = useState(true);
    const timeRef = useRef<NodeJS.Timeout | null>(null);
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});


    useEffect(() => {
        setDateTime(formatDateTime(formatType));
        const timer = setInterval(() => setDateTime(formatDateTime(formatType)), 1000);
        timeRef.current = timer;
        return () => {
            clearInterval(timer);
            if (timeRef.current === timer) timeRef.current = null;
        };
    }, [formatType]);


    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => setConfig({...newConfig}),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        changeVisible: (visible) => setVisible(visible),
        destroy: () => {
            timeRef.current && clearInterval(timeRef.current);
            timeRef.current = null;
        }
    }));

    if (!visible)
        return null;
    return (
        <div className="date-time-component" style={{...style}}>
            {datetime}
        </div>
    );
});

export default DateTimeComponent;
