/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AnchorPointType, DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import type {IBluePrintManager} from '@datavisool/sdk/types';
import type {EventOperateStore} from '@/plugins/editor-canvas/state/EventOperateStore.ts';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {createEditingScene, disposeEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';
import {HistoryRecordOperateProxy} from '@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts';
import {createSelectionCommands} from '@/plugins/editor-canvas/selection/SelectionCommands.ts';
import {EditorCanvasActivationState} from '@/plugins/editor-canvas/state/EditorCanvasActivationState.ts';

const contexts = new Set<DesignerRuntimeContext>();
const scenes = new Set<ReturnType<typeof createEditingScene>>();

afterEach(() => {
    scenes.forEach(scene => disposeEditingScene(scene));
    scenes.clear();
    contexts.forEach(context => context.dispose());
    contexts.clear();
    vi.restoreAllMocks();
});

function createFixture(options: {
    canWrite?: () => boolean;
    canRecord?: () => boolean;
    onDeleteStart?: () => void;
} = {}) {
    const canWrite = options.canWrite ?? (() => true);
    const canRecord = options.canRecord ?? (() => true);
    const runtimeContext = new DesignerRuntimeContext();
    contexts.add(runtimeContext);
    const manager = new DesignerManager(DesignerScene.DEFAULT, runtimeContext);
    manager.init({
        layerManager: {
            layerHeader: 'hidden-group',
            layerTail: 'visible',
            layerConfigs: {
                'hidden-group': {
                    id: 'hidden-group', type: 'group', name: 'Hidden group', hide: true,
                    childHeader: 'hidden-child', childTail: 'hidden-child', next: 'visible',
                },
                'hidden-child': {
                    id: 'hidden-child', type: 'BaseText', name: 'Hidden child', pid: 'hidden-group',
                    x: 0, y: 0, width: 100, height: 30,
                },
                visible: {
                    id: 'visible', type: 'BaseText', name: 'Visible', prev: 'hidden-group',
                    x: 120, y: 0, width: 100, height: 30,
                },
            },
            elemConfigs: {
                'hidden-child': {base: {id: 'hidden-child', type: 'BaseText', name: 'Hidden child'}},
                visible: {base: {id: 'visible', type: 'BaseText', name: 'Visible'}},
            },
        },
    } as any, DesignerMode.EDIT);
    const page: IBluePrintManager = {
        pageId: 'page',
        pageName: 'Page',
        bpNodeLayoutMap: {
            'hidden-group': {id: 'hidden-group', type: 'BPLayerNode', x: 0, y: 0},
            'hidden-child': {id: 'hidden-child', type: 'BPLayerNode', x: 0, y: 80},
            visible: {id: 'visible', type: 'BPLayerNode', x: 140, y: 0},
        },
        bpNodeConfigMap: {
            'hidden-group': {id: 'hidden-group', type: 'BPLayerNode'},
            'hidden-child': {id: 'hidden-child', type: 'BPLayerNode'},
            visible: {id: 'visible', type: 'BPLayerNode'},
        },
        bpLines: {
            edge: {
                id: 'edge',
                startAnchorId: `hidden-child:click:${AnchorPointType.OUTPUT}`,
                endAnchorId: `visible:click:${AnchorPointType.INPUT}`,
            },
        },
        bpAPMap: {},
        bpAPLineMap: {},
    };
    manager.bluePrintManager.replacePages([page]);
    runtimeContext.managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
    const scene = createEditingScene(
        manager,
        runtimeContext.managerStore.sceneVersion,
        () => manager.isRuntimeActive(),
        undefined,
        undefined,
        canWrite,
    );
    scenes.add(scene);

    let selection = {ids: [] as string[], source: 'layer-list' as const};
    const eventOperateStore = {
        get targetIds() { return [...selection.ids]; },
        get selectionSource() { return selection.source; },
        setTargetIds: vi.fn((ids: readonly string[], source: 'layer-list' | 'system' = 'system') => {
            if (!canWrite()) return;
            selection = {ids: [...ids], source};
        }),
        emitInspectorChange: vi.fn(() => options.onDeleteStart?.()),
        focusDesignerCanvas: vi.fn(),
    };
    const history = new HistoryOperator(() => [], () => undefined, () => canRecord() && canWrite() && scene.isActive());
    const historyProxy = new HistoryRecordOperateProxy({
        eventOperateStore: eventOperateStore as unknown as EventOperateStore,
        history,
        readScene: () => scene,
        isActive: () => canWrite() && scene.isActive(),
    });
    const commands = createSelectionCommands({
        eventOperateStore: eventOperateStore as unknown as EventOperateStore,
        historyProxy,
        readScene: () => scene,
        isActive: () => scene.isActive(),
    });
    return {
        manager,
        scene,
        history,
        select(ids: string[]) { selection = {ids, source: 'layer-list'}; },
        commands,
    };
}

describe('hidden layer deletion and blueprint history', () => {
    it('deletes an explicitly selected hidden group and its full blueprint subtree', () => {
        const {manager, scene, history, select, commands} = createFixture();
        select(['hidden-group']);

        commands.doDelete();

        expect(manager.layerManager.layerConfigs['hidden-group']).toBeUndefined();
        expect(manager.layerManager.layerConfigs['hidden-child']).toBeUndefined();
        expect(manager.layerManager.layerConfigs.visible).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap).toEqual({visible: expect.any(Object)});
        expect(scene.blueprints.read()!.pages[0].bpLines).toEqual({});

        expect(history.undo(() => undefined)).toBe(true);
        expect(manager.layerManager.layerConfigs['hidden-group']).toBeDefined();
        expect(manager.layerManager.layerConfigs['hidden-child']).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-group']).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-child']).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpLines.edge).toBeDefined();
        expect(history.redo(() => undefined)).toBe(true);
        expect(manager.layerManager.layerConfigs['hidden-child']).toBeUndefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-child']).toBeUndefined();
    });

    it('deletes a hidden group subtree together with a visible row in a mixed selection', () => {
        const {manager, scene, history, select, commands} = createFixture();
        select(['hidden-group', 'visible']);

        commands.doDelete();

        expect(manager.layerManager.layerConfigs['hidden-group']).toBeUndefined();
        expect(manager.layerManager.layerConfigs['hidden-child']).toBeUndefined();
        expect(manager.layerManager.layerConfigs.visible).toBeUndefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-group']).toBeUndefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-child']).toBeUndefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap.visible).toBeUndefined();
        expect(history.undo(() => undefined)).toBe(true);
        expect(manager.layerManager.layerConfigs['hidden-group']).toBeDefined();
        expect(manager.layerManager.layerConfigs['hidden-child']).toBeDefined();
        expect(manager.layerManager.layerConfigs.visible).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-group']).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-child']).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap.visible).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpLines.edge).toBeDefined();
    });

    it('allows deleting an explicitly selected hidden child while retaining its group', () => {
        const {manager, scene, history, select, commands} = createFixture();
        select(['hidden-child']);

        commands.doDelete();

        expect(manager.layerManager.layerConfigs['hidden-group']).toBeDefined();
        expect(manager.layerManager.layerConfigs['hidden-child']).toBeUndefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-group']).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-child']).toBeUndefined();
        expect(scene.blueprints.read()!.pages[0].bpLines.edge).toBeUndefined();
        expect(history.undo(() => undefined)).toBe(true);
        expect(manager.layerManager.layerConfigs['hidden-child']).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-child']).toBeDefined();
        expect(scene.blueprints.read()!.pages[0].bpLines.edge).toBeDefined();
    });

    it('rolls back blueprint removal when canvas pauses before the layer snapshot commits', () => {
        const lifecycle = new EditorCanvasActivationState();
        let pauseOnNextDelete = true;
        const fixture = createFixture({
            canWrite: () => lifecycle.canEdit(() => true),
            onDeleteStart: () => {
                if (!pauseOnNextDelete) return;
                pauseOnNextDelete = false;
                lifecycle.pause();
            },
        });
        const {manager, scene, select, commands} = fixture;
        const beforeLayers = manager.layerManager.getData();
        const beforeBlueprints = scene.blueprints.read()!.pages;
        select(['hidden-group']);

        commands.doDelete();

        expect(manager.layerManager.getData()).toEqual(beforeLayers);
        expect(scene.blueprints.read()!.pages).toEqual(beforeBlueprints);

        lifecycle.resume();
        commands.doDelete();
        expect(manager.layerManager.layerConfigs['hidden-group']).toBeUndefined();
        expect(manager.layerManager.layerConfigs['hidden-child']).toBeUndefined();
        expect(scene.blueprints.read()!.pages[0].bpNodeLayoutMap['hidden-child']).toBeUndefined();
    });

    it('restores both models when history rejects a completed delete change', () => {
        const {manager, scene, select, commands} = createFixture({canRecord: () => false});
        const beforeLayers = manager.layerManager.getData();
        const beforeBlueprints = scene.blueprints.read()!.pages;
        select(['hidden-group']);

        commands.doDelete();

        expect(manager.layerManager.getData()).toEqual(beforeLayers);
        expect(scene.blueprints.read()!.pages).toEqual(beforeBlueprints);
    });

    it('restores blueprint pages if delete throws after removing their nodes', () => {
        const {manager, scene, select, commands} = createFixture({
            onDeleteStart: () => { throw new Error('inspector listener failed'); },
        });
        const beforeLayers = manager.layerManager.getData();
        const beforeBlueprints = scene.blueprints.read()!.pages;
        select(['hidden-group']);

        expect(() => commands.doDelete()).toThrow('inspector listener failed');
        expect(manager.layerManager.getData()).toEqual(beforeLayers);
        expect(scene.blueprints.read()!.pages).toEqual(beforeBlueprints);
    });
});
