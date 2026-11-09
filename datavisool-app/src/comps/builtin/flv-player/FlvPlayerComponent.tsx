/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {ForwardedRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import FlvJs from "flv.js";
import {ComponentInfoType} from "@datavisool/sdk/types";
import {IFilterConfigType} from "@datavisool/sdk/types";

export interface FlvPlayerComponentStyle {
    url?: string;
}

export interface FlvPlayerComponentProps {
    base?: ComponentInfoType;
    style?: FlvPlayerComponentStyle;
    filter?: IFilterConfigType;
}

export interface FlvPlayerComponentRef {
    updateConfig: (newConfig: FlvPlayerComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    destroy: () => void;
    changeVisible: (visible: boolean) => void;
}

const FlvPlayerComponent = React.forwardRef((props: FlvPlayerComponentProps, ref: ForwardedRef<FlvPlayerComponentRef>) => {
    const [config, setConfig] = useState<FlvPlayerComponentProps>({...props});
    const [visible, setVisible] = useState(true);
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const playerRef = useRef<FlvJs.Player | null>(null);
    const {url} = config.style!;

    const destroy = () => {
        if (playerRef.current) {
            playerRef.current.pause();
            playerRef.current.unload();
            playerRef.current.detachMediaElement();
            playerRef.current.destroy();
            playerRef.current = null;
        }
    }

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => setConfig({...newConfig}),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        destroy: () => destroy(),
        changeVisible: (visible: boolean) => setVisible(visible)
    }));

    useEffect(() => {
        if (FlvJs.isSupported()) {
            const player = FlvJs.createPlayer({
                type: 'flv',
                url: url,
            });
            player.attachMediaElement(videoRef.current!);
            player.load();
            player.play();
            playerRef.current = player;
        }
        return () => destroy();
    }, [url]);

    const onClick = () => {
        if ('click' in eventHandlerMap.current) {
            eventHandlerMap.current['click']();
        }
    }

    if (!visible)
        return null;

    return (
        <video style={{height: '100%', width: '100%'}} ref={videoRef} controls onClick={onClick}/>
    );
});

export default FlvPlayerComponent;