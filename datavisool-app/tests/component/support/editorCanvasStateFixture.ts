/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {EditorCanvasActivationState} from '@/plugins/editor-canvas/state/EditorCanvasActivationState.ts';
import {EventOperateStore} from '@/plugins/editor-canvas/state/EventOperateStore.ts';
import {CanvasContextMenuStore} from '@/plugins/editor-canvas/context-menu/CanvasContextMenuStore.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';
import {ViewportStore} from '@/plugins/editor-canvas/viewport/ViewportStore.ts';

export function createEditorCanvasStateFixture() {
    const lifecycle = new EditorCanvasActivationState();
    const canEdit = () => lifecycle.canEdit(() => true);
    let scene = {identity: {}, version: 1, isActive: () => true};
    const contextMenuStore = new CanvasContextMenuStore(canEdit);
    const history = new HistoryOperator(() => [], () => undefined, canEdit);
    const eventOperateStore = new EventOperateStore({
        history,
        contextMenu: contextMenuStore,
        isActive: canEdit,
        readScene: () => scene as never,
        readLegacyModel: () => undefined,
        readLayerConfigs: () => ({}),
        readSelection: () => ({ids: [], source: 'system'}),
        writeSelection: () => undefined,
        publishLayerUi: () => undefined,
        publishInspector: () => undefined,
    });
    const viewportStore = new ViewportStore(canEdit);
    return {
        lifecycle,
        canEdit,
        contextMenuStore,
        eventOperateStore,
        history,
        viewportStore,
        readScene: () => scene,
        setScene(next: {identity: object; version: number; isActive(): boolean}) { scene = next; },
    };
}
