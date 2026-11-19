/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {LayerCanvas} from './LayerConsumer.ts';

import {createElement, Fragment, type ReactElement} from 'react';
import type {EditorLayerNode} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import LayerItem from './item/LayerItem.tsx';
import LayerGroupItem from './item/LayerGroupItem.tsx';
import type {LayerDragHandleProps, LayerProps} from './item/BaseLayer.tsx';
import type {EditorLayersState, LayerSelectionModifiers} from './EditorLayersState.ts';

export interface LayerRenderActions extends LayerDragHandleProps {
    readonly canvas: LayerCanvas;
    readonly state: EditorLayersState;
    readonly onSelect: (id: string, event: LayerSelectionModifiers) => void;
    readonly onToggleLock: (id: string, locked: boolean) => void;
    readonly onToggleHide: (id: string, hidden: boolean) => void;
    readonly onRename: (id: string, name: string) => void;
}

export function buildLayerList(
    layers: readonly EditorLayerNode[],
    selectedIds: readonly string[],
    actions: LayerRenderActions,
): ReactElement[] {
    const warnedMessages = new Set<string>();
    const warn = (message: string) => {
        if (warnedMessages.has(message)) return;
        warnedMessages.add(message);
        console.warn(`[LayerRender] ${message}`);
    };

    const buildLayer = (layer: EditorLayerNode, renderPath: Set<string>): ReactElement => {
        const id = layer.id;
        if (id && renderPath.has(id)) {
            warn(`Detected circular children tree while rendering layer list, layerId=${id}`);
            return createElement(Fragment, {key: `layer-cycle-${id}`});
        }
        const nextPath = new Set(renderPath);
        if (id) nextPath.add(id);
        const props: LayerProps & LayerDragHandleProps = {
            canvas: actions.canvas,
            name: layer.name,
            lock: layer.lock,
            hide: layer.hide,
            effectiveLock: layer.effectiveLocked,
            effectiveHide: layer.effectiveHidden,
            compId: id,
            type: layer.type,
            selected: Boolean(id && selectedIds.includes(id)),
            expanded: Boolean(id && actions.state.isGroupExpanded(id)),
            onDragHandleMouseDown: actions.onDragHandleMouseDown,
            onSelect: actions.onSelect,
            onToggleLock: actions.onToggleLock,
            onToggleHide: actions.onToggleHide,
            onRename: actions.onRename,
            onToggleExpanded: actions.state.toggleGroup,
            onRegisterRow: actions.state.registerRow,
        };
        if (layer.type !== 'group') return createElement(LayerItem, {...props, key: id});

        const children = (layer.children ?? []).map(child => {
            if (child.id && nextPath.has(child.id)) {
                warn(`Skipped circular group child while rendering layers, layerId=${child.id}`);
                return createElement(Fragment, {key: `layer-cycle-child-${child.id}`});
            }
            return buildLayer(child, nextPath);
        });
        return createElement(LayerGroupItem, {...props, key: id}, ...children);
    };

    return layers.map(layer => buildLayer(layer, new Set()));
}
