/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {createProjectSession} from '@/plugins/designer-runtime/createProjectSession.ts';

interface SessionFixture {
    context: DesignerRuntimeContext;
    root: DesignerManager;
    nested?: DesignerManager;
    loader: {
        runtimeContext: DesignerRuntimeContext;
        mode: DesignerMode;
        loaded: boolean;
        projectInfo: {id?: string; name?: string};
        designerManager: DesignerManager;
        load(id: string): Promise<void>;
        cancelLoad(): void;
    };
    session: ReturnType<typeof createProjectSession>;
}

const contexts: DesignerRuntimeContext[] = [];
const sessions: Array<ReturnType<typeof createProjectSession>> = [];
let originalEnvironmentDescriptor: PropertyDescriptor | undefined;
let previousEnvironment: Record<string, unknown>;

function initManager(manager: DesignerManager, id: string): void {
    manager.id = id;
    manager.name = id;
    manager.init({layerManager: {layerConfigs: {}, elemConfigs: {}}} as never, DesignerMode.EDIT);
}

function createSessionFixture(
    context: DesignerRuntimeContext,
    id: string,
    options: {nested?: boolean} = {},
): SessionFixture {
    const root = new DesignerManager(DesignerScene.DEFAULT, context);
    initManager(root, id);
    let nested: DesignerManager | undefined;
    if (options.nested) {
        nested = new DesignerManager(DesignerScene.LOOP_CONTAINER, context);
        initManager(nested, `${id}-loop`);
        root.layerManager.layerConfigs.loop = {id: 'loop', name: 'Loop', type: 'LoopContainer'};
        root.layerManager.controllers.loop = {
            manager: nested,
            destroy() {},
        } as never;
    }

    const loader: SessionFixture['loader'] = {
        runtimeContext: context,
        mode: DesignerMode.EDIT,
        loaded: false,
        projectInfo: {id, name: id},
        designerManager: root,
        cancelLoad() {},
        async load(projectId) {
            this.loaded = true;
            context.managerStore.resetManagerStack(root, true, DesignerScene.DEFAULT);
            let currentManager = root;
            if (nested) {
                context.managerStore.pushManager(nested);
                context.managerStore.setCurrentManager(nested, false, DesignerScene.LOOP_CONTAINER);
                currentManager = nested;
            }
            window.DATAVISOOL_ENV = {
                ...window.DATAVISOOL_ENV,
                projectId,
                mode: DesignerMode.EDIT,
                editorLoader: loader,
                currentManager,
                mainManger: root,
                controllers: currentManager.layerManager.controllers,
            } as never;
        },
    };
    const session = createProjectSession(loader as never, {workspaceChanged: () => undefined});
    contexts.push(context);
    sessions.push(session);
    return {context, root, nested, loader, session};
}

function collectErrors(error: unknown): unknown[] {
    if (!(error instanceof AggregateError)) return [error];
    return error.errors.flatMap(collectErrors);
}

beforeEach(() => {
    originalEnvironmentDescriptor = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
    previousEnvironment = {marker: 'before-runtime-session'};
    window.DATAVISOOL_ENV = previousEnvironment as never;
});

afterEach(() => {
    sessions.splice(0).reverse().forEach(session => {
        try { session.close(); } catch { /* The test asserts injected cleanup errors explicitly. */ }
    });
    contexts.splice(0).reverse().forEach(context => {
        try { context.dispose(); } catch { /* Continue restoring the next isolated context. */ }
    });
    if (originalEnvironmentDescriptor)
        Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnvironmentDescriptor);
    else
        Reflect.deleteProperty(window, 'DATAVISOOL_ENV');
    vi.restoreAllMocks();
});

describe('runtime project and context cleanup', () => {
    it('continues editing, loader, manager, and compatibility-environment cleanup after failures', async () => {
        const context = new DesignerRuntimeContext();
        const fixture = createSessionFixture(context, 'project-a', {nested: true});
        const baselineDescriptor = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
        await fixture.session.load('project-a');
        fixture.session.editing?.readScene();

        const editing = fixture.session.editing as unknown as {dispose(): void};
        const actualEditingDispose = editing.dispose.bind(editing);
        const editingFailure = new Error('editing dispose failed');
        vi.spyOn(editing, 'dispose').mockImplementation(() => {
            actualEditingDispose();
            throw editingFailure;
        });

        const cancelFailure = new Error('loader cancel failed');
        const actualCancelLoad = fixture.loader.cancelLoad;
        const cancelLoad = vi.spyOn(fixture.loader, 'cancelLoad').mockImplementation(() => {
            actualCancelLoad();
            throw cancelFailure;
        });

        const rootFailure = new Error('root manager destroy failed');
        const actualRootDestroy = fixture.root.destroy.bind(fixture.root);
        const rootDestroy = vi.spyOn(fixture.root, 'destroy').mockImplementation(() => {
            actualRootDestroy();
            throw rootFailure;
        });
        const nestedDestroy = vi.spyOn(fixture.nested!, 'destroy');

        let caught: unknown;
        try { fixture.session.close(); } catch (error) { caught = error; }

        expect(cancelLoad).toHaveBeenCalledOnce();
        expect(caught).toBeInstanceOf(AggregateError);
        const errors = collectErrors(caught);
        expect(errors).toContain(editingFailure);
        expect(errors).toContain(cancelFailure);
        expect(errors).toContain(rootFailure);
        expect(rootDestroy).toHaveBeenCalledOnce();
        expect(nestedDestroy).toHaveBeenCalledOnce();
        expect(fixture.root.isRuntimeActive()).toBe(false);
        expect(fixture.nested?.isRuntimeActive()).toBe(false);
        expect(fixture.context.managerStore.currentManager).toBeNull();
        expect(window.DATAVISOOL_ENV).toBe(previousEnvironment);
        expect(Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV')).toEqual(baselineDescriptor);
    });

    it('clears the manager store and runtime registry even when one real manager destroy throws', () => {
        const context = new DesignerRuntimeContext();
        contexts.push(context);
        const first = new DesignerManager(DesignerScene.DEFAULT, context);
        const second = new DesignerManager(DesignerScene.SUB_PROJECT, context);
        initManager(first, 'first');
        initManager(second, 'second');
        context.managerStore.resetManagerStack(first, true, DesignerScene.DEFAULT);
        context.managerStore.pushManager(second);
        context.managerStore.setCurrentManager(second, false, DesignerScene.SUB_PROJECT);
        context.registry.definitions['TemporaryDefinition'] = {} as never;
        context.registry.remoteComponents['RemoteChart'] = {id: 'remote-chart', script: '/remote.js'};

        const failure = new Error('second manager destroy failed');
        const actualSecondDestroy = second.destroy.bind(second);
        const secondDestroy = vi.spyOn(second, 'destroy').mockImplementation(() => {
            actualSecondDestroy();
            throw failure;
        });
        const firstDestroy = vi.spyOn(first, 'destroy');

        let caught: unknown;
        try { context.dispose(); } catch (error) { caught = error; }

        expect(caught).toBeInstanceOf(AggregateError);
        expect(collectErrors(caught)).toContain(failure);
        expect(secondDestroy).toHaveBeenCalledOnce();
        expect(firstDestroy).toHaveBeenCalledOnce();
        expect(first.isRuntimeActive()).toBe(false);
        expect(second.isRuntimeActive()).toBe(false);
        expect(context.managerStore.currentManager).toBeNull();
        expect(context.managerStore.managerStack).toEqual([]);
        expect(context.managerStore.currentFinalManager).toBeNull();
        expect(context.registry.definitions).toEqual({});
        expect(context.registry.remoteComponents).toEqual({});
    });

    it('does not let an older session close the newer session compatibility environment', async () => {
        const context = new DesignerRuntimeContext();
        const older = createSessionFixture(context, 'older');
        const newer = createSessionFixture(context, 'newer');
        await older.session.load('older');
        older.session.editing?.readScene();
        await newer.session.load('newer');
        newer.session.editing?.readScene();

        older.session.close();

        expect(window.DATAVISOOL_ENV.editorLoader).toBe(newer.loader);
        expect(window.DATAVISOOL_ENV.currentManager).toBe(newer.root);
        expect(context.managerStore.currentManager).toBe(newer.root);
        expect(older.root.isRuntimeActive()).toBe(false);
        expect(newer.root.isRuntimeActive()).toBe(true);
    });
});
