/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {ForwardedRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import canvasRender from "../../../designer/left/layer-list/CanvasRender.ts";
import {ComponentInfoType} from "@datavisool/sdk/types";
import {IFilterConfigType} from "@datavisool/sdk/types";
import {DesignerMode} from "@datavisool/sdk/types";
import {globalMessage} from "@datavisool/ui";
import {Loading} from "@datavisool/ui";
import type DesignerLoader from "../../../designer/loader/DesignerLoader.ts";
import EnvUtil from "../../../util/EnvUtil.ts";

export interface ScreenReferenceComponentStyle {
    screenId?: string;
}

export interface ScreenReferenceComponentProps {
    base?: ComponentInfoType;
    style?: ScreenReferenceComponentStyle;
    filter?: IFilterConfigType;
}

export interface ScreenReferenceComponentRef {
    updateConfig: (newConfig: ScreenReferenceComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    changeVisible: (visible: boolean) => void;
}

const ScreenReferenceComponent = React.forwardRef((props: ScreenReferenceComponentProps,
                                                   ref: ForwardedRef<ScreenReferenceComponentRef>) => {
    const [config, setConfig] = useState<ScreenReferenceComponentProps>({...props});
    const [visible, setVisible] = useState(true);
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const [loadedTarget, setLoadedTarget] = useState<{screenId: string; componentId: string} | null>(null);
    const [errorTarget, setErrorTarget] = useState<{screenId: string; componentId: string} | null>(null);
    const designerLoaderRef = useRef<DesignerLoader | null>(null);
    const screenId = config.style?.screenId || '';
    const componentId = config.base?.id ?? '';

    const getLoaderClass = async () => {
        let currentMode = EnvUtil.getModeByUrl();
        if (currentMode == null) {
            console.error('无法识别当前环境')
            return null;
        }
        if (currentMode === DesignerMode.EDIT)
            currentMode = DesignerMode.PREVIEW
        if (currentMode === DesignerMode.PREVIEW)
            return {module: await import('../../../designer/loader/ViewDesignerLoader.ts'), mode: DesignerMode.PREVIEW};
        if (currentMode === DesignerMode.RELEASE)
            return {module: await import('../../../designer/loader/ReleaseDesignerLoader.ts'), mode: DesignerMode.RELEASE};
        throw new Error('不支持当前大屏引用模式');
    }

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => setConfig({...newConfig}),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        changeVisible: (visible) => setVisible(visible)
    }));

    useEffect(() => {
        let disposed = false;
        let loader: DesignerLoader | null = null;
        let cleaned = false;
        const cleanupLoader = () => {
            if (cleaned || !loader) return;
            cleaned = true;
            loader.cancelLoad();
            loader.designerManager.destroy();
            if (designerLoaderRef.current === loader) designerLoaderRef.current = null;
            const managers = window.DATAVISOOL_ENV?.managers;
            if (managers?.[componentId] === loader.designerManager) {
                const remaining = {...managers};
                delete remaining[componentId];
                window.DATAVISOOL_ENV = {...window.DATAVISOOL_ENV, managers: remaining};
            }
        };
        setLoadedTarget(null);
        setErrorTarget(null);
        if (screenId) {
            void (async () => {
                const selected = await getLoaderClass();
                if (disposed) return;
                if (!selected) throw new Error('无法识别当前大屏引用模式');
                loader = new selected.module.default(selected.mode) as DesignerLoader;
                designerLoaderRef.current = loader;
                await loader.simpleLoad(screenId);
                if (disposed) return;
                window.DATAVISOOL_ENV = {
                    ...window.DATAVISOOL_ENV,
                    managers: {...window.DATAVISOOL_ENV?.managers, [componentId]: loader.designerManager},
                };
                setLoadedTarget({screenId, componentId});
            })().catch(error => {
                if (disposed) return;
                cleanupLoader();
                console.error(error);
                setErrorTarget({screenId, componentId});
                globalMessage?.messageApi?.error('大屏引用失败');
            });
        }
        return () => {
            disposed = true;
            cleanupLoader();
        };
    }, [screenId, componentId]);

    if (!visible)
        return null;
    if (!screenId)
        return <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#b0b0b0'}}>请引用大屏</div>;
    if (errorTarget?.screenId === screenId && errorTarget.componentId === componentId)
        return <div role="alert">大屏引用失败</div>;
    if (!loadedTarget || loadedTarget.screenId !== screenId || loadedTarget.componentId !== componentId)
        return <Loading/>;

    const referencedManager = designerLoaderRef.current!.designerManager;
    const {width, height} = referencedManager.canvasManager.canvasConfig;
    const globalFilter = referencedManager.globalFilterManger.getFilterStyle();
    return (
        <>
            {visible && <div style={{...{height: '100%', overflow: 'hidden'}}}>
                <div style={{width, height, background: 'rgba(28,28,28,0)', overflow: 'hidden', position: "relative", ...globalFilter}}>
                    {canvasRender.buildCanvasComponents(referencedManager, "screen-reference")}
                </div>
            </div>}
        </>
    );
});

export default ScreenReferenceComponent;
