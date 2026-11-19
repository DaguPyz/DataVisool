/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import type {EditorCommandService} from '@datavisool/sdk/plugin/contracts/editorCommands';
import type {EditorShellService} from '@datavisool/sdk/plugin/contracts/editorShell';

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});

import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import type {PluginStopParticipant} from '@datavisool/sdk/plugin';
import DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts';
import {BaseTextController} from '@/comps/builtin/base-text/BaseTextController.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import managerStore from '@/plugins/designer-runtime/internal/designer/manager/ManagerStore.ts';
import {createProjectSession} from '@/plugins/designer-runtime/createProjectSession.ts';
import {createEditorCanvasPlugin} from '@/plugins/editor-canvas/editorCanvasPlugin.tsx';
import {EditorCommandContext} from '@/shared/designer/EditorCommandContext.ts';
import {EditorShellContext} from '@/shared/designer/EditorShellContext.ts';
import {EditorWorkspaceContext} from '@/shared/designer/EditorWorkspaceContext.ts';

const textConfig = (id: string, value: string) => ({
    base: {id, name: value, type: 'BaseText'},
    data: {sourceType: 'static', value, staticData: {value, marker: 'preserve'}},
    style: {color: '#334455', fontSize: 18},
});

const projectData = (id: string, value: string) => ({
    id,
    name: id,
    layerManager: {
        layerHeader: 'text',
        layerTail: 'text',
        layerConfigs: {
            text: {id: 'text', type: 'BaseText', name: value, x: 20, y: 30, width: 240, height: 48, order: 1},
        },
        elemConfigs: {text: textConfig('text', value)},
    },
});

function readText(manager: DesignerManager) {
    const persisted = manager.layerManager.getData();
    return {
        name: manager.layerManager.layerConfigs.text.name,
        data: persisted.elemConfigs?.text?.data,
    };
}

function createHarness() {
    const loader = new DesignerLoader(DesignerMode.EDIT);
    const context = loader.runtimeContext;
    const managerStore = context.managerStore;
    context.registry.definitions.BaseText = {
        getController: () => BaseTextController,
        getInitConfig: () => textConfig('text', '初始文案'),
    } as any;
    const manager = loader.designerManager;
    manager.init(projectData('root-project', '初始文案') as any, DesignerMode.EDIT);
    loader.setLoaded(true);
    managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);

    const previousEnvironment = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
    (window as any).DATAVISOOL_ENV = {
        mode: DesignerMode.EDIT,
        editorLoader: loader,
        currentManager: manager,
        mainManger: manager,
        controllers: manager.layerManager.controllers,
    };

    const project = createProjectSession(loader, {
        workspaceChanged: () => undefined,
        blueprintChanged: () => undefined,
        layerChanged: () => undefined,
    });
    const runtime = {readEditingScene: () => project.editing?.readScene()};
    let canvas: any;
    let canvasContribution: React.ComponentType<any> | undefined;
    let stop: PluginStopParticipant | undefined;
    const disposers: Array<() => void> = [];
    const noopRegistration = () => () => undefined;
    createEditorCanvasPlugin().activate({
        designerRuntime: runtime,
        designerCatalog: {prepare: vi.fn()},
        editorCommands: {register: noopRegistration},
        editorShell: {
            registerCanvas: contribution => {
                canvasContribution = contribution.Canvas;
                return () => { canvasContribution = undefined; };
            },
            registerToolbarItem: noopRegistration,
        },
        on: () => () => undefined,
        emit: async () => undefined,
        onStop: participant => { stop = participant; },
        onDispose: dispose => { disposers.push(dispose); return () => undefined; },
        provide: (_name, service) => { canvas = service; },
    } as any);

    return {
        loader,
        manager,
        project,
        canvas,
        get canvasContribution() { return canvasContribution; },
        managerStore,
        get stop() { return stop; },
        disposers,
        previousEnvironment,
    };
}

function renderCanvas(harness: ReturnType<typeof createHarness>) {
    const Canvas = harness.canvasContribution;
    if (!Canvas) throw new Error('Canvas contribution was not registered.');
    const commands = {register: () => () => undefined, has: () => false, execute: async () => undefined} as EditorCommandService;
    const shell = {readShortcutHint: () => undefined} as EditorShellService;
    render(<EditorCommandContext.Provider value={commands}>
        <EditorShellContext.Provider value={shell}>
            <EditorWorkspaceContext.Provider value={harness.project.editing}>
                <React.Suspense fallback={null}><Canvas project={harness.project}/></React.Suspense>
            </EditorWorkspaceContext.Provider>
        </EditorShellContext.Provider>
    </EditorCommandContext.Provider>);
    return screen.findByText('初始文案').then(async element => {
        await waitFor(() => expect(harness.manager.layerManager.elemConfigs.text).toBeUndefined());
        return element;
    });
}

const activeHarnesses: Array<ReturnType<typeof createHarness>> = [];
const auxiliaryManagers: DesignerManager[] = [];
afterEach(() => {
    cleanup();
    for (const harness of activeHarnesses.splice(0).reverse()) {
        harness.disposers.reverse().forEach(dispose => dispose());
        harness.project.close();
        harness.managerStore.clear();
        if (harness.previousEnvironment) Object.defineProperty(window, 'DATAVISOOL_ENV', harness.previousEnvironment);
        else delete (window as any).DATAVISOOL_ENV;
    }
    auxiliaryManagers.splice(0).reverse().forEach(manager => manager.destroy());
});

function setup() {
    const harness = createHarness();
    activeHarnesses.push(harness);
    return harness;
}

it('records in-place text and layer name as one scene edit, then reopens the saved values', async () => {
    const harness = setup();
    await renderCanvas(harness);

    fireEvent.doubleClick(screen.getByText('初始文案'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, {target: {value: '更新后的标题'}});
    fireEvent.blur(input);

    await waitFor(() => expect(readText(harness.manager)).toMatchObject({
        name: '更新后的标题',
        data: {value: '更新后的标题', staticData: {value: '更新后的标题', marker: 'preserve'}},
    }));
    expect(screen.getByText('更新后的标题')).toBeInTheDocument();

    act(() => harness.canvas.undo());
    expect(readText(harness.manager)).toMatchObject({
        name: '初始文案',
        data: {value: '初始文案', staticData: {value: '初始文案', marker: 'preserve'}},
    });
    expect(screen.getByText('初始文案')).toBeInTheDocument();

    act(() => harness.canvas.redo());
    expect(readText(harness.manager)).toMatchObject({
        name: '更新后的标题',
        data: {value: '更新后的标题', staticData: {value: '更新后的标题', marker: 'preserve'}},
    });

    const savedSnapshot = harness.project.getSnapshot();
    expect(savedSnapshot).toBeDefined();
    const reopened = new DesignerManager(DesignerScene.DEFAULT);
    auxiliaryManagers.push(reopened);
    reopened.init(JSON.parse(JSON.stringify(savedSnapshot!.data)), DesignerMode.EDIT);
    expect(readText(reopened)).toMatchObject({
        name: '更新后的标题',
        data: {value: '更新后的标题', staticData: {value: '更新后的标题', marker: 'preserve'}},
    });
});

it('rejects edits while Canvas pauses and from a callback bound to the previous scene', async () => {
    const harness = setup();
    await renderCanvas(harness);
    const boundSceneVersion = harness.project.editing?.readScene()?.version;
    expect(boundSceneVersion).toBeDefined();
    expect(harness.stop).toBeDefined();

    await harness.stop!.pause?.('plugin');
    fireEvent.doubleClick(screen.getByText('初始文案'));
    const pausedInput = screen.getByRole('textbox');
    fireEvent.change(pausedInput, {target: {value: '暂停期间的文案'}});
    fireEvent.blur(pausedInput);
    expect(readText(harness.manager)).toMatchObject({
        name: '初始文案',
        data: {value: '初始文案', staticData: {value: '初始文案', marker: 'preserve'}},
    });
    expect(screen.getByText('初始文案')).toBeInTheDocument();

    await harness.stop!.cancel?.('plugin');
    fireEvent.doubleClick(screen.getByText('初始文案'));
    const resumedInput = screen.getByRole('textbox');
    fireEvent.change(resumedInput, {target: {value: '取消停止后可编辑'}});
    fireEvent.blur(resumedInput);
    expect(readText(harness.manager)).toMatchObject({
        name: '取消停止后可编辑',
        data: {value: '取消停止后可编辑', staticData: {value: '取消停止后可编辑', marker: 'preserve'}},
    });
    const previousSceneCallback = (harness.manager.layerManager.controllers.text as any)?.baseTextContentAction as ((value: string) => boolean) | undefined;
    expect(previousSceneCallback).toBeTypeOf('function');

    const child = new DesignerManager(DesignerScene.SUB_PROJECT, harness.loader.runtimeContext);
    auxiliaryManagers.push(child);
    child.init(projectData('child-project', '子项目原文') as any, DesignerMode.EDIT);
    act(() => {
        harness.managerStore.resetManagerStack(child, false, DesignerScene.SUB_PROJECT);
        (window as any).DATAVISOOL_ENV.currentManager = child;
        (window as any).DATAVISOOL_ENV.controllers = child.layerManager.controllers;
    });
    const nextScene = harness.project.editing?.readScene();
    expect(nextScene?.version).not.toBe(boundSceneVersion);
    expect(nextScene?.isActive()).toBe(true);

    expect(previousSceneCallback?.('过期场景的文案')).toBe(false);

    expect(readText(harness.manager)).toMatchObject({
        name: '取消停止后可编辑',
        data: {value: '取消停止后可编辑', staticData: {value: '取消停止后可编辑', marker: 'preserve'}},
    });
    expect(readText(child)).toMatchObject({
        name: '子项目原文',
        data: {value: '子项目原文', staticData: {value: '子项目原文', marker: 'preserve'}},
    });
    expect(await screen.findByText('子项目原文')).toBeInTheDocument();
    expect(screen.queryByText('取消停止后可编辑')).not.toBeInTheDocument();
});
