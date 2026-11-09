/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef, type ReactNode} from "react";
import {observer} from "mobx-react";
import {
    InteractionEngine,
    type DragCommitItem,
    type LayerBox,
} from "@datavisool/interaction-engine";
import BpCanvasUtil from "@/designer/blueprint/util/BpCanvasUtil.ts";
import bpHistoryRecordOperateProxy from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";
import type {BPNodeLayoutType} from "@datavisool/sdk/types";

export interface BPInteractionEngineProps {
    children?: ReactNode;
}

export const BPInteractionEngine = observer((props: BPInteractionEngineProps) => {
    const {children} = props;
    const engineRef = useRef<InteractionEngine | null>(null);
    const layerIndexVersionRef = useRef(0);
    const layerCacheRef = useRef<{
        source: Record<string, BPNodeLayoutType>;
        count: number;
        revision: string;
        layers: LayerBox[];
        version: number;
    } | null>(null);

    const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
    const currentPageManager = bpManager.currentPageManager;
    const layoutMap = currentPageManager?.bpNodeLayoutMap ?? {};
    const nodeCount = Object.keys(layoutMap).length;
    const layoutRevision = buildLayoutRevision(layoutMap);
    const selectedNodeIds = bpManager.selectedNodeIds;
    const selectedCount = selectedNodeIds.length;
    const selectedKey = selectedNodeIds.join("\u0001");

    const getLayoutMap = () => {
        return window.DATAVISOOL_ENV.currentManager.bluePrintManager.currentPageManager?.bpNodeLayoutMap ?? {};
    };

    const getElementById = (id: string) => {
        return document.querySelector<HTMLElement>(`.bp-node-container[data-nid="${id}"]`);
    };

    const toLayerBox = (layout: BPNodeLayoutType): LayerBox | null => {
        const id = layout.id;
        const position = layout.position;

        if (!id || !position)
            return null;

        const element = getElementById(id);
        if (!element)
            return null;

        const width = element.offsetWidth;
        const height = element.offsetHeight;
        if (width <= 0 || height <= 0)
            return null;

        return {
            id,
            x: finiteNumber(position.x, 0),
            y: finiteNumber(position.y, 0),
            width,
            height,
            rotate: 0,
        };
    };

    const getInteractiveLayers = () => {
        const currentLayoutMap = getLayoutMap();
        const currentCount = Object.keys(currentLayoutMap).length;
        const currentRevision = buildLayoutRevision(currentLayoutMap);
        const cached = layerCacheRef.current;

        if (cached?.source === currentLayoutMap && cached.count === currentCount && cached.revision === currentRevision)
            return cached.layers;

        const layers = Object.values(currentLayoutMap)
            .map(toLayerBox)
            .filter((layer): layer is LayerBox => Boolean(layer));

        layerCacheRef.current = {
            source: currentLayoutMap,
            count: currentCount,
            revision: currentRevision,
            layers,
            version: ++layerIndexVersionRef.current,
        };

        return layers;
    };

    const getLayerIndexVersion = () => {
        getInteractiveLayers();
        return layerCacheRef.current?.version ?? layerIndexVersionRef.current;
    };

    const invalidateLayerCache = () => {
        layerCacheRef.current = null;
        layerIndexVersionRef.current += 1;
        engineRef.current?.invalidateLayerIndex();
    };

    const applySelection = (ids: string[]) => {
        const currentLayoutMap = getLayoutMap();
        const nextIds = ids.filter((id) => Boolean(currentLayoutMap[id]));
        const nextNodes = nextIds
            .map(getElementById)
            .filter((node): node is HTMLElement => Boolean(node));

        bpManager.selectedLines.forEach(lineId => {
            const graphics = bpManager.lineInstances[lineId];
            const line = bpManager.currentPageManager?.bpLines[lineId];
            if (graphics && line)
                BpCanvasUtil.reDrawLine(line, graphics);
        });
        bpManager.setSelectedNodes(nextNodes);
        bpManager.setSelectedNodeIds(nextIds);
        bpManager.setSelectedLines([]);
        engineRef.current?.refreshResizeOverlay();
    };

    const commitDrag = (items: DragCommitItem[]) => {
        const currentLayoutMap = getLayoutMap();
        const movedNodes = items
            .filter((item) => Boolean(currentLayoutMap[item.id]))
            .map((item) => ({
                id: item.id,
                x: item.x,
                y: item.y,
            }));

        if (movedNodes.length === 0)
            return;

        bpHistoryRecordOperateProxy.doMoveNodes(movedNodes);
        invalidateLayerCache();
        engineRef.current?.refreshLayerGeometry(movedNodes.map((item) => item.id));
        BpCanvasUtil.reRenderAllLine();
    };

    useEffect(() => {
        const container = document.getElementById("bp-node-content");
        if (!container)
            return undefined;
        // 节点坐标容器为 0 × 0；事件必须由实际覆盖画布的容器接收，才能从空白处开始框选。
        const eventContainer = container.closest<HTMLElement>(".blue-print-canvas");
        if (!eventContainer)
            return undefined;
        const stopAnchorPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ap-circle"))
                event.stopPropagation();
        };

        const engine = new InteractionEngine({
            container,
            eventContainer,
            getScale: () => window.DATAVISOOL_ENV.currentManager.bluePrintManager.canvasScale || 1,
            getLayers: getInteractiveLayers,
            getLayerIndexVersion,
            getSelectedIds: () => window.DATAVISOOL_ENV.currentManager.bluePrintManager.selectedNodeIds,
            getElementById,
            resolveHitTarget: ({candidates}) => candidates.at(-1)?.id ?? null,
            resolveSelectionIds: ({hitId, selectedIds: currentSelectedIds, additive}) => {
                if (!hitId)
                    return additive ? currentSelectedIds : [];

                if (!additive)
                    return [hitId];

                return currentSelectedIds.includes(hitId)
                    ? currentSelectedIds.filter((id) => id !== hitId)
                    : [...currentSelectedIds, hitId];
            },
            resolveBoxSelectionIds: ({candidateIds, selectedIds: currentSelectedIds, additive}) => {
                const currentLayoutMap = getLayoutMap();
                const validIds = candidateIds.filter((id) => Boolean(currentLayoutMap[id]));
                return additive ? Array.from(new Set([...currentSelectedIds, ...validIds])) : validIds;
            },
            resolveTransformTargetIds: ({hitId, selectedIds: currentSelectedIds}) => {
                return hitId && !currentSelectedIds.includes(hitId) ? [hitId] : currentSelectedIds;
            },
            enabledFeatures: {
                drag: true,
                resize: false,
                rotate: false,
            },
            selectedOutlineStyle: {
                radius: 9,
            },
            snapMode: "off",
            selectionThreshold: 4,
            spatialIndexBucketSize: 220,
            onSelect: applySelection,
            onDragEnd: commitDrag,
        });

        engineRef.current = engine;
        container.addEventListener("pointerdown", stopAnchorPointerDown, true);
        engine.mount();

        return () => {
            container.removeEventListener("pointerdown", stopAnchorPointerDown, true);
            engine.destroy();
            engineRef.current = null;
        };
    }, []);

    useEffect(() => {
        invalidateLayerCache();
        engineRef.current?.refreshResizeOverlay();
    }, [layoutMap, layoutRevision, nodeCount, selectedCount, selectedKey]);

    return (
        <>
            <div className="bp-interaction-plane"/>
            {children}
        </>
    );
});

function finiteNumber(value: number | undefined, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildLayoutRevision(layoutMap: Record<string, BPNodeLayoutType>) {
    return Object.values(layoutMap)
        .map((layout) => `${layout.id ?? ""}:${layout.position?.x ?? 0}:${layout.position?.y ?? 0}`)
        .join("|");
}
