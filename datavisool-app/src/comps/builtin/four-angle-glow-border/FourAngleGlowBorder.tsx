/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './FourAngleGloeBorder.less';
import {ForwardedRef, forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
import {FourAngleGlowProps} from "./FourAngleGlowBorderController";

export interface FourAngleGlowBorderStyle {
    width?: number;
    length?: number;
    color?: string;
    radius?: number;
}

export interface FourAngleGlowBorderRef {
    updateConfig: (config: FourAngleGlowBorderStyle) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
}

const FourAngleGlowBorder = forwardRef((props: FourAngleGlowProps, ref: ForwardedRef<FourAngleGlowBorderRef>) => {
    const [config] = useState<FourAngleGlowProps>({...props});
    const fourAngleGlowRef = useRef<HTMLDivElement | null>(null);
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});


    const updateStyle = (config: FourAngleGlowBorderStyle) => {
        fourAngleGlowRef.current?.style.setProperty('--fagb-length', `${config?.length}px`);
        fourAngleGlowRef.current?.style.setProperty('--fagb-color', config!.color!);
        fourAngleGlowRef.current?.style.setProperty('--fagb-radius', `${config?.radius}px`);
        fourAngleGlowRef.current?.style.setProperty('--fagb-width', `${config?.width}px`);
    }

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => updateStyle({...newConfig}),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
    }));

    useEffect(() => {
        updateStyle(config.style!);
    });

    return (
        <div className="four-angle-glow" ref={fourAngleGlowRef}>
            <span className="angle angle-tl"/>
            <span className="angle angle-tr"/>
            <span className="angle angle-bl"/>
            <span className="angle angle-br"/>
        </div>
    );
})

export default FourAngleGlowBorder;


