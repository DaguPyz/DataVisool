/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useMemo, useRef, type ReactNode} from "react";
import {observer} from "mobx-react";
import {
    InteractionEngine,
    type DragCommitItem,
    type InteractionShortcutEvent,
    type LayerBox,
    type ResizeCommitItem,
    type RotateCommitItem
} from "@datavisool/interaction-engine";
import eventOperateStore, {
    type DesignerInteractionRef,
    type DesignerInteractionRequestParams
} from "@/designer/operate-provider/EventOperateStore";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy";
import baseInfoStore from "@/comps/common-component/base-info/BaseInfoStore";
import LayerUtil from "@/designer/left/layer-list/util/LayerUtil";
import layerListStore from "@/designer/left/layer-list/LayerListStore.ts";
import designerLeftStore from "@/designer/left/DesignerLeftStore.ts";
import rightStore from "@/designer/right/RightStore.ts";
import DomUtil from "@/util/DomUtil.ts";
import {convergenceToInterval} from "@/util/BoundsValidatorUtil.ts";
import {BaseLayer} from "@/designer/left/layer-list/item/BaseLayer.tsx";
import type {ILayerItem} from "@datavisool/sdk/types";
import contextMenuStore, {type CanvasMenuCandidate} from "@/designer/event/ContextMenuStore.ts";
import shortcutStore from "@/designer/operate-provider/hot-key/ShortcutStore.ts";
import {SHORTCUT_ACTION_IDS, type ShortcutActionId} from "@/designer/operate-provider/hot-key/ShortcutTypes.ts";
import {
    expandSelectionTreeIds,
    getEffectiveLayerState,
    isCanvasSelectable,
    isEffectivelyHidden,
    isEffectivelyLocked,
    resolveBoxSelectionIds,
    resolveContextMenuSelectionIds,
    resolvePointSelectionIds,
    resolveTransformLeafIds,
    toggleSelectionIds,
} from "@/designer/operate-provider/selection/SelectionPolicy.ts";
import {
    calculateLayerIdsBounds,
    calculateSingleLayerResizeToBounds,
} from "@/designer/operate-provider/selection/SelectionGeometry.ts";
import "./DesignerInteractionEngine.less";

export interface DesignerInteractionEngineProps {
    children?: ReactNode;
}

const DesignerInteractionEngine = observer((props: DesignerInteractionEngineProps) => {
    const {children} = props;
    const engineRef = useRef<InteractionEngine | null>(null);
    const layerIndexVersionRef = useRef(0);
    const layerCacheRef = useRef<{
        source: Record<string, ILayerItem>;
        layers: LayerBox[];
        layersById: Map<string, LayerBox>;
        version: number;
    } | null>(null);
    const layerManager = window.DATAVISOOL_ENV.currentManager.layerManager;
    const canvasManager = window.DATAVISOOL_ENV.currentManager.canvasManager;
    const layerConfigs = layerManager?.layerConfigs ?? {};
    const selectedIds = eventOperateStore.targetIds;
    const layerCount = Object.keys(layerConfigs).length;

    const getLayerConfigs = () => window.DATAVISOOL_ENV.currentManager.layerManager?.layerConfigs ?? {};

    const getCanvasSnapReferencePoints = () => {
        const canvasConfig = window.DATAVISOOL_ENV.currentManager.canvasManager?.canvasConfig;
        const width = finiteNumber(canvasConfig?.width, 0);
        const height = finiteNumber(canvasConfig?.height, 0);

        return {
            x: width > 0 ? [0, width] : [0],
            y: height > 0 ? [0, height] : [0],
        };
    };

    const getInteractiveLayers = () => {
        const currentLayerConfigs = getLayerConfigs();
        const cached = layerCacheRef.current;

        if (cached?.source === currentLayerConfigs) {
            return cached.layers;
        }

        const layers = Object.values(currentLayerConfigs)
            .map(toLayerBox)
            .filter((layer): layer is LayerBox => Boolean(layer));

        layerCacheRef.current = {
            source: currentLayerConfigs,
            layers,
            layersById: new Map(layers.map((layer) => [layer.id, layer])),
            version: ++layerIndexVersionRef.current,
        };

        return layers;
    };

    const getLayerIndexVersion = () => {
        getInteractiveLayers();
        return layerCacheRef.current?.version ?? layerIndexVersionRef.current;
    };

    const resolveTransformIds = (ids: string[]) => resolveTransformLeafIds(ids, getLayerConfigs());

    const isShortcutActive = (actionId: ShortcutActionId, event?: InteractionShortcutEvent) => {
        return shortcutStore.isActive(actionId, event as KeyboardEvent | PointerEvent | undefined);
    };

    const applySelection = (ids: string[]) => {
        const currentLayerConfigs = getLayerConfigs();
        const layerIds = ids.filter((id) => Boolean(currentLayerConfigs[id]));
        eventOperateStore.setTargetIds(layerIds, "canvas");

        if (layerIds.length === 0) {
            rightStore.activeConfig(null, '');
            return;
        }

        if (designerLeftStore.menu === "layer-list") {
            const topmostLayer = layerIds.reduce((prev, current) => {
                return (currentLayerConfigs[prev]?.order ?? 0) > (currentLayerConfigs[current]?.order ?? 0)
                    ? prev
                    : current;
            }, layerIds[0]);

            if (eventOperateStore.directSelectedIds.some((id) => Boolean(currentLayerConfigs[id]?.pid))) {
                LayerUtil.togglesGroupingUnfold(LayerUtil.findLayerGroupChain(topmostLayer), true);
            }

            window.setTimeout(() => {
                const instance = layerListStore.layerInstances[topmostLayer] as BaseLayer;

                if (instance) {
                    const container = document.querySelector(".layer-items");
                    const visible = DomUtil.isViewInContainer(instance.domRef!, container!);

                    if (!visible) {
                        const distance = DomUtil.calculatesDistanceFromContainer(instance.domRef!, container!);
                        container && (container.scrollTop += distance - 300);
                    }
                }

                LayerUtil.reRenderLayerList([], eventOperateStore.directSelectedIds);
            }, 50);
        }
    };

    const patchLayerCache = (patches: Array<Partial<LayerBox> & {id: string}>) => {
        const cached = layerCacheRef.current;

        if (!cached || patches.length === 0) {
            return;
        }

        for (const patch of patches) {
            const layer = cached.layersById.get(patch.id);

            if (layer) {
                applyDefinedGeometryPatch(layer, patch);
            }
        }
    };

    const refreshCommittedGeometry = (patches: Array<Partial<LayerBox> & {id: string}>) => {
        patchLayerCache(patches);
        engineRef.current?.applyLayerGeometry(patches, {refreshOverlay: false});
        engineRef.current?.refreshResizeOverlay();
    };

    const syncGroupCoordinate = () => {
        const currentLayerConfigs = getLayerConfigs();
        const validIds = eventOperateStore.targetIds.filter((id) => Boolean(currentLayerConfigs[id]));
        const bounds = calculateLayerIdsBounds(resolveTransformIds(validIds), currentLayerConfigs);
        if (bounds)
            eventOperateStore.setGroupCoordinate(bounds);
    };

    const updateSingleOrGroupBaseInfo = (patch: Partial<ILayerItem>, includeSize: boolean) => {
        const currentLayerConfigs = getLayerConfigs();
        const canonicalId = eventOperateStore.targetIds.length === 1
            ? eventOperateStore.targetIds[0]
            : null;
        if (canonicalId && currentLayerConfigs[canonicalId]?.type === "group") {
            const groupCoordinate = calculateLayerIdsBounds(resolveTransformIds([canonicalId]), currentLayerConfigs);
            if (!groupCoordinate)
                return;
            baseInfoStore.updateBaseConfig({
                id: canonicalId,
                x: Math.round(groupCoordinate.minX),
                y: Math.round(groupCoordinate.minY),
                ...(includeSize
                    ? {
                        width: Math.round(groupCoordinate.width),
                        height: Math.round(groupCoordinate.height),
                    }
                    : {}),
            });
            return;
        }

        if (patch.id) {
            baseInfoStore.updateBaseConfig(patch);
        }
    };

    const commitDrag = (items: DragCommitItem[]) => {
        const currentLayerConfigs = getLayerConfigs();
        const data: ILayerItem[] = [];

        for (const item of items) {
            const layer = currentLayerConfigs[item.id];

            if (!layer) {
                continue;
            }

            data.push({
                id: item.id,
                width: layer.width,
                height: layer.height,
                type: layer.type,
                x: convergenceToInterval(item.x),
                y: convergenceToInterval(item.y),
            });
        }

        if (data.length === 0) {
            return;
        }

        historyRecordOperateProxy.doDrag(data);
        syncGroupCoordinate();
        const geometryPatches = data.map((item) => ({
            id: item.id!,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
        }));
        refreshCommittedGeometry(geometryPatches);
        updateSingleOrGroupBaseInfo(data[0], false);
    };

    const commitResize = (items: ResizeCommitItem[]) => {
        const currentLayerConfigs = getLayerConfigs();
        const data: ILayerItem[] = [];

        for (const item of items) {
            const layer = currentLayerConfigs[item.id];

            if (!layer) {
                continue;
            }

            data.push({
                id: item.id,
                width: convergenceToInterval(item.width),
                height: convergenceToInterval(item.height),
                type: layer.type,
                x: convergenceToInterval(item.x),
                y: convergenceToInterval(item.y),
            });
        }

        if (data.length === 0) {
            return;
        }

        historyRecordOperateProxy.doResize(data);
        syncGroupCoordinate();
        const geometryPatches = data.map((item) => ({
            id: item.id!,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
        }));
        refreshCommittedGeometry(geometryPatches);
        updateSingleOrGroupBaseInfo(data[0], true);
    };

    const commitRotate = (items: RotateCommitItem[]) => {
        const currentLayerConfigs = getLayerConfigs();
        const data: ILayerItem[] = [];

        for (const item of items) {
            const layer = currentLayerConfigs[item.id];

            if (!layer) {
                continue;
            }

            data.push({
                id: item.id,
                type: layer.type,
                x: item.x == null ? undefined : convergenceToInterval(item.x),
                y: item.y == null ? undefined : convergenceToInterval(item.y),
                rotate: convergenceToInterval(item.rotate),
            });
        }

        if (data.length === 0) {
            return;
        }

        historyRecordOperateProxy.doRotate(data);
        syncGroupCoordinate();
        const geometryPatches = data.map((item) => {
            const patch: Partial<LayerBox> & {id: string} = {
                id: item.id!,
                rotate: item.rotate,
            };

            if (item.x !== undefined) {
                patch.x = item.x;
            }

            if (item.y !== undefined) {
                patch.y = item.y;
            }

            return patch;
        });
        refreshCommittedGeometry(geometryPatches);

        if (data.length === 1) {
            baseInfoStore.updateBaseConfig(data[0]);
        }
    };

    const requestDrag = (params: DesignerInteractionRequestParams) => {
        const ids = resolveTransformIds(eventOperateStore.targetIds);
        const currentLayerConfigs = getLayerConfigs();

        if (ids.length === 0) {
            return;
        }

        const groupCoordinate = calculateLayerIdsBounds(ids, currentLayerConfigs);
        if (!groupCoordinate)
            return;
        const dx = params.x == null ? 0 : params.x - groupCoordinate.minX;
        const dy = params.y == null ? 0 : params.y - groupCoordinate.minY;

        if (dx === 0 && dy === 0) {
            return;
        }

        commitDrag(ids.map((id) => {
            const layer = currentLayerConfigs[id];
            return {
                id,
                x: (layer.x ?? 0) + dx,
                y: (layer.y ?? 0) + dy,
            };
        }));
    };

    const requestResize = (params: DesignerInteractionRequestParams) => {
        const ids = resolveTransformIds(eventOperateStore.targetIds);
        const currentLayerConfigs = getLayerConfigs();

        if (ids.length === 0) {
            return;
        }

        const direction = params.direction ?? [1, 1];

        const directSelectionId = eventOperateStore.targetIds.length === 1
            ? eventOperateStore.targetIds[0]
            : null;
        const isSingleDirectLayer = ids.length === 1
            && directSelectionId === ids[0]
            && currentLayerConfigs[directSelectionId]?.type !== "group";
        if (isSingleDirectLayer) {
            const id = ids[0];
            const layer = currentLayerConfigs[id];

            if (!layer) {
                return;
            }

            const width = Math.max(1, params.offsetWidth ?? layer.width ?? 1);
            const height = Math.max(1, params.offsetHeight ?? layer.height ?? 1);

            commitResize([{
                id,
                x: (layer.x ?? 0) + (direction[0] === -1 ? (layer.width ?? width) - width : 0),
                y: (layer.y ?? 0) + (direction[1] === -1 ? (layer.height ?? height) - height : 0),
                width,
                height,
            }]);
            return;
        }

        const groupCoordinate = calculateLayerIdsBounds(ids, currentLayerConfigs);
        if (!groupCoordinate)
            return;
        const width = Math.max(1, params.offsetWidth ?? groupCoordinate.width);
        const height = Math.max(1, params.offsetHeight ?? groupCoordinate.height);
        if (ids.length === 1) {
            const resizedLayer = calculateSingleLayerResizeToBounds(
                ids[0],
                currentLayerConfigs,
                width,
                height,
                direction,
            );
            if (resizedLayer)
                commitResize([resizedLayer]);
            return;
        }
        const x = direction[0] === -1 ? groupCoordinate.maxX - width : groupCoordinate.minX;
        const y = direction[1] === -1 ? groupCoordinate.maxY - height : groupCoordinate.minY;
        const scaleX = groupCoordinate.width === 0 ? 1 : width / groupCoordinate.width;
        const scaleY = groupCoordinate.height === 0 ? 1 : height / groupCoordinate.height;

        commitResize(ids.map((id) => {
            const layer = currentLayerConfigs[id];
            const layerWidth = layer.width ?? 1;
            const layerHeight = layer.height ?? 1;

            return {
                id,
                x: x + ((layer.x ?? groupCoordinate.minX) - groupCoordinate.minX) * scaleX,
                y: y + ((layer.y ?? groupCoordinate.minY) - groupCoordinate.minY) * scaleY,
                width: Math.max(1, layerWidth * scaleX),
                height: Math.max(1, layerHeight * scaleY),
            };
        }));
    };

    const getReadonlySelectionLayers = (): LayerBox[] => {
        const currentLayerConfigs = getLayerConfigs();
        const readonlyLayers: LayerBox[] = [];
        const addedIds = new Set<string>();

        const addLayer = (layer: LayerBox | null) => {
            if (!layer || addedIds.has(layer.id))
                return;
            addedIds.add(layer.id);
            readonlyLayers.push(layer);
        };

        eventOperateStore.targetIds.forEach((selectionId) => {
            const visibleLeafIds = expandSelectionTreeIds([selectionId], currentLayerConfigs).filter((id) => {
                return currentLayerConfigs[id]?.type !== "group" && !isEffectivelyHidden(id, currentLayerConfigs);
            });
            if (visibleLeafIds.length === 0)
                return;

            if (isEffectivelyLocked(selectionId, currentLayerConfigs)) {
                if (currentLayerConfigs[selectionId]?.type === "group") {
                    const bounds = calculateLayerIdsBounds(visibleLeafIds, currentLayerConfigs);
                    if (bounds) {
                        addLayer({
                            id: selectionId,
                            x: bounds.minX,
                            y: bounds.minY,
                            width: bounds.width,
                            height: bounds.height,
                            rotate: 0,
                        });
                    }
                } else {
                    addLayer(toLayerBox(currentLayerConfigs[selectionId]));
                }
                return;
            }

            visibleLeafIds
                .filter((id) => isEffectivelyLocked(id, currentLayerConfigs))
                .forEach((id) => addLayer(toLayerBox(currentLayerConfigs[id])));
        });

        return readonlyLayers;
    };

    const prepareCanvasContextMenu = (
        engine: InteractionEngine,
        position: [number, number],
    ): CanvasMenuCandidate[] => {
        const currentLayerConfigs = getLayerConfigs();
        const pointedElement = document.elementFromPoint?.(position[0], position[1]);
        const layerRow = pointedElement?.closest<HTMLElement>(".layer-items [data-id]");
        const rowId = layerRow?.dataset.id;
        if (rowId && currentLayerConfigs[rowId]) {
            if (!eventOperateStore.targetIds.includes(rowId))
                eventOperateStore.setTargetIds([rowId], "layer-list");
            return [];
        }
        if (pointedElement?.closest(".datavisool-interaction-resize-box") && eventOperateStore.targetIds.length > 0)
            return [];

        const hitLayers = engine.queryLayersAtClientPoint({
            clientX: position[0],
            clientY: position[1],
        }).filter((layer) => !isEffectivelyHidden(layer.id, currentLayerConfigs));
        hitLayers.sort((left, right) => {
            return (currentLayerConfigs[right.id]?.order ?? 0) - (currentLayerConfigs[left.id]?.order ?? 0);
        });

        const nextIds = resolveContextMenuSelectionIds(
            hitLayers.map((layer) => layer.id),
            eventOperateStore.targetIds,
            currentLayerConfigs,
        );
        if (nextIds !== null)
            eventOperateStore.setTargetIds(nextIds, "canvas");

        return hitLayers.map((layer) => {
            const config = currentLayerConfigs[layer.id];
            const state = getEffectiveLayerState(layer.id, currentLayerConfigs);
            return {
                id: layer.id,
                name: config?.name?.trim() || "未命名图层",
                type: config?.type || "unknown",
                locked: state.locked,
            };
        });
    };

    const facade = useMemo<DesignerInteractionRef>(() => ({
        request: (ableName, params) => {
            if (ableName === "draggable") {
                requestDrag(params);
            } else if (ableName === "resizable") {
                requestResize(params);
            }
        },
        isInteractionElement: (target) => target instanceof Element && Boolean(target.closest(".datavisool-interaction-resize-box")),
        dragStart: () => undefined,
        refreshOverlay: () => engineRef.current?.refreshResizeOverlay(),
        refreshLayerGeometry: (ids?: string[]) => {
            const engine = engineRef.current;
            if (ids === undefined) {
                layerCacheRef.current = null;
                layerIndexVersionRef.current += 1;
                engine?.invalidateLayerIndex();
            }
            return engine?.refreshLayerGeometry(ids);
        },
    }), []);

    useEffect(() => {
        const container = eventOperateStore.dsContentRef ?? document.getElementById("designer-ds-content");

        if (!container) {
            return undefined;
        }

        const eventContainer = container.closest<HTMLElement>(".designer-ds-container") ?? container;

        const engine = new InteractionEngine({
            container,
            eventContainer,
            coordinateContainer: container,
            overlayContainer: container,
            getScale: () => eventOperateStore.scale,
            getLayers: getInteractiveLayers,
            getLayerIndexVersion,
            getLayerById: (id) => toLayerBox(getLayerConfigs()[id]),
            getSelectedIds: () => eventOperateStore.targetIds,
            getReadonlySelectionLayers,
            getElementById: (id) => document.getElementById(id),
            getBoxSelectionMode: () => window.DATAVISOOL_ENV.currentManager.canvasManager?.canvasConfig.boxSelectionMode ?? 'intersect',
            isAdditiveSelectionActive: (event) => isShortcutActive(SHORTCUT_ACTION_IDS.SELECTION_TOGGLE, event),
            isBoxSelectionStartActive: (event) => isShortcutActive(SHORTCUT_ACTION_IDS.BOX_SELECTION_START, event),
            resolveBoxSelectionMode: (event) => {
                if (isShortcutActive(SHORTCUT_ACTION_IDS.BOX_SELECTION_CONTAIN, event))
                    return 'contain';
                return window.DATAVISOOL_ENV.currentManager.canvasManager?.canvasConfig.boxSelectionMode ?? 'intersect';
            },
            isAxisLockActive: (event) => isShortcutActive(SHORTCUT_ACTION_IDS.AXIS_LOCK, event),
            resolveHitTarget: ({candidates}) => {
                let topmostId: string | null = null;
                let topmostOrder = -Infinity;
                const currentLayerConfigs = getLayerConfigs();

                for (const candidate of candidates) {
                    const layer = currentLayerConfigs[candidate.id];

                    if (!layer || !isCanvasSelectable(candidate.id, currentLayerConfigs)) {
                        continue;
                    }

                    const order = layer.order ?? 0;

                    if (order >= topmostOrder) {
                        topmostOrder = order;
                        topmostId = candidate.id;
                    }
                }

                return topmostId;
            },
            resolveSelectionIds: ({hitId, selectedIds: currentSelectedIds, additive, event}) => {
                if (!hitId) {
                    return additive ? currentSelectedIds : [];
                }
                const currentLayerConfigs = getLayerConfigs();
                const hitIds = resolvePointSelectionIds(hitId, currentLayerConfigs, {
                    deep: isShortcutActive(SHORTCUT_ACTION_IDS.SELECTION_DEEP, event),
                });
                return additive
                    ? toggleSelectionIds(currentSelectedIds, hitIds, currentLayerConfigs)
                    : hitIds;
            },
            resolveBoxSelectionIds: ({candidateIds, selectedIds: currentSelectedIds, additive, event}) => {
                const currentLayerConfigs = getLayerConfigs();
                const orderedCandidateIds = candidateIds
                    .sort((prev, next) => (currentLayerConfigs[prev]?.order ?? 0) - (currentLayerConfigs[next]?.order ?? 0));
                const resolvedIds = resolveBoxSelectionIds(orderedCandidateIds, currentLayerConfigs, {
                    deep: isShortcutActive(SHORTCUT_ACTION_IDS.SELECTION_DEEP, event),
                });
                return additive
                    ? toggleSelectionIds(currentSelectedIds, resolvedIds, currentLayerConfigs)
                    : resolvedIds;
            },
            resolveTransformTargetIds: ({selectedIds: currentSelectedIds}) => resolveTransformIds(currentSelectedIds),
            resolveSnapCandidateIds: ({activeIds, candidateIds}) => {
                const activeIdSet = new Set(activeIds);
                const currentLayerConfigs = getLayerConfigs();

                return candidateIds.filter((id) => {
                    const layer = currentLayerConfigs[id];
                    return Boolean(layer && !isEffectivelyHidden(id, currentLayerConfigs) && !activeIdSet.has(id));
                });
            },
            getSnapOptions: () => ({
                mode: window.DATAVISOOL_ENV.currentManager.layerManager?.enableAdsorption ? "nearby" : "off",
                threshold: 5,
                candidateRange: 200,
            }),
            getSnapReferencePoints: getCanvasSnapReferencePoints,
            getDragStep: () => {
                const canvasConfig = window.DATAVISOOL_ENV.currentManager.canvasManager?.canvasConfig;
                return canvasConfig?.rasterize ? canvasConfig.dragStep ?? 1 : 1;
            },
            getResizeStep: () => {
                const canvasConfig = window.DATAVISOOL_ENV.currentManager.canvasManager?.canvasConfig;
                return canvasConfig?.rasterize ? canvasConfig.resizeStep ?? 1 : 1;
            },
            minResizeWidth: 1,
            minResizeHeight: 1,
            selectionThreshold: 4,
            spatialIndexBucketSize: 220,
            onSelect: applySelection,
            onDragEnd: commitDrag,
            onResizeBatchCommit: commitResize,
            onRotateBatchCommit: commitRotate,
        });

        engineRef.current = engine;
        eventOperateStore.setInteractionRef(facade);
        contextMenuStore.setCanvasMenuPrepare((position) => prepareCanvasContextMenu(engine, position));
        engine.mount();

        return () => {
            engine.destroy();
            engineRef.current = null;
            eventOperateStore.setInteractionRef(null);
            contextMenuStore.setCanvasMenuPrepare(null);
        };
    }, [facade]);

    useEffect(() => {
        layerCacheRef.current = null;
        layerIndexVersionRef.current += 1;
        engineRef.current?.invalidateLayerIndex();
        engineRef.current?.refreshResizeOverlay();

        const warmupTimer = window.setTimeout(() => {
            const engine = engineRef.current;

            if (!engine) {
                return;
            }

            const layers = getInteractiveLayers();

            if (layers.length > 0) {
                engine.rebuildLayerIndex(layers);
            }
        }, 0);

        return () => window.clearTimeout(warmupTimer);
    }, [layerConfigs, layerCount, canvasManager?.canvasConfig?.rasterize, canvasManager?.canvasConfig?.dragStep, canvasManager?.canvasConfig?.resizeStep]);

    useEffect(() => {
        engineRef.current?.refreshResizeOverlay();
    }, [selectedIds]);

    return <>{children}</>;
});

function toLayerBox(layer: ILayerItem | null | undefined): LayerBox | null {
    if (!layer?.id || layer.type === "group" || !document.getElementById(layer.id)) {
        return null;
    }

    return {
        id: layer.id,
        x: finiteNumber(layer.x, 0),
        y: finiteNumber(layer.y, 0),
        width: Math.max(0, finiteNumber(layer.width, 0)),
        height: Math.max(0, finiteNumber(layer.height, 0)),
        rotate: finiteNumber(layer.rotate, 0),
    };
}

function finiteNumber(value: number | undefined, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function applyDefinedGeometryPatch(layer: LayerBox, patch: Partial<LayerBox>) {
    if (patch.x !== undefined) {
        layer.x = patch.x;
    }

    if (patch.y !== undefined) {
        layer.y = patch.y;
    }

    if (patch.width !== undefined) {
        layer.width = patch.width;
    }

    if (patch.height !== undefined) {
        layer.height = patch.height;
    }

    if (patch.rotate !== undefined) {
        layer.rotate = patch.rotate;
    }
}

export default DesignerInteractionEngine;
