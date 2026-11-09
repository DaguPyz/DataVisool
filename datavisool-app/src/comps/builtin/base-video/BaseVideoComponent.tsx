/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {forwardRef, Ref, useEffect, useImperativeHandle, useRef, useState} from "react";
import {BaseVideoComponentProps} from "./BaseVideoController.ts";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";

export interface BaseVideoComponentStyle {
    src?: string;
    autoPlay?: boolean;
    controls?: boolean;
    loop?: boolean;
    muted?: boolean;
    poster?: string;
    objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

export interface BaseVideoComponentRef {
    updateConfig: (newConfig: BaseVideoComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    changeVisible: (visible: boolean) => void;
}

const BaseVideoComponent = forwardRef((props: BaseVideoComponentProps, ref: Ref<BaseVideoComponentRef>) => {

    const [config, setConfig] = useState<BaseVideoComponentProps>({...props});
    const [visible, setVisible] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);
    const previousSource = useRef<string | undefined>(undefined);

    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => setConfig({...newConfig}),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        changeVisible: (visible) => setVisible(visible)
    }));

    const {style} = config;
    const {
        src,
        autoPlay = true,
        controls = true,
        loop = false,
        muted = false,
        poster,
        objectFit = 'contain'
    } = style || {};
    const videoSource = src ? AssetUrlUtil.toLoadableUrl(src) : '';
    const posterUrl = poster ? AssetUrlUtil.toLoadableUrl(poster) : undefined;

    useEffect(() => {
        if (previousSource.current !== undefined && previousSource.current !== videoSource) {
            videoRef.current?.load();
        }
        previousSource.current = videoSource;
    }, [videoSource]);

    if (!visible)
        return null;

    return (
        <div style={{width: '100%', height: '100%'}}>
            {!src ? <div style={{
                    color: '#9a9a9a',
                    height: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}>
                    <div>请配置视频连接...</div>
                </div> :
                <video 
                    ref={videoRef}
                    width="100%" 
                    height="100%" 
                    controls={controls} 
                    autoPlay={autoPlay}
                    loop={loop}
                    muted={muted}
                    poster={posterUrl}
                    style={{objectFit}}
                >
                    <source src={videoSource} type="video/mp4"/>
                    <source src={videoSource} type="video/webm"/>
                    <source src={videoSource} type="video/ogg"/>
                    您的浏览器不支持 video 标签。
                </video>}
        </div>
    );
})

export default BaseVideoComponent;
