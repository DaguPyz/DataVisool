/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {LayerCanvas} from './LayerConsumer.ts';

import React, {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import './LayerList.less';
import type {EditorLayerDomain, EditorLayerNode} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorLayersState} from './EditorLayersState.ts';
import {buildLayerList} from './LayerRender.tsx';
import DesignerPanelHeader from '@/shared/components/panel-header/DesignerPanelHeader';
import layerListStackVisual from '@/plugins/editor-layers/assets/layer-list-stack-visual.webp';

type DropPosition = 'before' | 'after';

const LAYER_ROW_SELECTOR = '.layer-item, .group-header';

const isDescendantOf = (domain: EditorLayerDomain, layerId: string, ancestorId: string) => {
    const visited = new Set<string>();
    let current = domain.readLayer(layerId);
    while (current?.pid) {
        if (current.pid === ancestorId) return true;
        if (visited.has(current.pid)) return false;
        visited.add(current.pid);
        current = domain.readLayer(current.pid);
    }
    return false;
};

const listGroupIds = (layers: readonly EditorLayerNode[]): string[] => {
    const result: string[] = [];
    const visit = (items: readonly EditorLayerNode[]) => items.forEach(layer => {
        if (layer.type === 'group' && layer.id) result.push(layer.id);
        if (layer.children) visit(layer.children);
    });
    visit(layers);
    return result;
};

const LayerList = ({
    canvas,
    state,
    prepareLayerDomain,
    onClose,
}: {
    canvas: LayerCanvas;
    state: EditorLayersState;
    prepareLayerDomain(signal?: AbortSignal): Promise<EditorLayerDomain>;
    onClose(): void;
}) => {
    useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot);
    const layerListRef = useRef<HTMLDivElement | null>(null);
    const layerItemsContainerRef = useRef<HTMLDivElement | null>(null);
    const moveListenerRef = useRef<(event: MouseEvent) => void>(() => undefined);
    const upListenerRef = useRef<(event: MouseEvent) => void>(() => undefined);
    const globalMoveListenerRef = useRef((event: MouseEvent) => moveListenerRef.current(event));
    const globalUpListenerRef = useRef((event: MouseEvent) => upListenerRef.current(event));
    const sceneEpoch = state.readSceneEpoch();
    const [domain, setDomain] = useState<EditorLayerDomain | null>(null);

    useEffect(() => {
        const consumer = new AbortController();
        let current = true;
        setDomain(null);
        void prepareLayerDomain(consumer.signal).then(nextDomain => {
            if (!current || consumer.signal.aborted || !nextDomain.isActive()) return;
            state.setScene(nextDomain.sceneVersion);
            setDomain(nextDomain);
        }).catch(error => {
            if (!consumer.signal.aborted && (error as Error)?.name !== 'AbortError')
                console.error('读取图层列表失败', error);
        });
        return () => {
            current = false;
            consumer.abort();
        };
    }, [canvas, prepareLayerDomain, sceneEpoch, state]);

    useEffect(() => {
        const container = layerItemsContainerRef.current;
        if (!container) return;
        return state.mountLayersView(container);
    }, [state, sceneEpoch]);

    const activeDomain = domain?.isActive() ? domain : null;
    const layers = activeDomain?.readTree() ?? [];

    const clearDropIndicator = () => {
        const dragSession = state.readDragSession();
        const overRow = dragSession?.overRow;
        if (!dragSession || !overRow) return;
        overRow.classList.remove('layer-drop-before', 'layer-drop-after');
        dragSession.overRow = undefined;
        dragSession.dropPosition = undefined;
    };

    const clearDragSourceState = () => state.readDragSession()?.sourceRow.classList.remove('layer-dragging-source');

    const cleanupDrag = () => {
        clearDropIndicator();
        clearDragSourceState();
        state.setDragSession(null);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', globalMoveListenerRef.current, true);
        window.removeEventListener('mouseup', globalUpListenerRef.current, true);
    };

    useEffect(() => state.ownInteraction(cleanupDrag), [state]);

    const getLayerCandidates = () => {
        const container = layerItemsContainerRef.current;
        if (!container) return [] as HTMLElement[];
        return Array.from(container.querySelectorAll<HTMLElement>(LAYER_ROW_SELECTOR)).filter(node => !!node.dataset.id);
    };

    const resolveDropTarget = (clientX: number, clientY: number): {target: HTMLElement; pos: DropPosition} | null => {
        const candidates = getLayerCandidates();
        if (candidates.length === 0) return null;
        const pointElements = typeof document.elementsFromPoint === 'function'
            ? document.elementsFromPoint(clientX, clientY)
            : [document.elementFromPoint(clientX, clientY)].filter(Boolean) as Element[];
        for (const element of pointElements) {
            if (!(element instanceof HTMLElement)) continue;
            const matched = element.closest(LAYER_ROW_SELECTOR) as HTMLElement | null;
            if (matched && candidates.includes(matched)) {
                const rect = matched.getBoundingClientRect();
                return {target: matched, pos: clientY < rect.top + rect.height / 2 ? 'before' : 'after'};
            }
        }
        let nearest = candidates[0];
        let nearestDistance = Number.POSITIVE_INFINITY;
        let nearestPos: DropPosition = 'before';
        candidates.forEach(node => {
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
    };

    const applyDropIndicator = (target: HTMLElement, pos: DropPosition) => {
        const dragSession = state.readDragSession();
        if (!dragSession || (dragSession.overRow === target && dragSession.dropPosition === pos)) return;
        clearDropIndicator();
        dragSession.overRow = target;
        dragSession.dropPosition = pos;
        target.classList.add(pos === 'before' ? 'layer-drop-before' : 'layer-drop-after');
    };

    const maybeAutoScroll = (clientY: number) => {
        const container = layerItemsContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const threshold = 36;
        const step = 18;
        if (clientY < rect.top + threshold) container.scrollTop -= step;
        else if (clientY > rect.bottom - threshold) container.scrollTop += step;
    };

    const handleMouseMove = (event: MouseEvent) => {
        const dragSession = state.readDragSession();
        if (!dragSession) return;
        maybeAutoScroll(event.clientY);
        const resolved = resolveDropTarget(event.clientX, event.clientY);
        if (!resolved) {
            clearDropIndicator();
            return;
        }
        const targetId = resolved.target.dataset.id;
        if (!targetId || targetId === dragSession.sourceId || !activeDomain || isDescendantOf(activeDomain, targetId, dragSession.sourceId)) {
            clearDropIndicator();
            return;
        }
        applyDropIndicator(resolved.target, resolved.pos);
    };

    const handleMouseUp = () => {
        const dragSession = state.readDragSession();
        if (!dragSession) {
            cleanupDrag();
            return;
        }
        const sourceId = dragSession.sourceId;
        const targetId = dragSession.overRow?.dataset.id;
        const position = dragSession.dropPosition;
        cleanupDrag();
        if (!activeDomain || !targetId || !position || sourceId === targetId || isDescendantOf(activeDomain, targetId, sourceId)) return;
        if (activeDomain.reorder(sourceId, targetId, position)) state.refresh();
    };

    const handleDragHandleMouseDown = (layerId: string, event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !activeDomain || !state.isAccepting()) return;
        const sourceRow = event.currentTarget.closest(LAYER_ROW_SELECTOR) as HTMLElement | null;
        if (!sourceRow) return;
        event.preventDefault();
        event.stopPropagation();
        cleanupDrag();
        sourceRow.classList.add('layer-dragging-source');
        state.setDragSession({sourceId: layerId, sourceRow});
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', globalMoveListenerRef.current, true);
        window.addEventListener('mouseup', globalUpListenerRef.current, true);
    };

    const cancelSelected = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (!layerListRef.current || !target) return;
        if (layerListRef.current.contains(target)
            && !layerItemsContainerRef.current?.contains(target)
            && !target.closest('.datavisool-artboard-list, .designer-panel-header-actions')) {
            if (canvas.readSelection().ids.length > 0) canvas.select([]);
        }
    };

    moveListenerRef.current = handleMouseMove;
    upListenerRef.current = handleMouseUp;

    useEffect(() => {
        const listDom = layerListRef.current;
        listDom?.addEventListener('click', cancelSelected);
        return () => {
            listDom?.removeEventListener('click', cancelSelected);
            cleanupDrag();
        };
    }, [canvas]);

    const layerList = activeDomain ? buildLayerList(layers, canvas.readSelection().ids, {
        canvas,
        state,
        onDragHandleMouseDown: handleDragHandleMouseDown,
        onSelect: (id, event) => state.selectLayer(id, event, canvas, layers),
        onToggleLock: (id, locked) => { if (activeDomain.setLocked(id, locked)) state.refresh(); },
        onToggleHide: (id, hidden) => { if (activeDomain.setHidden(id, hidden)) state.refresh(); },
        onRename: (id, name) => { if (activeDomain.rename(id, name)) state.refresh(); },
    }) : [];

    return (
        <div className="layer-list" ref={layerListRef}
             onMouseDownCapture={state.blockInteractionIfPaused} onClickCapture={state.blockInteractionIfPaused}
             onDoubleClickCapture={state.blockInteractionIfPaused} onKeyDownCapture={state.blockInteractionIfPaused}>
            <DesignerPanelHeader onClose={onClose} title="图层列表" menuItems={[
                {key: 'expand-all', label: '全部展开', onClick: () => state.toggleAllGroups(listGroupIds(layers), true)},
                {key: 'collapse-all', label: '全部折叠', onClick: () => state.toggleAllGroups(listGroupIds(layers), false)},
            ]}/>
            <div className="layer-items" ref={layerItemsContainerRef}>
                {layerList.length > 0 ? layerList : (
                    <div className="layer-empty">
                        <img src={layerListStackVisual} alt="" draggable={false}/>
                        <div className="layer-empty-title">暂无图层</div>
                        <div className="layer-empty-desc">从组件库拖入组件后会显示在这里</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LayerList;
