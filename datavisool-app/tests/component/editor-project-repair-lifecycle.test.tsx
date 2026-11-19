/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {Suspense, type ComponentType} from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/plugins/editor-project/canvas-repair/CanvasRepairModal.tsx', () => ({
    default: ({canvasRepair, sceneVersion, onClose}: any) => {
        const analysis = canvasRepair.readRepairAnalysis?.(sceneVersion);
        return <div role="dialog" data-testid="repair-modal">
            <span>{`${analysis?.layerHeader ?? canvasRepair.label}:${sceneVersion}`}</span>
            <button type="button" onClick={onClose}>关闭修复</button>
        </div>;
    },
}));
vi.mock('@/plugins/editor-canvas/DesignerCanvas.tsx', () => ({
    default: () => <div data-testid="canvas-mounted"/>,
}));

import type {EditorCanvasRepairService, EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerEditingScene, DesignerProjectSession} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {EditorCanvasContribution, EditorOverlayProps} from '@datavisool/sdk/plugin/contracts/editorShell';
import {EditorWorkspaceContext} from '@/shared/designer/EditorWorkspaceContext.ts';
import {createEditorCanvasPlugin} from '@/plugins/editor-canvas/editorCanvasPlugin.tsx';
import {createEditorProjectPlugin} from '@/plugins/editor-project/editorProjectPlugin.ts';

const createScene = (label: string, version: number): DesignerEditingScene => {
    const identity = {};
    const layers = {[label]: {id: label, type: 'rect', name: label, order: 1}};
    const snapshot = () => ({
        sceneIdentity: identity,
        sceneVersion: version,
        canvas: {width: 800, height: 600},
        layerHeader: label,
        layerTail: label,
        layers,
        configs: {},
    });
    return {
        identity,
        version,
        name: label,
        isActive: () => true,
        readCanvasConfig: () => snapshot().canvas as any,
        readCanvasOptions: () => ({enableAdsorption: true, enableEvent: true}),
        updateCanvasOptions: () => true,
        readLayerConfigs: () => layers,
        layers: {read: snapshot} as any,
    } as DesignerEditingScene;
};

const createHarness = (initialScene?: DesignerEditingScene) => {
    let activeScene = initialScene;
    let projectContribution: {prepare(): Promise<{createActions: (...args: any[]) => unknown}>} | undefined;
    let canvasContribution: EditorCanvasContribution | undefined;
    let activeOverlay: string | undefined;
    const stopParticipants: Array<{pause(...args: any[]): void; cancel(...args: any[]): void}> = [];
    const disposers: Array<() => void> = [];
    const overlays = new Map<string, ComponentType<EditorOverlayProps>>();
    const editorShell = {
        registerView: () => () => undefined,
        registerToolbarItem: () => () => undefined,
        registerDockPanel: () => () => undefined,
        registerOverlay: ({id, View}: {id: string; View: ComponentType<EditorOverlayProps>}) => {
            overlays.set(id, View);
            return () => overlays.delete(id);
        },
        registerProject: () => () => undefined,
        registerCanvas: (contribution: EditorCanvasContribution) => {
            canvasContribution = contribution;
            return () => { canvasContribution = undefined; };
        },
        openOverlay: (id: string) => { activeOverlay = id; return true; },
        closeOverlay: (id: string) => { if (activeOverlay === id) activeOverlay = undefined; },
        isOverlayOpen: (id: string) => activeOverlay === id,
    };
    const project: DesignerProjectSession = {
        loaded: true,
        editing: {
            read: () => ({rootId: 'project-a', activeId: 'project-a', nested: false}),
            readScene: () => activeScene,
        } as any,
    } as DesignerProjectSession;
    const context: any = {
        editorShell,
        editorCommands: {register: () => () => undefined},
        designerRuntime: {readEditingScene: () => activeScene, prepareInspectorDomain: vi.fn()},
        designerCatalog: {prepare: vi.fn(async () => ({getComponent: () => undefined}))},
        onStop: (participant: any) => stopParticipants.push(participant),
        onDispose: (dispose: () => void) => { disposers.push(dispose); },
        on: () => () => undefined,
        emit: async () => undefined,
        provide: (id: string, service: unknown) => { context[id] = service; },
    };
    createEditorCanvasPlugin().activate(context);
    const canvasService = context.editorCanvas as EditorCanvasService;
    createEditorProjectPlugin().activate(context);

    const workspaceContext = () => ({
        read: () => project.editing?.read(),
        readScene: () => activeScene,
    });
    const renderNode = () => {
        const Canvas = canvasContribution?.Canvas;
        const RepairOverlay = editorShell.isOverlayOpen('project.repair') ? overlays.get('project.repair') : undefined;
        return <EditorWorkspaceContext.Provider value={workspaceContext() as any}>
            <Suspense fallback={null}>
                {Canvas && <Canvas project={project}/>}
                {RepairOverlay && <RepairOverlay project={project} onClose={() => editorShell.closeOverlay('project.repair')}/>}
            </Suspense>
        </EditorWorkspaceContext.Provider>;
    };

    return {
        editorShell,
        overlays,
        canvasService,
        project,
        renderNode,
        getCanvasContribution: () => canvasContribution!,
        getProjectContribution: () => context.editorProject as NonNullable<typeof projectContribution>,
        getStopParticipants: () => stopParticipants,
        setScene(scene: DesignerEditingScene | undefined) { activeScene = scene; },
        dispose() { for (const dispose of disposers.splice(0).reverse()) dispose(); },
    };
};

const activeHarnesses: Array<ReturnType<typeof createHarness>> = [];
const createTrackedHarness = (scene?: DesignerEditingScene) => {
    const harness = createHarness(scene);
    activeHarnesses.push(harness);
    return harness;
};

afterEach(() => {
    cleanup();
    for (const harness of activeHarnesses.splice(0)) harness.dispose();
});

describe('editor project canvas repair overlay lifecycle', () => {
    it('prepares project actions before Canvas binds, then uses the service for each scene identity', async () => {
        const sceneA = createScene('scene-a', 4);
        const sceneB = createScene('scene-b', 4);
        const harness = createTrackedHarness();
        const prepareRepair = vi.spyOn(harness.canvasService, 'prepareRepair');

        await harness.getProjectContribution().prepare();
        expect(prepareRepair).not.toHaveBeenCalled();

        harness.setScene(sceneA);
        const view = render(harness.renderNode());
        expect(await screen.findByTestId('canvas-mounted')).toBeInTheDocument();
        expect(prepareRepair).not.toHaveBeenCalled();

        harness.editorShell.openOverlay('project.repair');
        view.rerender(harness.renderNode());
        expect(await screen.findByText('scene-a:4')).toBeInTheDocument();
        expect(prepareRepair).toHaveBeenCalledTimes(1);

        harness.setScene(sceneB);
        view.rerender(harness.renderNode());
        expect(await screen.findByText('scene-b:4')).toBeInTheDocument();
        expect(prepareRepair).toHaveBeenCalledTimes(2);
    });

    it('contains a late AbortError during pause and allows retry after cancel', async () => {
        const scene = createScene('paused-scene', 9);
        const repair = {label: 'resumed-scene'} as unknown as EditorCanvasRepairService;
        const harness = createTrackedHarness(scene);
        await harness.getProjectContribution().prepare();
        const view = render(harness.renderNode());
        await screen.findByTestId('canvas-mounted');
        let rejectPreparation!: (error: unknown) => void;
        const prepareRepair = vi.spyOn(harness.canvasService, 'prepareRepair')
            .mockImplementationOnce(() => new Promise<EditorCanvasRepairService>((_resolve, reject) => {
                rejectPreparation = reject;
            }))
            .mockResolvedValueOnce(repair);

        harness.editorShell.openOverlay('project.repair');
        view.rerender(harness.renderNode());
        await waitFor(() => expect(prepareRepair).toHaveBeenCalledTimes(1));
        harness.getStopParticipants().forEach(participant => participant.pause('plugin'));
        await act(async () => { rejectPreparation(new DOMException('Canvas paused', 'AbortError')); });
        expect(await screen.findByRole('alert')).toHaveTextContent('当前画布已暂停');

        harness.getStopParticipants().forEach(participant => participant.cancel('plugin'));
        fireEvent.click(screen.getByRole('button', {name: '重试'}));
        expect(await screen.findByText('resumed-scene:9')).toBeInTheDocument();
        expect(prepareRepair).toHaveBeenCalledTimes(2);
    });

    it('turns a successful preparation that finishes during pause into a retryable state', async () => {
        const scene = createScene('late-scene', 10);
        const repair = {label: 'same-scene'} as unknown as EditorCanvasRepairService;
        const harness = createTrackedHarness(scene);
        await harness.getProjectContribution().prepare();
        const view = render(harness.renderNode());
        await screen.findByTestId('canvas-mounted');
        let finishPreparation!: (service: EditorCanvasRepairService) => void;
        const prepareRepair = vi.spyOn(harness.canvasService, 'prepareRepair')
            .mockImplementationOnce(() => new Promise<EditorCanvasRepairService>(resolve => { finishPreparation = resolve; }))
            .mockResolvedValueOnce(repair);

        harness.editorShell.openOverlay('project.repair');
        view.rerender(harness.renderNode());
        await waitFor(() => expect(prepareRepair).toHaveBeenCalledTimes(1));
        harness.getStopParticipants().forEach(participant => participant.pause('plugin'));
        await act(async () => { finishPreparation(repair); });
        expect(await screen.findByRole('alert')).toHaveTextContent('当前画布已暂停');

        harness.getStopParticipants().forEach(participant => participant.cancel('plugin'));
        fireEvent.click(screen.getByRole('button', {name: '重试'}));
        expect(await screen.findByText('same-scene:10')).toBeInTheDocument();
        expect(prepareRepair).toHaveBeenCalledTimes(2);
    });
});
