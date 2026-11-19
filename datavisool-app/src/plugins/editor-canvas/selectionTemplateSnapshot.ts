/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {cloneDeep} from 'lodash';
import type {
    EditorSelection,
    EditorSelectionTemplateSnapshot,
} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {resolveCommandTargetIds} from '@/plugins/editor-canvas/selection/SelectionPolicy.ts';
import CoordinateUtil from '@/plugins/editor-canvas/layers/CoordinateUtil.ts';

/** Copy the selected layer tree from a scene-bound DTO into a detached template snapshot. */
export function readSelectionTemplateSnapshot(
    selection: EditorSelection,
    selectionSceneVersion: number,
    scene: DesignerEditingScene | undefined,
): EditorSelectionTemplateSnapshot | undefined {
    if (!scene || !scene.isActive() || scene.version !== selectionSceneVersion) return;
    const snapshot = scene.layers.read();
    if (!snapshot || snapshot.sceneIdentity !== scene.identity
        || snapshot.sceneVersion !== selectionSceneVersion) return;
    const layerConfigs = snapshot.layers as Record<string, import('@datavisool/sdk/types').ILayerItem>;
    const targetIds = resolveCommandTargetIds(selection.ids, layerConfigs, {
        allowLockedManagement: selection.source === 'layer-list'
            || selection.source === 'search'
            || selection.source === 'context-menu',
    });
    if (targetIds.length === 0) return;

    const baseCoordinate = CoordinateUtil.calculateGroupRectLT(targetIds, layerConfigs);
    const layers: EditorSelectionTemplateSnapshot['layers'] = {};
    const configs: EditorSelectionTemplateSnapshot['configs'] = {};
    targetIds.forEach(id => {
        const sourceLayer = layerConfigs[id];
        if (sourceLayer) {
            const layer = cloneDeep(sourceLayer);
            if (layer.type !== 'group') {
                layer.x = layer.x! - baseCoordinate.minX;
                layer.y = layer.y! - baseCoordinate.minY;
            }
            layer.lock = false;
            layers[id] = layer;
        }
        const config = snapshot.configs[id];
        if (config !== undefined) configs[id] = cloneDeep(config);
    });
    return {sceneVersion: selectionSceneVersion, layers, configs};
}
