/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EditorLayerDomain, EditorLayerNode} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {ILayerItem} from '@datavisool/sdk/types';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {HistoryRecordOperateProxy} from '@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts';
import LayerUtil from '@/plugins/editor-canvas/layers/LayerUtil.ts';
import {getEffectiveLayerState} from '@/plugins/editor-canvas/selection/SelectionPolicy.ts';
import {buildLayerTree} from '@/shared/designer/buildLayerTree.ts';

interface EditorLayerDomainOptions {
    readonly scene: DesignerEditingScene;
    readonly history: HistoryRecordOperateProxy;
    isActive(): boolean;
}

const deepFreeze = <T>(value: T, seen = new WeakSet<object>()): T => {
    if (!value || typeof value !== 'object' || seen.has(value as object)) return value;
    seen.add(value as object);
    Object.values(value as Record<string, unknown>).forEach(item => deepFreeze(item, seen));
    return Object.freeze(value);
};

/** Read detached scene DTOs and route edits through the canvas' unified model history. */
export function createEditorLayerDomain({scene, history, isActive}: EditorLayerDomainOptions): EditorLayerDomain {
    const readSnapshot = () => {
        if (!isActive() || !scene.isActive()) return;
        const snapshot = scene.layers.read();
        return snapshot?.sceneIdentity === scene.identity && snapshot.sceneVersion === scene.version ? snapshot : undefined;
    };
    const readTree = () => {
        const snapshot = readSnapshot();
        if (!snapshot) return Object.freeze([]) as readonly EditorLayerNode[];
        const layers = snapshot.layers as Record<string, ILayerItem>;
        const freezeTree = (source: ILayerItem): EditorLayerNode => {
            const effective = getEffectiveLayerState(source.id ?? '', layers);
            const children = source.children?.map(freezeTree);
            return deepFreeze({...source, effectiveHidden: effective.hidden, effectiveLocked: effective.locked, children}) as EditorLayerNode;
        };
        return Object.freeze(buildLayerTree(layers, snapshot.layerHeader, 'desc').map(freezeTree));
    };
    const readLayer = (id: string) => {
        const visit = (layers: readonly EditorLayerNode[]): EditorLayerNode | undefined => {
            for (const layer of layers) {
                if (layer.id === id) return layer;
                const child = layer.children && visit(layer.children);
                if (child) return child;
            }
            return undefined;
        };
        return isActive() ? visit(readTree()) : undefined;
    };
    const domain: EditorLayerDomain = {
        sceneVersion: scene.version,
        isActive: () => Boolean(readSnapshot()),
        readTree,
        readLayer,
        readCanvasSize() {
            const canvas = readSnapshot()?.canvas;
            const width = Number(canvas?.width);
            const height = Number(canvas?.height);
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
            return Object.freeze({width, height});
        },
        rename(id, name) {
            if (!readSnapshot()) return false;
            const layer = readLayer(id);
            const next = name.trim();
            if (!layer || !next || layer.name === next) return false;
            return history.doLayerRename(id, next);
        },
        setHidden(id, hidden) {
            const snapshot = readSnapshot();
            const layers = snapshot?.layers as Record<string, ILayerItem> | undefined;
            const layer = layers?.[id];
            if (!layer || Boolean(layer.hide) === hidden) return false;
            const ids = layer.type === 'group'
                ? LayerUtil.findAllChildLayer([id], true, layers)
                : [id];
            history.doHideUpd(ids, hidden);
            const updated = readSnapshot()?.layers as Record<string, ILayerItem> | undefined;
            return Boolean(updated && ids.every(targetId => Boolean(updated[targetId]?.hide) === hidden));
        },
        setLocked(id, locked) {
            const snapshot = readSnapshot();
            const layers = snapshot?.layers as Record<string, ILayerItem> | undefined;
            const layer = layers?.[id];
            if (!layer || Boolean(layer.lock) === locked) return false;
            const ids = layer.type === 'group'
                ? LayerUtil.findAllChildLayer([id], true, layers)
                : [id];
            history.doLockUpd(ids.map(targetId => ({id: targetId, lock: locked})));
            const updated = readSnapshot()?.layers as Record<string, ILayerItem> | undefined;
            return Boolean(updated && ids.every(targetId => Boolean(updated[targetId]?.lock) === locked));
        },
        reorder(sourceId, targetId, position) {
            const beforeSnapshot = readSnapshot();
            const beforeLayers = beforeSnapshot?.layers as Record<string, ILayerItem> | undefined;
            if (!beforeLayers?.[sourceId] || !beforeLayers[targetId] || sourceId === targetId
                || LayerUtil.isTargetChild(targetId, sourceId, beforeLayers)) return false;
            const before = [sourceId, targetId].map(id => {
                const layer = beforeLayers[id];
                return [layer.prev, layer.next, layer.pid] as const;
            });
            history.layerDragMove(sourceId, targetId, position);
            const afterSnapshot = readSnapshot();
            const afterLayers = afterSnapshot?.layers as Record<string, ILayerItem> | undefined;
            if (!afterLayers || afterSnapshot?.sceneVersion !== beforeSnapshot?.sceneVersion) return false;
            const after = [sourceId, targetId].map(id => {
                const layer = afterLayers[id];
                return [layer.prev, layer.next, layer.pid] as const;
            });
            return JSON.stringify(before) !== JSON.stringify(after);
        },
    };
    return Object.freeze(domain);
}
