/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import React, {Suspense, useCallback, useEffect, useLayoutEffect, useRef} from 'react';
import {Loading} from '@datavisool/ui';
import DragScaleProvider from '@/framework/drag-scale/DragScaleProvider.tsx';
import BpCanvasUtil from '@/plugins/editor-blueprint/util/BpCanvasUtil.ts';
import {syncBPCanvasGrid} from '@/plugins/editor-blueprint/workspace/BPCanvasGrid.ts';
import {useBPCanvasMetrics} from '@/plugins/editor-blueprint/workspace/useBPCanvasMetrics.ts';
import BPViewportController from '@/plugins/editor-blueprint/workspace/BPViewportController';
import LineLayer from '@/plugins/editor-blueprint/line/LineLayer.tsx';
import BpContextMenu from '@/plugins/editor-blueprint/context-menu/BpContextMenu.tsx';
import NodeLayer from './node/NodeLayer.tsx';
import {useEditorBlueprintSession} from './session/EditorBlueprintSessionContext.tsx';
import './BPCanvas.less';

const BPCanvas: React.FC = () => {
    const session = useEditorBlueprintSession();
    const containerRef = useRef<HTMLDivElement>(null);
    const clearSelectedLinesOnBlankPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || (event.target !== event.currentTarget && !(event.target instanceof HTMLCanvasElement))) return;
        session.selectedLines.forEach(lineId => {
            const graphics = session.lineInstances[lineId];
            const line = session.currentPageManager?.bpLines?.[lineId];
            if (graphics && line) BpCanvasUtil.reDrawLine(line, graphics);
        });
        session.setSelectedLines([]);
    };
    const onMetricsChange = useCallback(({width, height, resolution}: {width: number; height: number; resolution: number}) => {
        if (width > 0 && height > 0) session.pixiApp?.renderer?.resize(width, height, resolution);
        if (session.currentPageManager && session.pixiApp?.renderer && width > 0 && height > 0)
            BpCanvasUtil.reRenderAllLine(session);
    }, [session]);
    const {metrics, refresh} = useBPCanvasMetrics(containerRef, onMetricsChange);

    useLayoutEffect(() => { refresh(); });

    useEffect(() => {
        if (!session.isActive()) return;
        const {setCanvasTranslate, setCanvasScale, setBpDragContentRef} = session;
        let active = true;
        let dragScaleProvider: DragScaleProvider | undefined;
        let viewportController: BPViewportController | null = null;
        let count = 0;
        const interval = setInterval(() => {
            if (!active) { clearInterval(interval); return; }
            const dsTarget = document.getElementById('bp-node-content') as HTMLDivElement | null;
            if (dsTarget && containerRef.current) {
                refresh();
                setBpDragContentRef(dsTarget);
                dragScaleProvider = new DragScaleProvider({
                    eventContainer: containerRef.current,
                    dsTarget,
                    position: session.canvasTranslate,
                    scale: session.canvasScale,
                    dragStartCallback: () => { if (active) session.contextMenu.beginRightDrag(); },
                    dragMoveStartCallback: () => { if (active) session.contextMenu.startRightDrag(); },
                    dragCallback: ({position}) => {
                        if (!active) return;
                        setCanvasTranslate(position);
                        if (containerRef.current) syncBPCanvasGrid(containerRef.current, position, session.canvasScale);
                        BpCanvasUtil.reRenderAllLine(session);
                    },
                    dragEndCallback: ({dragging}) => { if (active) session.contextMenu.endRightDrag(dragging); },
                    scaleCallback: ({position, scale}) => {
                        if (!active) return;
                        setCanvasScale(scale);
                        setCanvasTranslate(position);
                        if (containerRef.current) syncBPCanvasGrid(containerRef.current, position, scale);
                        BpCanvasUtil.reRenderAllLine(session);
                    },
                });
                viewportController = new BPViewportController(containerRef.current, dragScaleProvider, session);
                session.setViewportController(viewportController);
                syncBPCanvasGrid(containerRef.current, session.canvasTranslate, session.canvasScale);
                clearInterval(interval);
            }
            if (++count > 100) {
                console.error('BPCanvas: Failed to find bp-node-content element after 100 tries.');
                clearInterval(interval);
            }
        }, 10);

        return session.ownViewResource(() => {
            active = false;
            clearInterval(interval);
            dragScaleProvider?.destroy();
            if (session.viewportController === viewportController) session.setViewportController(null);
            session.contextMenu.endRightDrag(true);
            session.setBpDragContentRef(null);
        });
    }, [refresh, session]);

    return <>
        <div className="blue-print-canvas" style={{overflow: 'hidden', width: '100%', height: '100%'}}
             ref={containerRef} onPointerDown={clearSelectedLinesOnBlankPointerDown}>
            <Suspense fallback={<Loading/>}>
                <LineLayer metrics={metrics}/>
                <NodeLayer/>
            </Suspense>
        </div>
        <BpContextMenu/>
    </>;
};

export default BPCanvas;
