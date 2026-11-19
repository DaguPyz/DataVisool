/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {CanvasRepairAnalysis, EditorCanvasRepairService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {ILayerItem} from '@datavisool/sdk/types';
import {cloneDeep} from 'lodash';
import LayerRepairUtil from '@/plugins/editor-canvas/layers/LayerRepairUtil.ts';
import type {HistoryRecordOperateProxy} from '@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';

interface CanvasRepairOptions {
    readonly history: HistoryRecordOperateProxy;
    readonly scene: DesignerEditingScene;
    readScene(): DesignerEditingScene | undefined;
    canEdit(): boolean;
    select(ids: readonly string[], interaction?: {readonly kind: 'inspect'; readonly id: string}): void;
    deleteLayersByIds(ids: string[]): boolean;
}

export function createCanvasRepairService({history, scene, readScene, canEdit, select, deleteLayersByIds}: CanvasRepairOptions): EditorCanvasRepairService {
    const getSnapshot = (sceneVersion: number) => {
        if (readScene() !== scene || !scene.identity || !scene.isActive() || scene.version !== sceneVersion) return;
        const snapshot = scene.layers.read();
        return snapshot?.sceneIdentity && snapshot.sceneIdentity === scene.identity && snapshot.sceneVersion === sceneVersion
            ? {scene, snapshot}
            : undefined;
    };
    const scan = (sceneVersion: number) => {
        const current = getSnapshot(sceneVersion);
        if (!current) return;
        const layers = current.snapshot.layers as Record<string, ILayerItem>;
        return LayerRepairUtil.scanCanvasRepairAnalysis({
            layerConfigs: layers,
            layerHeader: current.snapshot.layerHeader,
            layerTail: current.snapshot.layerTail,
        });
    };
    const normalizeTargetIds = (analysis: CanvasRepairAnalysis, layerIds: readonly string[]) => {
        const targetIdSet = new Set((layerIds.length > 0 ? layerIds : analysis.orphanIds).filter(Boolean));
        return analysis.orphanIds.filter(id => targetIdSet.has(id));
    };
    const readRepairAnalysis = (sceneVersion: number): CanvasRepairAnalysis | undefined => {
        const analysis = scan(sceneVersion);
        return analysis ? cloneDeep(analysis) : undefined;
    };
    const readRepairLayer = (sceneVersion: number, layerId: string): ILayerItem | undefined => {
        const layer = getSnapshot(sceneVersion)?.snapshot.layers?.[layerId];
        return layer ? cloneDeep(layer) : undefined;
    };

    return {
        readRepairAnalysis,
        readRepairLayer,
        locateRepairLayer(sceneVersion, layerId) {
            if (!canEdit()) return false;
            const current = getSnapshot(sceneVersion);
            const layer = current?.snapshot.layers?.[layerId];
            if (!layer) return false;
            select([layerId], {kind: 'inspect', id: layerId});
            return Boolean(getSnapshot(sceneVersion));
        },
        deleteRepairOrphans(sceneVersion, layerIds) {
            if (!canEdit()) return false;
            const current = getSnapshot(sceneVersion);
            const analysis = scan(sceneVersion);
            if (!current || !analysis) return false;
            const targetIds = normalizeTargetIds(analysis, layerIds)
                .filter(id => Boolean(current.snapshot.layers?.[id]));
            if (targetIds.length === 0) return false;
            return deleteLayersByIds(targetIds) && Boolean(getSnapshot(sceneVersion));
        },
        prependRepairOrphans(sceneVersion, layerIds) {
            if (!canEdit()) return false;
            const current = getSnapshot(sceneVersion);
            const analysis = scan(sceneVersion);
            if (!current || !analysis) return false;
            const targetIds = normalizeTargetIds(analysis, layerIds)
                .filter(id => Boolean(current.snapshot.layers?.[id]));
            if (targetIds.length === 0) return false;
            history.doRepairOrphansPrepend(targetIds);
            return Boolean(getSnapshot(sceneVersion));
        },
        repairTailPointer(sceneVersion) {
            if (!canEdit()) return false;
            const current = getSnapshot(sceneVersion);
            const analysis = scan(sceneVersion);
            if (!current || !analysis?.renderTailId || analysis.layerTail === analysis.renderTailId) return false;
            history.doRepairTailPointer(analysis.renderTailId);
            return Boolean(getSnapshot(sceneVersion));
        },
    };
}
