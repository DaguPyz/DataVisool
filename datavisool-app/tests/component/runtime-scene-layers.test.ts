/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cloneDeep} from 'lodash';
import {runInAction} from 'mobx';
import {DesignerMode, DesignerScene, type IDesignerManager, type IThemeItem} from '@datavisool/sdk/types';
import type {DesignerLayerModelChangedEvent} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {DesignerBlueprintPage} from '@datavisool/sdk/plugin/contracts/designerBlueprint';

vi.mock('@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: {}}}));

import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {createEditingScene, disposeEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import {BaseTextController} from '@/comps/builtin/base-text/BaseTextController.ts';

const release: Array<() => void> = [];
const contexts = new Set<DesignerRuntimeContext>();
let managerStore: DesignerRuntimeContext['managerStore'];
afterEach(() => {
    release.splice(0).reverse().forEach(cleanup => cleanup());
    contexts.clear();
    vi.useRealTimers();
});

const layer = (id: string, extra: Record<string, unknown> = {}) => ({
    id, type: 'BaseText', name: id, x: 0, y: 0, width: 100, height: 30, ...extra,
});
const config = (id: string) => ({
    base: {id, type: 'BaseText', name: id}, style: {color: '#123456'},
    data: {sourceType: 'static', staticData: {value: 1}, value: 1},
});
const variablePage = (id: string): DesignerBlueprintPage => ({
    pageId: id, pageName: id,
    bpNodeLayoutMap: {shared: {id: 'shared', type: 'BPGlobalVariableNode', x: 0, y: 0}},
    bpNodeConfigMap: {shared: {id: 'shared', type: 'BPGlobalVariable', name: 'shared', input: [], output: []}},
    bpLines: {}, bpAPMap: {}, bpAPLineMap: {},
});

function fixture(input: IDesignerManager = {layerManager: {
    layerHeader: 'text', layerTail: 'other',
    layerConfigs: {text: layer('text', {next: 'other'}), other: layer('other', {prev: 'text'})},
    elemConfigs: {text: config('text'), other: config('other')},
}}, context = new DesignerRuntimeContext()) {
    contexts.add(context);
    managerStore = context.managerStore;
    const manager = new DesignerManager(DesignerScene.DEFAULT, context);
    manager.init(input, DesignerMode.EDIT);
    Object.entries(manager.layerManager.elemConfigs ?? {}).forEach(([id, current]) => {
        if (manager.layerManager.layerConfigs[id]?.type === 'group') return;
        const controller = new BaseTextController();
        controller.config = cloneDeep(current);
        runInAction(() => { manager.layerManager.controllers[id] = controller; });
    });
    managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
    const events: DesignerLayerModelChangedEvent[] = [];
    const scene = createEditingScene(manager, managerStore.sceneVersion, () => manager.isRuntimeActive(), undefined,
        event => events.push(event), () => !context.effectsPaused);
    release.push(() => context.dispose(), () => manager.destroy(), () => disposeEditingScene(scene));
    return {manager, scene, events, context};
}

describe('runtime-owned scene layers', () => {
    it('returns detached DTOs and applies one guarded config/layer change with exact undo and redo', () => {
        const {manager, scene, events} = fixture();
        const detached = scene.layers.read()!;
        Reflect.set(detached.layers.text, 'name', 'external');
        Reflect.set((detached.configs.text as any).style, 'color', 'external');
        expect(scene.layers.read()!.layers.text.name).toBe('text');
        expect(manager.layerManager.controllers.text.getConfig().style.color).toBe('#123456');

        const change = scene.layers.patch(scene.layers.read()!, [{id: 'text', layer: {x: 40}, config: {style: {color: '#ff0000', added: true}}}])!;
        expect(change).toBeTruthy();
        expect(scene.layers.read()!.layers.text.x).toBe(40);
        expect(manager.layerManager.controllers.text.getConfig().style).toEqual({color: '#ff0000', added: true});
        expect(change.undo()).toBe(true);
        expect(scene.layers.read()!.layers.text.x).toBe(0);
        expect(manager.layerManager.controllers.text.getConfig().style).toEqual({color: '#123456'});
        expect(change.redo()).toBe(true);
        expect(manager.layerManager.controllers.text.getConfig().style).toEqual({color: '#ff0000', added: true});
        expect(events.map(event => event.ids)).toEqual([['text'], ['text'], ['text']]);
    });

    it('applies a component theme as one reversible scene change and rejects writes while paused', () => {
        const {manager, scene, context} = fixture();
        const controller = manager.layerManager.controllers.text as BaseTextController;
        const theme: IThemeItem = {
            id: 'night', name: 'Night',
            colors: {main: '#00aaff'},
        };
        const originalStyle = cloneDeep(scene.layers.read()!.configs.text.style);
        const change = scene.layers.applyTheme('text', theme)!;

        expect(change.sceneIdentity).toBe(scene.identity);
        expect(scene.layers.read()!.configs.text.style).toMatchObject({color: '#00aaff'});
        expect(controller.getConfig()!.style).toMatchObject({color: '#00aaff'});
        expect(change.undo()).toBe(true);
        expect(scene.layers.read()!.configs.text.style).toEqual(originalStyle);
        expect(controller.getConfig()!.style).toEqual(originalStyle);
        expect(change.redo()).toBe(true);
        expect(controller.getConfig()!.style).toMatchObject({color: '#00aaff'});

        context.pauseEffects();
        expect(scene.layers.applyTheme('text', {...theme, colors: {...theme.colors, main: '#ff00aa'}})).toBeUndefined();
        expect(controller.getConfig()!.style).toMatchObject({color: '#00aaff'});
        expect(scene.layers.read()!.configs.text.style).toMatchObject({color: '#00aaff'});
    });

    it('preserves later changes and removals in fields untouched by its history', () => {
        const {manager, scene} = fixture();
        Reflect.set(manager.layerManager.controllers.text.getConfig(), 'unrelated', 'before');
        const change = scene.layers.patch(scene.layers.read()!, [{id: 'text', config: {style: {color: '#ff0000'}}}])!;
        const text = manager.layerManager.controllers.text;
        const other = manager.layerManager.controllers.other;
        text.changeData(23);
        other.changeData(42);
        Reflect.deleteProperty(text.getConfig(), 'unrelated');
        Reflect.set(text.getConfig(), 'laterField', 'keep');

        expect(change.undo()).toBe(true);
        expect(text.getConfig().style.color).toBe('#123456');
        expect(text.getConfig().data.value).toBe(23);
        expect(text.getConfig().laterField).toBe('keep');
        expect(Object.hasOwn(text.getConfig(), 'unrelated')).toBe(false);
        expect(other.getConfig().data.value).toBe(42);
        expect(change.redo()).toBe(true);
        expect(text.getConfig().data.value).toBe(23);
    });

    it('replays inserted layer membership with its mounted configuration and generated order', () => {
        const {manager, scene} = fixture({layerManager: {layerConfigs: {}, elemConfigs: {}}});
        const before = scene.layers.read()!;
        const change = scene.layers.replace(before, {
            ...before, layers: {text: layer('text')}, layerHeader: 'text', layerTail: 'text',
        })!;
        expect(change).toBeTruthy();
        // ComponentContainer assigns ordering and the controller supplies defaults after history registration.
        const mounted = new BaseTextController();
        mounted.config = config('text');
        runInAction(() => {
            manager.layerManager.layerConfigs.text.order = 1;
            manager.layerManager.controllers.text = mounted;
        });
        const initialized = scene.layers.read()!;

        expect(change.undo()).toBe(true);
        expect(scene.layers.read()!.layers).toEqual({});
        expect(scene.layers.read()!.configs).toEqual({});
        expect(manager.layerManager.elemConfigs).toEqual({});
        expect(manager.layerManager.controllers.text).toBeUndefined();
        expect(change.redo()).toBe(true);
        expect(scene.layers.read()!.layers.text.order).toBe(1);
        expect(scene.layers.read()!.configs.text).toEqual(initialized.configs.text);
        expect(change.undo()).toBe(true);
        expect(change.redo()).toBe(true);
        expect(scene.layers.read()!.configs.text).toEqual(initialized.configs.text);
    });

    it('preserves initialized configuration across delete undo and redo without touching another layer', () => {
        const {manager, scene} = fixture();
        const change = scene.layers.remove(scene.layers.read()!, ['text'])!;
        expect(change.undo()).toBe(true);
        const restored = new BaseTextController();
        restored.config = {...config('text'), initialized: true};
        runInAction(() => {
            manager.layerManager.layerConfigs.text.order = 1;
            manager.layerManager.controllers.text = restored;
        });
        manager.layerManager.controllers.other.changeData(42);
        expect(change.redo()).toBe(true);
        expect(scene.layers.read()!.configs.text).toBeUndefined();
        expect(scene.layers.read()!.configs.other.data.value).toBe(42);
        expect(change.undo()).toBe(true);
        expect(scene.layers.read()!.configs.text.initialized).toBe(true);
        expect(scene.layers.read()!.configs.other.data.value).toBe(42);
    });

    it('rejects a replaced controller or a stale scene before history can mutate it', () => {
        const {manager, scene} = fixture();
        const change = scene.layers.rename('text', 'changed')!;
        const original = manager.layerManager.controllers.text;
        const replacement = new BaseTextController();
        replacement.config = cloneDeep(original.getConfig());
        runInAction(() => { manager.layerManager.controllers.text = replacement; });
        original.destroy();
        expect(change.undo()).toBe(false);
        expect(scene.layers.read()!.layers.text.name).toBe('changed');
        const nextManager = new DesignerManager(DesignerScene.DEFAULT, manager.runtimeContext);
        release.push(() => nextManager.destroy());
        manager.runtimeContext!.managerStore.setCurrentManager(nextManager);
        expect(scene.layers.read()).toBeUndefined();
        expect(scene.layers.rename('text', 'late')).toBeUndefined();
        expect(change.undo()).toBe(false);
    });

    it('rejects deletion when its target changed after the caller read the snapshot', () => {
        const {manager, scene} = fixture();
        const before = scene.layers.read()!;
        runInAction(() => { manager.layerManager.layerConfigs.text.x = 99; });
        expect(scene.layers.remove(before, ['text'])).toBeUndefined();
        expect(manager.layerManager.layerConfigs.text.x).toBe(99);
        expect(manager.layerManager.controllers.text).toBeTruthy();
    });

    it('preserves the surviving child chain when deleting a group child with different numeric order values', () => {
        const {scene} = fixture({layerManager: {
            layerHeader: 'group', layerTail: 'group',
            layerConfigs: {
                group: {id: 'group', type: 'group', childHeader: 'a', childTail: 'c'},
                a: layer('a', {pid: 'group', order: 30, next: 'b'}),
                b: layer('b', {pid: 'group', order: 20, prev: 'a', next: 'c'}),
                c: layer('c', {pid: 'group', order: 10, prev: 'b'}),
            },
            elemConfigs: {a: config('a'), b: config('b'), c: config('c')},
        }});
        const change = scene.layers.remove(scene.layers.read()!, ['b'])!;
        const after = scene.layers.read()!.layers;
        expect(after.group.childHeader).toBe('a');
        expect(after.group.childTail).toBe('c');
        expect(after.a.next).toBe('c');
        expect(after.c.prev).toBe('a');
        expect(change.undo()).toBe(true);
        expect(scene.layers.read()!.layers.a.next).toBe('b');
        expect(scene.layers.read()!.layers.b.next).toBe('c');
    });

    it('uses the owner variables for loop controllers and cancels pending binding timers on scene disposal', () => {
        vi.useFakeTimers();
        const context = new DesignerRuntimeContext();
        contexts.add(context);
        const owner = new DesignerManager(DesignerScene.DEFAULT, context);
        owner.globalVariableManager.init({globalVariables: {shared: {
            id: 'shared', key: 'shared', value: 7, bindTarget: [], reRender: false,
        }}});
        release.push(() => owner.destroy());
        const {manager, scene} = fixture(undefined, context);
        // Recreate the scene after assigning the runtime's loop variable owner.
        disposeEditingScene(scene);
        manager.variableOwner = owner;
        const loopScene = createEditingScene(manager, managerStore.sceneVersion, () => manager.isRuntimeActive());
        release.push(() => disposeEditingScene(loopScene));
        const patch = loopScene.layers.patch(loopScene.layers.read()!, [{id: 'text', config: {
            data: {sourceType: 'globalVariable', globalVariable: {gvId: 'shared'}},
        }}]);
        expect(patch).toBeTruthy();
        expect(owner.globalVariableManager.globalVariableInstance.shared.bindTarget).toContain('text');
        const before = loopScene.layers.read()!;
        const next = cloneDeep(before);
        (next.layers as any).pending = layer('pending');
        (next.configs as any).pending = config('pending');
        expect(loopScene.layers.replace(before, next)).toBeTruthy();
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        disposeEditingScene(loopScene);
        expect(vi.getTimerCount()).toBe(0);
        vi.runAllTimers();
    });

    it('reads and edits loop variables in the owner and removes their blueprint references in both scenes', () => {
        const context = new DesignerRuntimeContext();
        contexts.add(context);
        const owner = new DesignerManager(DesignerScene.DEFAULT, context);
        owner.globalVariableManager.init({globalVariables: {shared: {
            id: 'shared', key: 'shared', value: 7, bindTarget: [], reRender: false,
        }}});
        owner.bluePrintManager.init([variablePage('owner')], DesignerMode.EDIT);
        release.push(() => owner.destroy());
        const {manager, scene} = fixture(undefined, context);
        disposeEditingScene(scene);
        manager.variableOwner = owner;
        manager.bluePrintManager.replacePages([variablePage('loop')]);
        class LoopReferenceController extends BaseTextController {
            constructor(readonly manager: DesignerManager) { super(); }
        }
        runInAction(() => { owner.layerManager.controllers.loop = new LoopReferenceController(manager); });
        const loopScene = createEditingScene(manager, managerStore.sceneVersion, () => manager.isRuntimeActive());
        release.push(() => disposeEditingScene(loopScene));
        expect(loopScene.variables.list().map(item => item.id)).toEqual(['shared']);
        expect(loopScene.variables.read('shared')?.value).toBe(7);
        expect(loopScene.variables.save({id: 'shared', key: 'renamed', value: 8})).toBe('saved');
        expect(owner.globalVariableManager.globalVariableInstance.shared.key).toBe('renamed');
        expect(loopScene.variables.read('shared')?.value).toBe(8);
        expect(loopScene.variables.copy('shared')).toBe('saved');
        expect(loopScene.variables.list()).toHaveLength(2);
        expect(Object.keys(manager.globalVariableManager.globalVariableInstance)).toEqual([]);
        expect(loopScene.variables.remove('shared')).toBe(true);
        expect(owner.globalVariableManager.globalVariableInstance.shared).toBeUndefined();
        expect(owner.bluePrintManager.getData()[0].bpNodeLayoutMap.shared).toBeUndefined();
        expect(manager.bluePrintManager.getData()[0].bpNodeLayoutMap.shared).toBeUndefined();
    });

    it('restores every controller configuration when a controller also throws during rollback', () => {
        const {manager, scene} = fixture();
        const before = cloneDeep(manager.layerManager.getData());
        const text = manager.layerManager.controllers.text;
        const other = manager.layerManager.controllers.other;
        const updateText = text.update.bind(text);
        let failRollback = false;
        vi.spyOn(text, 'update').mockImplementation((value, options) => {
            updateText(value, options);
            if (failRollback) throw new Error('rollback view failed');
        });
        const updateOther = other.update.bind(other);
        vi.spyOn(other, 'update').mockImplementation((value, options) => {
            updateOther(value, options);
            if (value.style?.color === '#ff0000') {
                failRollback = true;
                throw new Error('second view failed');
            }
        });
        expect(() => scene.layers.patch(scene.layers.read()!, [
            {id: 'text', config: {style: {color: '#ff0000'}}},
            {id: 'other', config: {style: {color: '#ff0000'}}},
        ])).toThrow(AggregateError);
        expect(manager.layerManager.getData()).toEqual(before);
    });
});
