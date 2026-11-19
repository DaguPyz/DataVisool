/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {useEffect, useRef} from "react";
import type {CSSProperties} from 'react';
import {observer} from "mobx-react";
import ViewportController from "@/plugins/editor-canvas/viewport/ViewportController.ts";
import '@/plugins/editor-canvas/viewport/Viewport.less';
import type {EditorShortcutInputQuery} from '@datavisool/sdk/plugin/contracts/editorShortcuts';
import {useEditorCanvasActivation} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';

export interface DesignerDragScaleContainerProps {
    input: EditorShortcutInputQuery;
    children?: React.ReactNode;
    onDoubleClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    canvasSize: {width?: number; height?: number};
    filterStyle: CSSProperties;
    loopScene: boolean;
}

const DesignerDragScaleContainer = observer((props: DesignerDragScaleContainerProps) => {
    const {children, onDoubleClick, canvasSize, filterStyle, loopScene} = props;
    const activation = useEditorCanvasActivation();
    const {eventOperateStore, contextMenuStore, viewportStore} = activation;
    activation.sceneStore.revision;
    const canInteract = activation.canEdit();
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<ViewportController | null>(null);
    const canvasSizeRef = useRef(canvasSize);
    canvasSizeRef.current = canvasSize;

    useEffect(() => {
        if (!canInteract || !activation.canEdit()) return undefined;
        const container = containerRef.current;
        const content = contentRef.current;
        if (container && content) {
            const {setDsContentRef} = eventOperateStore;
            setDsContentRef(content)
            const controller = new ViewportController({
                eventOperateStore,
                contextMenuStore,
                viewportStore,
                input: props.input,
                viewport: container,
                artboard: content,
                getArtboardBounds: () => {
                    return {
                        x: 0,
                        y: 0,
                        width: canvasSizeRef.current.width ?? 1,
                        height: canvasSizeRef.current.height ?? 1,
                    };
                },
            });
            controllerRef.current = controller;
            return () => {
                controller.destroy();
                controllerRef.current = null;
                setDsContentRef(null);
            }
        }
    }, [props.input, eventOperateStore, contextMenuStore, viewportStore, canInteract]);
    useEffect(() => controllerRef.current?.refresh(), [canvasSize.width, canvasSize.height]);
    return (
        <div className={'designer-ds-container'} ref={containerRef} tabIndex={-1}>
            <div className={`designer-ds-content ${loopScene ? 'canvas-transparent' : ''}`}
                 id={'designer-ds-content'}
                 data-datavisool-i18n-skip="true"
                 ref={contentRef}
                 onDoubleClick={onDoubleClick}
                 style={{
                     width: canvasSize.width,
                     height: canvasSize.height,
                     ...filterStyle
                 }}>
                {children}
            </div>
        </div>
    )
})

export default DesignerDragScaleContainer;
