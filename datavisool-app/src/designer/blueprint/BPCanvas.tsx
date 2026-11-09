/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Suspense, useCallback, useEffect, useLayoutEffect, useRef} from "react";
import {Loading} from "@datavisool/ui";
import LineLayer from "./line/LineLayer.tsx";
import NodeLayer from "./node/NodeLayer.tsx";
import DragScaleProvider from "@/framework/drag-scale/DragScaleProvider.tsx";
import BpCanvasUtil from "./util/BpCanvasUtil.ts";
import BpContextMenu from "./bp-context-menu/BpContextMenu.tsx";
import './BPCanvas.less';
import contextMenuStore from "@/designer/event/ContextMenuStore.ts";
import {syncBPCanvasGrid} from "@/designer/blueprint/workspace/BPCanvasGrid.ts";
import {useBPCanvasMetrics} from "@/designer/blueprint/workspace/useBPCanvasMetrics.ts";
import BPViewportController from './workspace/BPViewportController';

const BPCanvas: React.FC = () => {

    const containerRef = useRef<HTMLDivElement>(null);
    const clearSelectedLinesOnBlankPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0)
            return;
        if (event.target !== event.currentTarget && !(event.target instanceof HTMLCanvasElement))
            return;
        const {bluePrintManager} = window.DATAVISOOL_ENV.currentManager;
        bluePrintManager.selectedLines.forEach(lineId => {
            const graphics = bluePrintManager.lineInstances[lineId];
            const line = bluePrintManager.currentPageManager?.bpLines[lineId];
            if (graphics && line)
                BpCanvasUtil.reDrawLine(line, graphics);
        });
        bluePrintManager.setSelectedLines([]);
    };
    const onMetricsChange = useCallback(({width, height, resolution}: {width: number; height: number; resolution: number}) => {
        const bluePrintManager = window.DATAVISOOL_ENV.currentManager?.bluePrintManager;
        if (width > 0 && height > 0)
            bluePrintManager?.pixiApp?.renderer?.resize(width, height, resolution);
        if (bluePrintManager?.currentPageManager && bluePrintManager.pixiApp?.renderer && width > 0 && height > 0)
            BpCanvasUtil.reRenderAllLine();
    }, []);
    const {metrics, refresh} = useBPCanvasMetrics(containerRef, onMetricsChange);

    useLayoutEffect(() => {
        // Parent workspace state may move a fixed portal without resizing it.
        refresh();
    });

    useEffect(() => {
        const bluePrintManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const {setCanvasTranslate, setCanvasScale, setBpDragContentRef} = bluePrintManager;
        let active = true;
        let dragScaleProvider: DragScaleProvider;
        let viewportController: BPViewportController | null = null;
        let count = 0;
        const interval = setInterval(() => {
            if (!active) {
                clearInterval(interval);
                return;
            }
            const dsTarget = document.getElementById("bp-node-content") as HTMLDivElement;
            if (dsTarget && containerRef.current) {
                refresh();
                setBpDragContentRef(dsTarget!);
                dragScaleProvider = new DragScaleProvider({
                    eventContainer: containerRef.current!,
                    dsTarget: dsTarget,
                    position: bluePrintManager.canvasTranslate,
                    scale: bluePrintManager.canvasScale,
                    dragStartCallback: () => {
                        if (active)
                            contextMenuStore.beginRightDrag();
                    },
                    dragMoveStartCallback: () => {
                        if (active)
                            contextMenuStore.startRightDrag();
                    },
                    dragCallback: (dsData) => {
                        if (!active)
                            return;
                        const {position} = dsData;
                        setCanvasTranslate(position);
                        if (containerRef.current)
                            syncBPCanvasGrid(containerRef.current, position, bluePrintManager.canvasScale);
                        BpCanvasUtil.reRenderAllLine();
                    },
                    dragEndCallback: (dsData) => {
                        if (active)
                            contextMenuStore.endRightDrag(dsData.dragging);
                    },
                    scaleCallback: (dsData) => {
                        if (!active)
                            return;
                        const {position, scale} = dsData;
                        setCanvasScale(scale);
                        setCanvasTranslate(position);
                        if (containerRef.current)
                            syncBPCanvasGrid(containerRef.current, position, scale);
                        BpCanvasUtil.reRenderAllLine();
                    },
                });
                viewportController = new BPViewportController(containerRef.current, dragScaleProvider, bluePrintManager);
                bluePrintManager.setViewportController(viewportController);
                syncBPCanvasGrid(
                    containerRef.current,
                    bluePrintManager.canvasTranslate,
                    bluePrintManager.canvasScale
                );
                clearInterval(interval);
            }
            count++;
            if (count > 100) {
                // 初始化蓝图拖拽系统，尝试100次后放弃
                console.error("BPCanvas: Failed to find bp-node-content element after 100 tries.");
                clearInterval(interval);
            }
        }, 10)

        return () => {
            active = false;
            clearInterval(interval);
            dragScaleProvider?.destroy();
            if (bluePrintManager.viewportController === viewportController)
                bluePrintManager.setViewportController(null);
            contextMenuStore.endRightDrag(true);
            bluePrintManager.lineInstances = {};
        };
    }, [refresh])
    return (
        <>
            <div className={'blue-print-canvas'} style={{overflow: "hidden", width: '100%', height: '100%'}}
                 ref={containerRef} onPointerDown={clearSelectedLinesOnBlankPointerDown}>
                <Suspense fallback={<Loading/>}>
                    <LineLayer metrics={metrics}/>
                    <NodeLayer/>
                </Suspense>
            </div>
            <BpContextMenu/>
        </>
    )
}
export default BPCanvas;
