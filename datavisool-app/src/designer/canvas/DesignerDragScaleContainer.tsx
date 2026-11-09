/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {useEffect, useRef} from "react";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {observer} from "mobx-react";
import managerStore from "@/designer/manager/ManagerStore.ts";
import {DesignerScene} from "@datavisool/sdk/types";
import ViewportController from "@/designer/workspace/viewport/ViewportController.ts";
import '@/designer/workspace/viewport/Viewport.less';

export interface DesignerDragScaleContainerProps {
    children?: React.ReactNode;
    onDoubleClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
}

const DesignerDragScaleContainer = observer((props: DesignerDragScaleContainerProps) => {
    const {children, onDoubleClick} = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<ViewportController | null>(null);
    const {canvasConfig} = window.DATAVISOOL_ENV.currentManager.canvasManager!;
    const {globalFilterManger} = window.DATAVISOOL_ENV.currentManager;

    useEffect(() => {
        const container = containerRef.current;
        const content = contentRef.current;
        if (container && content) {
            const {setDsContentRef} = eventOperateStore;
            setDsContentRef(content)
            const controller = new ViewportController({
                viewport: container,
                artboard: content,
                getArtboardBounds: () => {
                    const config = window.DATAVISOOL_ENV.currentManager.canvasManager?.canvasConfig;
                    return {
                        x: 0,
                        y: 0,
                        width: config?.width ?? 1,
                        height: config?.height ?? 1,
                    };
                },
            });
            controllerRef.current = controller;
            window.DATAVISOOL_ENV.dragScaleProvider = controller;
            return () => {
                controller.destroy();
                controllerRef.current = null;
                if (window.DATAVISOOL_ENV.dragScaleProvider === controller)
                    window.DATAVISOOL_ENV.dragScaleProvider = undefined;
                setDsContentRef(null);
            }
        }
    }, []);
    useEffect(() => controllerRef.current?.refresh(), [canvasConfig?.width, canvasConfig?.height]);
    return (
        <div className={'designer-ds-container'} ref={containerRef} tabIndex={-1}>
            <div className={`designer-ds-content datavisool-drag-scale-provider ${managerStore.designerScene === DesignerScene.LOOP_CONTAINER ? 'canvas-transparent' : ''}`}
                 id={'designer-ds-content'}
                 data-datavisool-i18n-skip="true"
                 ref={contentRef}
                 onDoubleClick={onDoubleClick}
                 style={{
                     width: canvasConfig?.width,
                     height: canvasConfig?.height,
                     ...globalFilterManger.getFilterStyle()
                 }}>
                {children}
            </div>
        </div>
    )
})

export default DesignerDragScaleContainer;
