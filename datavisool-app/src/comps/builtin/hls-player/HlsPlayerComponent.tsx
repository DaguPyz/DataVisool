/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {ForwardedRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import Hls from 'hls.js';
import {ComponentInfoType} from "@datavisool/sdk/types";
import {IFilterConfigType} from "@datavisool/sdk/types";

export interface HlsPlayerComponentStyle {
    url?: string;
}

export interface HlsPlayerComponentProps {
    base?: ComponentInfoType;
    style?: HlsPlayerComponentStyle;
    filter?: IFilterConfigType;
}

export interface HlsPlayerComponentRef {
    updateConfig: (newConfig: HlsPlayerComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    destroy: () => void;
    changeVisible: (visible: boolean) => void;
}

const HlsPlayerComponent = React.forwardRef((props: HlsPlayerComponentProps, ref: ForwardedRef<HlsPlayerComponentRef>) => {
    const [config, setConfig] = useState<HlsPlayerComponentProps>({...props});
    const [visible, setVisible] = useState(true);
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const playerRef = useRef<Hls | null>(null);
    const {url} = config.style!;

    const destroy = () => {
        if (playerRef.current) {
            playerRef.current?.destroy();
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
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url!);
            hls.attachMedia(videoRef.current!);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoRef.current!.play();
            });
            playerRef.current = hls;
        } else if (videoRef.current!.canPlayType('application/vnd.apple.mpegurl')) {
            videoRef.current!.src = url!;
            videoRef.current!.addEventListener('loadedmetadata', () => {
                videoRef.current!.play();
            });
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

export default HlsPlayerComponent;