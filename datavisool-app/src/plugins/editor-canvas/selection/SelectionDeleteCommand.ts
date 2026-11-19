/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {HistoryRecordOperateProxy} from '@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts';

export function createDeleteSelectionTreeWithHistory({historyProxy, readScene, isActive}: {
    readonly historyProxy: HistoryRecordOperateProxy;
    readScene(): DesignerEditingScene | undefined;
    isActive(): boolean;
}) {
    return (ids: readonly string[]): boolean => {
        const scene = isActive() ? readScene() : undefined;
        const snapshot = scene?.layers.read();
        if (!scene || !snapshot || ids.length === 0) return false;
        const targetIds = [...new Set(ids)].filter(id => Boolean(snapshot.layers[id]));
        if (targetIds.length === 0) return false;
        historyProxy.doDelete(targetIds);
        return isActive() && readScene() === scene;
    };
}
