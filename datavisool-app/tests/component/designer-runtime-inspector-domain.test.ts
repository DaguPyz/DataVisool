/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {ObjectUtil} from '@datavisool/sdk';
import {cloneDeep} from 'lodash';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type {SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import {DesignerMode, DesignerScene, type ILayerItem} from '@datavisool/sdk/types';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {BaseTextController} from '@/comps/builtin/base-text/BaseTextController.ts';
import {createEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import {createInspectorDomain} from '@/plugins/designer-runtime/internal/inspector/createInspectorDomain.ts';

const Panel = () => null;
const initialConfig = {
    base: {id: 'component-a', compName: 'Text'},
    style: {color: '#111111'},
    data: {value: 'hello'},
    status: {focus: {name: 'Focus', config: {style: {color: '#222222'}}}},
};

class TestController {
    config: Record<string, any>;

    constructor(config: Record<string, any>) {
        this.config = cloneDeep(config);
    }

    getConfig() { return this.config; }

    update(patch: Record<string, any>) {
        this.config = ObjectUtil.merge(this.config, patch);
    }

    changeData(value: unknown) {
        if (this.config.data) this.config.data.value = value;
    }

    updateTheme(theme: {colors?: {main?: string}}) {
        const style = {...(this.config.style ?? {})};
        if (style.color && theme.colors?.main) style.color = theme.colors.main;
        style.themeMetadata = {selectedColor: theme.colors?.main};
        this.update({style});
    }

    updateFilter(filter: Record<string, unknown> | undefined) {
        if (filter === undefined) delete this.config.filter;
        else this.config.filter = cloneDeep(filter);
    }

    destroy() {}
}

function createLayer(id: string, overrides: Partial<ILayerItem> = {}): ILayerItem {
    return {id, name: id, type: 'sample', x: 10, y: 20, width: 20, height: 10, ...overrides};
}

function createRuntime(options: {
    scene?: DesignerScene;
    managerId?: string;
    layers?: Record<string, ILayerItem>;
    configs?: Record<string, Record<string, any>>;
} = {}) {
    const sceneType = options.scene ?? DesignerScene.DEFAULT;
    const context = new DesignerRuntimeContext();
    const manager = new DesignerManager(sceneType, context);
    manager.id = options.managerId ?? 'project-a';
    const layers = options.layers ?? {'component-a': createLayer('component-a')};
    const configs = options.configs ?? {'component-a': cloneDeep(initialConfig)};
    manager.init({
        canvasManager: {width: 800, height: 600},
        layerManager: {layerHeader: Object.keys(layers)[0], layerTail: Object.keys(layers).at(-1), layerConfigs: layers, elemConfigs: configs},
    } as never, DesignerMode.EDIT);
    Object.entries(configs).forEach(([id, config]) => { manager.layerManager.controllers[id] = new TestController(config) as never; });
    const definition = {
        getBaseInfo: () => ({id: 'sample', compName: 'Sample', type: 'sample', version: '1.0'}),
        getMenuList: () => [
            {key: 'base', name: '基础'}, {key: 'filter', name: '滤镜'}, {key: 'theme', name: '主题'},
            {key: 'data', name: '数据'}, {key: 'style', name: '样式'},
        ],
        getMenuToConfigContentMap: () => ({style: Panel}),
        getInitConfig: () => cloneDeep(initialConfig),
    };
    context.registry.definitions.sample = definition as never;
    context.managerStore.resetManagerStack(manager, sceneType === DesignerScene.DEFAULT, sceneType);
    return {context, manager};
}

function createDomain(
    manager: DesignerManager,
    active = () => true,
    signal?: AbortSignal,
    acceptChange: (change: SceneModelChange) => boolean = () => true,
    canWrite = () => true,
) {
    const sceneVersion = manager.runtimeContext!.managerStore.sceneVersion;
    const scene = createEditingScene(manager, sceneVersion, () => manager.isRuntimeActive(), undefined, undefined, canWrite);
    const changes: SceneModelChange[] = [];
    const events: unknown[] = [];
    const selections: string[][] = [];
    const catalog = {
        listCategories: () => [],
        listSubCategories: () => [],
        listComponents: () => [],
        getComponent: () => ({key: 'sample', baseInfo: {id: 'sample', compName: 'Sample', type: 'sample', version: '1.0'}, chartImage: null}),
        createInitialConfig: () => cloneDeep(initialConfig),
    } as unknown as DesignerCatalog;
    const domain = createInspectorDomain({
        sceneVersion,
        manager,
        scene,
        catalog,
        signal,
        isActive: active,
        recordChange(change) { changes.push(change); return acceptChange(change); },
        canWrite,
        emit(change) { events.push(change); },
        select(ids) { selections.push([...ids]); },
    });
    return {domain, scene, changes, events, selections};
}

describe('runtime-owned inspector domain', () => {
    const contexts: DesignerRuntimeContext[] = [];
    afterEach(() => {
        contexts.splice(0).forEach(context => context.dispose());
    });

    it('accepts selecting a valid empty status without creating a model history entry', () => {
        const runtime = createRuntime({configs: {
            'component-a': {...cloneDeep(initialConfig), status: {empty: {name: 'Empty', config: {}}}},
        }});
        contexts.push(runtime.context);
        let active = true;
        const {domain, scene, changes} = createDomain(runtime.manager, () => active);
        const before = scene.layers.read();

        expect(domain.applyStatusChange('component-a', {kind: 'activate', id: 'empty'})).toBe(true);
        expect(scene.layers.read()).toEqual(before);
        expect(changes).toHaveLength(0);
        expect(domain.applyStatusChange('component-a', {kind: 'activate', id: 'missing'})).toBe(false);
        active = false;
        expect(domain.applyStatusChange('component-a', {kind: 'activate', id: 'empty'})).toBe(false);
    });

    it('keeps a facade bound to its controller and records config and status writes as scene changes', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        const {domain, scene, changes, events} = createDomain(runtime.manager);
        const facade = domain.createControllerFacade('component-a')!;
        expect(facade.isCurrent()).toBe(true);

        facade.update({style: {fontSize: 18}});
        expect(domain.sceneIdentity).toBe(scene.identity);
        expect((events[0] as any).sceneIdentity).toBe(scene.identity);
        expect((runtime.manager.layerManager.controllers['component-a'] as TestController).config.style)
            .toEqual({color: '#111111', fontSize: 18});
        expect(changes).toHaveLength(1);

        expect(domain.applyStatusChange('component-a', {kind: 'rename', id: 'focus', name: 'Focused'})).toBe(true);
        expect((runtime.manager.layerManager.controllers['component-a'] as TestController).config.status.focus.name).toBe('Focused');
        expect(domain.readStatuses('component-a')?.items).toEqual([{id: 'focus', name: 'Focused'}]);
        expect(changes).toHaveLength(2);

        expect(changes[1].undo()).toBe(true);
        expect((runtime.manager.layerManager.controllers['component-a'] as TestController).config.status.focus.name).toBe('Focus');
        expect(changes[0].undo()).toBe(true);
        expect((runtime.manager.layerManager.controllers['component-a'] as TestController).config.style)
            .toEqual({color: '#111111'});
        expect(changes[0].redo()).toBe(true);
        expect((runtime.manager.layerManager.controllers['component-a'] as TestController).config.style.fontSize).toBe(18);
    });

    it('does not rebind an existing facade when a component controller is replaced', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        const {domain} = createDomain(runtime.manager);
        const facade = domain.createControllerFacade('component-a')!;
        const replacement = new TestController({base: {id: 'component-a'}, style: {color: '#abcdef'}});
        runtime.manager.layerManager.controllers['component-a'] = replacement as never;
        expect(facade.isCurrent()).toBe(false);
        facade.update({style: {color: '#ff0000'}});
        expect(replacement.config.style.color).toBe('#abcdef');
    });

    it('uses definition metadata while returning detached target and initial config snapshots', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        const {domain} = createDomain(runtime.manager);
        const target = domain.readTarget('component-a')!;
        expect(target.type).toBe('sample');
        expect(target.menus.map(menu => menu.key)).toEqual(['data', 'style']);
        expect(target.configPanels).toEqual({style: Panel});
        expect(Object.isFrozen(target)).toBe(true);
        expect(Object.isFrozen(target.initialConfig)).toBe(true);
        expect(target.componentInfo.compName).toBe('Text');
    });

    it('replaces array data values exactly and keeps the replacement undoable', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        const {domain, changes} = createDomain(runtime.manager);
        const facade = domain.createControllerFacade('component-a')!;
        const controller = runtime.manager.layerManager.controllers['component-a'] as TestController;
        facade.update({data: {value: [{id: 1}, {id: 2}]}});
        expect(controller.config.data.value).toEqual([{id: 1}, {id: 2}]);
        expect(changes).toHaveLength(1);
        expect(changes[0].undo()).toBe(true);
        expect(controller.config.data.value).toBe('hello');
        expect(changes[0].redo()).toBe(true);
        expect(controller.config.data.value).toEqual([{id: 1}, {id: 2}]);
    });

    it('keeps scene and controller reads valid during pause while rejecting writes and new data work', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        let sceneActive = true;
        let canWrite = true;
        const {domain, scene, changes} = createDomain(
            runtime.manager,
            () => sceneActive,
            undefined,
            () => true,
            () => canWrite,
        );
        const controller = runtime.manager.layerManager.controllers['component-a'] as TestController & {
            createHostDataUpdater?: () => unknown;
        };
        const createUpdater = vi.fn(() => ({run: vi.fn(), destroy: vi.fn()}));
        controller.createHostDataUpdater = createUpdater;
        const facade = domain.createControllerFacade('component-a')!;
        const initialConfig = facade.getConfig();

        canWrite = false;
        expect(domain.isActive()).toBe(true);
        expect(domain.readTarget('component-a')?.id).toBe('component-a');
        expect(domain.readStatuses('component-a')?.items).toEqual([{id: 'focus', name: 'Focus'}]);
        expect(domain.readDataSourceContext('component-a')).toBeDefined();
        expect(facade.isCurrent()).toBe(true);
        expect(facade.getConfig()).toEqual(initialConfig);
        expect(facade.config).toEqual(initialConfig);

        facade.update({style: {color: '#abcdef'}});
        facade.changeData('paused');
        expect(facade.renameLayer('Paused rename')).toBe(false);
        expect(domain.applyStatusChange('component-a', {kind: 'add'})).toBe(false);
        expect(domain.applyLayerEdit('component-a', {kind: 'move', x: 50})).toBe(false);
        expect(domain.resetConfig('component-a')).toBe(false);
        expect(domain.prepareDataSourceTest('component-a', 'api', {url: 'https://example.test'})).toBeUndefined();
        expect(domain.applyTheme('component-a', {id: 'theme-paused'} as never)).toBe(false);
        expect(domain.applyFilter('component-a', {enable: true})).toBe(false);
        expect(facade.createHostDataUpdater!(() => undefined, () => undefined)).toBeNull();
        expect(createUpdater).not.toHaveBeenCalled();
        expect(changes).toHaveLength(0);
        expect(scene.layers.read()?.configs['component-a']).toEqual(initialConfig);
        expect(controller.config).toEqual(initialConfig);

        canWrite = true;
        facade.update({style: {color: '#abcdef'}});
        expect((facade.getConfig() as any).style.color).toBe('#abcdef');
        expect(changes).toHaveLength(1);
        const resumedUpdater = facade.createHostDataUpdater!(() => undefined, () => undefined);
        expect(resumedUpdater).toBeTruthy();
        expect(createUpdater).toHaveBeenCalledOnce();
        (resumedUpdater as {destroy(): void}).destroy();

        sceneActive = false;
        expect(domain.isActive()).toBe(false);
        expect(domain.readTarget('component-a')).toBeUndefined();
        expect(facade.isCurrent()).toBe(false);
        facade.update({style: {color: '#ff0000'}});
        expect(controller.config.style.color).toBe('#abcdef');
    });

    it('preserves reRender false on the initial facade update while history replay renders', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        const controller = new BaseTextController();
        controller.config = cloneDeep(initialConfig) as never;
        runtime.manager.layerManager.controllers['component-a'] = controller as never;
        const renderConfig = vi.fn();
        controller.instance = {updateConfig: renderConfig} as never;
        const updateSpy = vi.spyOn(controller, 'update');
        const {domain, scene, changes} = createDomain(runtime.manager);
        const facade = domain.createControllerFacade('component-a')!;

        facade.update({style: {color: '#123456'}, data: {value: 'saved'}} as never, {reRender: false});
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenLastCalledWith(expect.any(Object), {reRender: false});
        expect(renderConfig).not.toHaveBeenCalled();
        expect((scene.layers.read()?.configs['component-a'] as any).data.value).toBe('saved');
        expect(changes).toHaveLength(1);

        updateSpy.mockClear();
        expect(changes[0].undo()).toBe(true);
        expect((scene.layers.read()?.configs['component-a'] as any).data.value).toBe('hello');
        expect(updateSpy).toHaveBeenCalled();
        expect(updateSpy.mock.calls.at(-1)?.[1]).toEqual({reRender: true});
        expect(renderConfig).toHaveBeenCalled();

        updateSpy.mockClear();
        expect(changes[0].redo()).toBe(true);
        expect((scene.layers.read()?.configs['component-a'] as any).data.value).toBe('saved');
        expect(updateSpy).toHaveBeenCalled();
        expect(updateSpy.mock.calls.at(-1)?.[1]).toEqual({reRender: true});
        expect(renderConfig).toHaveBeenCalled();
    });

    it('records component theme and filter edits with exact undo and redo semantics', () => {
        const runtime = createRuntime({configs: {'component-a': {
            ...cloneDeep(initialConfig),
            status: {focus: {name: 'Focus', config: {style: {color: '#222222'}}}},
        }}});
        contexts.push(runtime.context);
        const {domain, changes} = createDomain(runtime.manager);
        const controller = runtime.manager.layerManager.controllers['component-a'] as TestController;
        expect(domain.applyTheme('component-a', {id: 'theme-a', name: 'Night', colors: {main: '#abcdef'}} as never)).toBe(true);
        expect(domain.applyFilter('component-a', {enable: true, blur: 5})).toBe(true);
        expect(controller.config.style).toEqual({color: '#abcdef', themeMetadata: {selectedColor: '#abcdef'}});
        expect(controller.config.filter).toEqual({enable: true, blur: 5});
        expect(controller.config.status.focus.config.style.color).toBe('#222222');
        expect(changes).toHaveLength(2);

        expect(changes[1].undo()).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(controller.config, 'filter')).toBe(false);
        expect(changes[0].undo()).toBe(true);
        expect(controller.config.style).toEqual({color: '#111111'});
        expect(changes[0].redo()).toBe(true);
        expect(changes[1].redo()).toBe(true);
        expect(controller.config.style.themeMetadata).toEqual({selectedColor: '#abcdef'});
        expect(controller.config.filter).toEqual({enable: true, blur: 5});
    });

    it('resets root and selected status config through the same scene history', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        const {domain, changes} = createDomain(runtime.manager);
        const rootFacade = domain.createControllerFacade('component-a')!;
        const statusFacade = domain.createControllerFacade('component-a', 'focus')!;
        rootFacade.update({style: {color: '#999999'}, data: {value: 'changed'}});
        statusFacade.update({style: {color: '#333333'}});
        const controller = runtime.manager.layerManager.controllers['component-a'] as TestController;
        expect(controller.config.status.focus.config.style.color).toBe('#333333');

        expect(domain.resetConfig('component-a', 'focus')).toBe(true);
        expect(controller.config.style.color).toBe('#111111');
        expect(controller.config.data.value).toBe('hello');
        expect(controller.config.status.focus.config.style.color).toBe('#111111');
        expect(changes).toHaveLength(3);

        expect(changes[2].undo()).toBe(true);
        expect(controller.config.style.color).toBe('#333333');
        expect(controller.config.data.value).toBe('changed');
        expect(controller.config.status.focus.config.style.color).toBe('#333333');
    });

    it('moves grouped children through the scene model and returns their selection to the host', () => {
        const layers = {
            group: createLayer('group', {type: 'group', x: 0, y: 0, width: 0, height: 0}),
            first: createLayer('first', {pid: 'group', x: 10, y: 20, width: 20, height: 10}),
            second: createLayer('second', {pid: 'group', x: 50, y: 40, width: 30, height: 20}),
        };
        const configs = Object.fromEntries(Object.keys(layers).map(id => [id, cloneDeep(initialConfig)]));
        const runtime = createRuntime({layers, configs});
        contexts.push(runtime.context);
        const {domain, changes, selections} = createDomain(runtime.manager);

        expect(domain.applyLayerEdit('group', {kind: 'move', x: 40, y: 60})).toBe(true);
        expect(selections).toEqual([['first', 'second']]);
        expect(runtime.manager.layerManager.layerConfigs.first).toMatchObject({x: 40, y: 60});
        expect(runtime.manager.layerManager.layerConfigs.second).toMatchObject({x: 80, y: 80});
        expect(changes).toHaveLength(1);
        expect(changes[0].undo()).toBe(true);
        expect(runtime.manager.layerManager.layerConfigs.first).toMatchObject({x: 10, y: 20});
        expect(changes[0].redo()).toBe(true);
        expect(runtime.manager.layerManager.layerConfigs.second).toMatchObject({x: 80, y: 80});
    });

    it('undoes a scene model mutation when the host rejects its history record', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        const {domain, changes} = createDomain(runtime.manager, () => true, undefined, () => false);
        const controller = runtime.manager.layerManager.controllers['component-a'] as TestController;
        expect(domain.applyLayerEdit('component-a', {kind: 'rename', name: 'Rejected'})).toBe(false);
        expect(runtime.manager.layerManager.layerConfigs['component-a'].name).toBe('component-a');
        expect(domain.applyFilter('component-a', {enable: true})).toBe(false);
        expect(controller.config.filter).toBeUndefined();
        expect(changes).toHaveLength(2);
    });

    it('rolls back a rejected config edit after the host pauses during history registration', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        let canWrite = true;
        let invalidateSceneIdentity: () => void = () => {};
        const {domain, scene, changes} = createDomain(
            runtime.manager,
            () => true,
            undefined,
            () => {
                canWrite = false;
                invalidateSceneIdentity();
                return false;
            },
            () => canWrite,
        );
        const boundIdentity = scene.identity;
        invalidateSceneIdentity = () => {
            Object.defineProperty(scene, 'identity', {value: Object.freeze({}), configurable: true});
        };
        const controller = runtime.manager.layerManager.controllers['component-a'] as TestController;
        const facade = domain.createControllerFacade('component-a')!;

        facade.update({style: {color: '#abcdef'}});
        expect(domain.sceneIdentity).toBe(boundIdentity);
        expect(scene.identity).not.toBe(boundIdentity);
        expect(changes).toHaveLength(1);
        expect(changes[0].sceneIdentity).toBe(boundIdentity);
        expect(scene.layers.read()?.configs['component-a']).toMatchObject({style: {color: '#111111'}});
        expect(controller.config.style).toEqual({color: '#111111'});
        expect(changes[0].undo()).toBe(false);
        expect(scene.layers.read()?.configs['component-a']).toMatchObject({style: {color: '#111111'}});
    });

    it('rolls back a config edit and rethrows when history registration fails', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        const failure = new Error('history registration failed');
        const {domain, scene, changes} = createDomain(runtime.manager, () => true, undefined, () => { throw failure; });
        const controller = runtime.manager.layerManager.controllers['component-a'] as TestController;
        const facade = domain.createControllerFacade('component-a')!;

        expect(() => facade.update({style: {color: '#abcdef'}})).toThrow(failure);
        expect(changes).toHaveLength(1);
        expect(scene.layers.read()?.configs['component-a']).toMatchObject({style: {color: '#111111'}});
        expect(controller.config.style).toEqual({color: '#111111'});
    });

    it('resolves datasource values and Loop sample data from the bound runtime scene', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        runtime.manager.globalVariableManager.saveGlobalVariable({key: 'token', value: 'live-value'} as never);
        const {domain, scene} = createDomain(runtime.manager);
        const input = {url: 'https://example.test/#{token}', params: {token: '#{token}'}, headers: {'X-Token': '#{token}'}};
        const variableId = Object.keys(runtime.manager.globalVariableManager.globalVariableInstance)[0];
        expect(scene.variables.read(variableId)?.value).toBe('live-value');
        expect(domain.prepareDataSourceTest('component-a', 'api', input)).toEqual({
            url: 'https://example.test/live-value', params: {token: 'live-value'}, headers: {'X-Token': 'live-value'}, filter: undefined,
        });
        expect(input.url).toBe('https://example.test/#{token}');
        runtime.manager.globalVariableManager.saveGlobalVariable({id: variableId, key: 'token', value: 'latest-value'} as never);
        expect(scene.variables.read(variableId)?.value).toBe('latest-value');
        expect(domain.prepareDataSourceTest('component-a', 'api', input)).toMatchObject({url: 'https://example.test/latest-value'});

        const loopContext = new DesignerRuntimeContext();
        contexts.push(loopContext);
        const parent = new DesignerManager(DesignerScene.DEFAULT, loopContext);
        parent.id = 'project-loop-parent';
        parent.init({layerManager: {layerConfigs: {loop: createLayer('loop', {type: 'LoopContainer'})}, elemConfigs: {loop: {}}}} as never, DesignerMode.EDIT);
        const nested = new DesignerManager(DesignerScene.LOOP_CONTAINER, loopContext);
        nested.id = 'loop';
        nested.variableOwner = parent;
        nested.init({layerManager: {layerConfigs: {'component-a': createLayer('component-a')}, elemConfigs: {'component-a': cloneDeep(initialConfig)}}} as never, DesignerMode.EDIT);
        nested.layerManager.controllers['component-a'] = new TestController(initialConfig) as never;
        const loopController = Object.assign(new TestController({}), {
            manager: nested,
            readEditSampleData: () => ({rows: [{value: 1}]}),
        });
        parent.layerManager.controllers.loop = loopController as never;
        loopContext.managerStore.resetManagerStack(parent, true, DesignerScene.DEFAULT);
        loopContext.managerStore.pushManager(nested);
        loopContext.managerStore.setCurrentManager(nested, false, DesignerScene.LOOP_CONTAINER);
        const {domain: loopDomain} = createDomain(nested);
        const sourceContext = loopDomain.readDataSourceContext('component-a')!;
        expect(sourceContext.sourceTypes).toEqual(['static']);
        expect(sourceContext.staticDataSeedKey).toBe('loop:component-a');
        (sourceContext.staticDataDraftValue as {rows: Array<{value: number}>}).rows[0].value = 99;
        expect((loopDomain.readDataSourceContext('component-a')?.staticDataDraftValue as any).rows[0].value).toBe(1);
    });

    it('refuses late facade and component writes after abort or scene replacement', () => {
        const runtime = createRuntime();
        contexts.push(runtime.context);
        const abortController = new AbortController();
        const {domain} = createDomain(runtime.manager, () => true, abortController.signal);
        const facade = domain.createControllerFacade('component-a')!;
        abortController.abort();
        expect(domain.isActive()).toBe(false);
        expect(facade.isCurrent()).toBe(false);
        expect(domain.applyFilter('component-a', {enable: true})).toBe(false);
        expect(domain.applyTheme('component-a', {id: 'theme-a', name: 'Late', colors: {main: '#abcdef'}} as never)).toBe(false);
        expect(domain.prepareDataSourceTest('component-a', 'api', {url: 'https://example.test/#{token}'})).toBeUndefined();
        expect((runtime.manager.layerManager.controllers['component-a'] as TestController).config.filter).toBeUndefined();
        expect((runtime.manager.layerManager.controllers['component-a'] as TestController).config.style.color).toBe('#111111');

        const sceneBound = createDomain(runtime.manager).domain;
        const replacement = new DesignerManager(DesignerScene.DEFAULT, runtime.context);
        replacement.init({layerManager: {layerConfigs: {}, elemConfigs: {}}} as never, DesignerMode.EDIT);
        runtime.context.managerStore.setCurrentManager(replacement, true, DesignerScene.DEFAULT);
        expect(sceneBound.isActive()).toBe(false);
        expect(sceneBound.applyLayerEdit('component-a', {kind: 'rename', name: 'late'})).toBe(false);
        expect(sceneBound.applyTheme('component-a', {id: 'theme-a', name: 'Late', colors: {main: '#abcdef'}} as never)).toBe(false);
        expect(sceneBound.prepareDataSourceTest('component-a', 'api', {url: 'https://example.test/#{token}'})).toBeUndefined();
        expect(runtime.manager.layerManager.layerConfigs['component-a'].name).toBe('component-a');
    });
});
