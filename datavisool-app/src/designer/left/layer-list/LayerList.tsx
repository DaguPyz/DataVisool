/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {useEffect} from 'react';
import './LayerList.less';
import {observer} from "mobx-react";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import layerRender from "./LayerRender.ts";
import DesignerPanelHeader from '../panel-header/DesignerPanelHeader';
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";
import LayerUtil from "./util/LayerUtil.ts";
import managerStore from "@/designer/manager/ManagerStore.ts";
import layerListStackVisual from "@/designer/assets/layer-list-stack-visual.webp";

type DropPosition = 'before' | 'after';

interface DragSession {
    sourceId: string;
    sourceRow: HTMLElement;
    overRow?: HTMLElement;
    dropPosition?: DropPosition;
}

const LAYER_ROW_SELECTOR = '.layer-item, .group-header';

const LayerList = observer(() => {
    const layerListRef = React.useRef<HTMLDivElement | null>(null);
    const layerItemsContainerRef = React.useRef<HTMLDivElement | null>(null);
    const dragSessionRef = React.useRef<DragSession | null>(null);
    const moveListenerRef = React.useRef<(event: MouseEvent) => void>(() => undefined);
    const upListenerRef = React.useRef<(event: MouseEvent) => void>(() => undefined);
    const globalMoveListenerRef = React.useRef((event: MouseEvent) => moveListenerRef.current(event));
    const globalUpListenerRef = React.useRef((event: MouseEvent) => upListenerRef.current(event));
    const cleanupDragRef = React.useRef<() => void>(() => undefined);

    const clearDropIndicator = () => {
        const dragSession = dragSessionRef.current;
        const overRow = dragSession?.overRow;
        if (!dragSession || !overRow)
            return;
        overRow.classList.remove('layer-drop-before', 'layer-drop-after');
        dragSession.overRow = undefined;
        dragSession.dropPosition = undefined;
    }

    const clearDragSourceState = () => {
        const dragSession = dragSessionRef.current;
        if (!dragSession)
            return;
        dragSession.sourceRow.classList.remove('layer-dragging-source');
    }

    const cleanupDrag = () => {
        clearDropIndicator();
        clearDragSourceState();
        dragSessionRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', globalMoveListenerRef.current, true);
        window.removeEventListener('mouseup', globalUpListenerRef.current, true);
    }

    const getLayerCandidates = () => {
        const container = layerItemsContainerRef.current;
        if (!container)
            return [] as HTMLElement[];
        return Array.from(container.querySelectorAll<HTMLElement>(LAYER_ROW_SELECTOR)).filter((node) => !!node.dataset.id);
    }

    const resolveDropTarget = (clientX: number, clientY: number): { target: HTMLElement, pos: DropPosition } | null => {
        const candidates = getLayerCandidates();
        if (candidates.length === 0)
            return null;

        const pointElements = typeof document.elementsFromPoint === 'function'
            ? document.elementsFromPoint(clientX, clientY)
            : [document.elementFromPoint(clientX, clientY)].filter(Boolean) as Element[];

        for (const element of pointElements) {
            if (!(element instanceof HTMLElement))
                continue;
            const matched = element.closest(LAYER_ROW_SELECTOR) as HTMLElement | null;
            if (matched && candidates.includes(matched)) {
                const rect = matched.getBoundingClientRect();
                return {
                    target: matched,
                    pos: clientY < rect.top + rect.height / 2 ? 'before' : 'after',
                };
            }
        }

        let nearest = candidates[0];
        let nearestDistance = Number.POSITIVE_INFINITY;
        let nearestPos: DropPosition = 'before';
        candidates.forEach((node) => {
            const rect = node.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            const distance = Math.abs(clientY - centerY);
            if (distance < nearestDistance) {
                nearest = node;
                nearestDistance = distance;
                nearestPos = clientY < centerY ? 'before' : 'after';
            }
        });
        return {target: nearest, pos: nearestPos};
    }

    const applyDropIndicator = (target: HTMLElement, pos: DropPosition) => {
        const dragSession = dragSessionRef.current;
        if (!dragSession)
            return;
        if (dragSession.overRow === target && dragSession.dropPosition === pos)
            return;
        clearDropIndicator();
        dragSession.overRow = target;
        dragSession.dropPosition = pos;
        target.classList.add(pos === 'before' ? 'layer-drop-before' : 'layer-drop-after');
    }

    const maybeAutoScroll = (clientY: number) => {
        const container = layerItemsContainerRef.current;
        if (!container)
            return;
        const rect = container.getBoundingClientRect();
        const threshold = 36;
        const step = 18;
        if (clientY < rect.top + threshold)
            container.scrollTop -= step;
        else if (clientY > rect.bottom - threshold)
            container.scrollTop += step;
    }

    const handleMouseMove = (event: MouseEvent) => {
        const dragSession = dragSessionRef.current;
        if (!dragSession)
            return;

        maybeAutoScroll(event.clientY);

        const resolved = resolveDropTarget(event.clientX, event.clientY);
        if (!resolved) {
            clearDropIndicator();
            return;
        }

        const targetId = resolved.target.dataset.id;
        if (!targetId || targetId === dragSession.sourceId || LayerUtil.isTargetChild(targetId, dragSession.sourceId)) {
            clearDropIndicator();
            return;
        }
        applyDropIndicator(resolved.target, resolved.pos);
    }

    const handleMouseUp = () => {
        const dragSession = dragSessionRef.current;
        if (!dragSession) {
            cleanupDrag();
            return;
        }

        const sourceId = dragSession.sourceId;
        const targetId = dragSession.overRow?.dataset.id;
        const position = dragSession.dropPosition;
        cleanupDrag();

        if (!targetId || !position || sourceId === targetId || LayerUtil.isTargetChild(targetId, sourceId))
            return;
        historyRecordOperateProxy.layerDragMove(sourceId, targetId, position);
    }

    const handleDragHandleMouseDown = (layerId: string, event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0)
            return;

        const sourceRow = event.currentTarget.closest(LAYER_ROW_SELECTOR) as HTMLElement | null;
        if (!sourceRow)
            return;

        event.preventDefault();
        event.stopPropagation();

        cleanupDrag();
        sourceRow.classList.add('layer-dragging-source');
        dragSessionRef.current = {sourceId: layerId, sourceRow};

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', globalMoveListenerRef.current, true);
        window.addEventListener('mouseup', globalUpListenerRef.current, true);
    }

    const cancelSelected = (e: MouseEvent) => {
        if (!layerListRef.current)
            return;
        if (layerListRef.current.contains(e.target as Node)
            && !layerItemsContainerRef.current?.contains(e.target as Node)
            && !(e.target as HTMLElement).closest('.datavisool-artboard-list, .designer-panel-header-actions')) {
            const {setTargetIds, targetIds} = eventOperateStore;
            if (targetIds.length > 0)
                setTargetIds([]);
        }
    }

    const buildLayerList = () => {
        const {layerConfigs, layerHeader} = managerStore.currentManager!.layerManager;
        return layerRender.buildLayerList(layerConfigs, layerHeader!, {
            onDragHandleMouseDown: handleDragHandleMouseDown
        });
    }

    moveListenerRef.current = handleMouseMove;
    upListenerRef.current = handleMouseUp;
    cleanupDragRef.current = cleanupDrag;

    useEffect(() => {
        const listDom = layerListRef.current;
        listDom?.addEventListener("click", cancelSelected);
        return () => {
            listDom?.removeEventListener("click", cancelSelected);
            cleanupDragRef.current();
        }
    }, []);

    const layerList = buildLayerList();
    const toggleAllGroups = (unfold: boolean) => {
        const {layerConfigs} = managerStore.currentManager!.layerManager;
        const groupIds = Object.values(layerConfigs).filter(layer => layer.type === 'group').map(layer => layer.id!);
        LayerUtil.togglesGroupingUnfold(groupIds, unfold);
    };

    return (
        <div className={'layer-list'} ref={layerListRef}>
            <DesignerPanelHeader title="图层列表" menuItems={[
                {key: 'expand-all', label: '全部展开', onClick: () => toggleAllGroups(true)},
                {key: 'collapse-all', label: '全部折叠', onClick: () => toggleAllGroups(false)},
            ]}/>
            <div className={'layer-items'} ref={layerItemsContainerRef}>
                {layerList.length > 0 ? layerList : (
                    <div className={'layer-empty'}>
                        <img src={layerListStackVisual} alt={''} draggable={false}/>
                        <div className={'layer-empty-title'}>暂无图层</div>
                        <div className={'layer-empty-desc'}>从组件库拖入组件后会显示在这里</div>
                    </div>
                )}
            </div>
        </div>
    );
})

export default LayerList;
