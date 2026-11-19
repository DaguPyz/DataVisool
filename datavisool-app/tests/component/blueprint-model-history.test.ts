/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it} from 'vitest';
import {cloneDeep} from 'lodash';
import type {DesignerBlueprintPage} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import {DesignerScene} from '@datavisool/sdk/types';
import {createEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import ManagerStore from '@/plugins/designer-runtime/internal/designer/manager/ManagerStore.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';

const managerStore = new ManagerStore();

const page = (id: string): DesignerBlueprintPage => ({
    pageId: id, pageName: id, bpNodeLayoutMap: {}, bpNodeConfigMap: {}, bpLines: {}, bpAPMap: {}, bpAPLineMap: {},
});

function createScene() {
    const manager = new class {
        scene = DesignerScene.DEFAULT;
        pages = ['a', 'b', 'c'].map(page);
        closed = false;
        bluePrintManager = {
            getData: () => {
                if (this.closed) throw new Error('A closed model must not be read.');
                return cloneDeep(this.pages);
            },
            replacePages: (pages: DesignerBlueprintPage[]) => { this.pages = cloneDeep(pages); },
        };
    };
    (manager as any).runtimeContext = {managerStore};
    managerStore.setCurrentManager(manager as never);
    let paused = false;
    const scene = createEditingScene(manager as never, managerStore.sceneVersion, () => !manager.closed,
        undefined, undefined, () => !paused);
    return {manager, scene, setPaused(value: boolean) { paused = value; }};
}

function variablePage(id: string): DesignerBlueprintPage {
    const startAnchorId = 'shared:gvDataChange:OUTPUT';
    const endAnchorId = 'sink:gvUpdateData:INPUT';
    return {
        ...page(id),
        bpNodeLayoutMap: {shared: {id: 'shared', type: 'BPGlobalVariableNode'}, sink: {id: 'sink', type: 'BPGlobalVariableNode'}},
        bpNodeConfigMap: {
            shared: {id: 'shared', type: 'BPGlobalVariable', name: 'shared', input: [], output: []},
            sink: {id: 'sink', type: 'BPGlobalVariable', name: 'sink', input: [], output: []},
        },
        bpLines: {edge: {id: 'edge', startAnchorId, endAnchorId}},
        bpAPMap: {[startAnchorId]: [endAnchorId]},
        bpAPLineMap: {[startAnchorId]: ['edge'], [endAnchorId]: ['edge']},
    };
}

function createVariableRemovalScene() {
    let paused = false;
    let rejectDelete = false;
    const createManager = (id: string, pages: DesignerBlueprintPage[], variableOwner?: any) => {
        const manager: any = {
            id,
            scene: id === 'loop' ? DesignerScene.LOOP_CONTAINER : DesignerScene.DEFAULT,
            variableOwner,
            pages: cloneDeep(pages),
            closed: false,
            bluePrintManager: {
                getData: () => {
                    if (manager.closed) throw new Error('A closed model must not be read.');
                    return cloneDeep(manager.pages);
                },
                replacePages: (next: DesignerBlueprintPage[]) => { manager.pages = cloneDeep(next); },
            },
            layerManager: {controllers: {}},
            canvasManager: {getData: () => ({width: 800, height: 600}), updateCanvasConfig: () => undefined},
            themeManager: {getData: () => [], updateThemeConfig: () => undefined},
            globalFilterManger: {getData: () => ({}), update: () => undefined},
            globalVariableManager: {globalVariableInstance: {} as Record<string, object>},
            isRuntimeActive: () => !manager.closed,
            getRuntimeGeneration: () => 1,
        };
        return manager;
    };
    const owner = createManager('owner', [variablePage('owner')]);
    owner.globalVariableManager.globalVariableInstance.shared = {id: 'shared', key: 'shared', bindTarget: [], reRender: false};
    owner.globalVariableManager.deleteGlobalVariable = (id: string) => {
        if (rejectDelete) {
            paused = true;
            return false;
        }
        if (!owner.globalVariableManager.globalVariableInstance[id]) return false;
        delete owner.globalVariableManager.globalVariableInstance[id];
        return true;
    };
    const loop = createManager('loop', [variablePage('loop')], owner);
    const contextManagerStore = {currentManager: loop, sceneVersion: 1};
    owner.runtimeContext = {managerStore: contextManagerStore};
    loop.runtimeContext = {managerStore: contextManagerStore};
    owner.layerManager.controllers.loop = {manager: loop};
    const scene = createEditingScene(loop as never, contextManagerStore.sceneVersion, () => !loop.closed,
        undefined, undefined, () => !paused);
    return {
        owner, loop, scene,
        rejectDelete(value: boolean) { rejectDelete = value; },
    };
}

afterEach(() => { managerStore.clear(); });

describe('scene-bound blueprint model history', () => {
    it.each(['a', 'b'])('restores and deletes a non-final page %s without duplicating later pages', id => {
        const {scene} = createScene();
        const before = scene.blueprints.read()!;
        const change = scene.blueprints.write(before.pages.filter(item => item.pageId !== id), before)!;
        const afterIds = ['a', 'b', 'c'].filter(item => item !== id);
        expect(scene.blueprints.read()!.pages.map(item => item.pageId)).toEqual(afterIds);
        expect(change.undo()).toBe(true);
        expect(scene.blueprints.read()!.pages.map(item => item.pageId)).toEqual(['a', 'b', 'c']);
        expect(change.redo()).toBe(true);
        expect(scene.blueprints.read()!.pages.map(item => item.pageId)).toEqual(afterIds);
    });

    it('restores page order in both directions', () => {
        const {scene} = createScene();
        const before = scene.blueprints.read()!;
        const change = scene.blueprints.write([...before.pages].reverse(), before)!;
        expect(change.undo()).toBe(true);
        expect(scene.blueprints.read()!.pages.map(item => item.pageId)).toEqual(['a', 'b', 'c']);
        expect(change.redo()).toBe(true);
        expect(scene.blueprints.read()!.pages.map(item => item.pageId)).toEqual(['c', 'b', 'a']);
    });

    it('binds changes to the scene identity and allows rollback while writes are paused', () => {
        const {scene, setPaused} = createScene();
        const before = scene.blueprints.read()!;
        const changedPages = before.pages.map((item, index) => index === 0 ? {...item, pageName: 'edited'} : item);
        const change = scene.blueprints.write(changedPages, before)!;

        expect(change.sceneIdentity).toBe(scene.identity);
        expect(change.sceneVersion).toBe(scene.version);
        expect(scene.blueprints.read()!.pages[0].pageName).toBe('edited');

        setPaused(true);
        const pausedSnapshot = scene.blueprints.read()!;
        expect(scene.blueprints.write(before.pages, pausedSnapshot)).toBeUndefined();
        expect(change.rollback()).toBe(true);
        expect(scene.blueprints.read()!.pages[0].pageName).toBe('a');
    });

    it('keeps the history cursor when a conflicting graph edit rejects undo', () => {
        const {scene} = createScene();
        const history = new HistoryOperator(() => []);
        const before = scene.blueprints.read()!;
        const first = before.pages.map((item, index) => index === 0 ? {...item, pageName: 'first'} : {...item});
        const change = scene.blueprints.write(first, before)!;
        history.recordChange(change);
        const latest = scene.blueprints.read()!;
        const conflict = latest.pages.map((item, index) => index === 0 ? {...item, pageName: 'external'} : {...item});
        scene.blueprints.write(conflict, latest);
        expect(history.undo(() => undefined)).toBe(false);
        expect(scene.blueprints.read()!.pages[0].pageName).toBe('external');
        const retry = scene.blueprints.read()!;
        scene.blueprints.write(first, retry);
        expect(history.undo(() => undefined)).toBe(true);
        expect(scene.blueprints.read()!.pages[0].pageName).toBe('a');
    });

    it('rejects stale history without reading an already closed model', () => {
        const {manager, scene} = createScene();
        const before = scene.blueprints.read()!;
        const change = scene.blueprints.write(before.pages.slice(1), before)!;
        manager.closed = true;
        managerStore.clear();
        expect(change.undo()).toBe(false);
        expect(change.redo()).toBe(false);
    });

    it('does not replay a model change after the manager context switches', () => {
        const {manager, scene} = createScene();
        const before = scene.blueprints.read()!;
        const change = scene.blueprints.write(before.pages.slice(1), before)!;
        const changedPages = cloneDeep(manager.pages);
        const nextManager = {bluePrintManager: {getData: () => []}};

        managerStore.setCurrentManager(nextManager as never);

        expect(change.rollback()).toBe(false);
        expect(change.undo()).toBe(false);
        expect(manager.pages).toEqual(changedPages);
    });

    it('removes a shared variable and its blueprint references from the owner and loop scenes', () => {
        const {owner, loop, scene} = createVariableRemovalScene();

        expect(scene.variables.remove('shared')).toBe(true);
        expect(owner.globalVariableManager.globalVariableInstance.shared).toBeUndefined();
        expect(owner.bluePrintManager.getData()[0].bpNodeLayoutMap.shared).toBeUndefined();
        expect(loop.bluePrintManager.getData()[0].bpNodeLayoutMap.shared).toBeUndefined();
        expect(owner.bluePrintManager.getData()[0].bpLines.edge).toBeUndefined();
        expect(loop.bluePrintManager.getData()[0].bpLines.edge).toBeUndefined();
    });

    it('rolls back owner and loop blueprint references if variable deletion fails during pause', () => {
        const {owner, loop, scene, rejectDelete} = createVariableRemovalScene();
        rejectDelete(true);

        expect(scene.variables.remove('shared')).toBe(false);
        expect(owner.globalVariableManager.globalVariableInstance.shared).toBeDefined();
        expect(owner.bluePrintManager.getData()[0].bpNodeLayoutMap.shared).toBeDefined();
        expect(loop.bluePrintManager.getData()[0].bpNodeLayoutMap.shared).toBeDefined();
        expect(owner.bluePrintManager.getData()[0].bpLines.edge).toBeDefined();
        expect(loop.bluePrintManager.getData()[0].bpLines.edge).toBeDefined();
    });
});
