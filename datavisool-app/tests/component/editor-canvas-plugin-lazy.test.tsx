/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import type {ComponentType} from 'react';
import type {PluginContext} from '@datavisool/sdk/plugin';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorShortcutInputQuery} from '@datavisool/sdk/plugin/contracts/editorShortcuts';
import {SHORTCUT_ACTION_IDS} from '@datavisool/sdk/plugin/contracts/editorShortcuts';

const {createRuntimeMock} = vi.hoisted(() => ({createRuntimeMock: vi.fn()}));
vi.mock('@/plugins/editor-canvas/editorCanvasRuntime.tsx', () => ({createEditorCanvasRuntime: createRuntimeMock}));

import {createEditorCanvasPlugin} from '@/plugins/editor-canvas/editorCanvasPlugin.tsx';

describe('editor canvas plugin lazy activation', () => {
    beforeEach(() => createRuntimeMock.mockReset());

    it('registers one lightweight contribution without loading the core until a capability is requested', async () => {
        const service = {prepareInspectorDomain: vi.fn().mockResolvedValue({kind: 'inspector-domain'})};
        const runtime = {
            service,
            contribution: {Canvas: () => null, ZoomControls: () => null, Footer: () => null, history: {undo: vi.fn(), redo: vi.fn()}},
            pause: vi.fn(), prepare: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), withdraw: vi.fn(), dispose: vi.fn(),
        };
        createRuntimeMock.mockReturnValue(runtime);
        let providedService: {prepareInspectorDomain(): Promise<unknown>} | undefined;
        let stopParticipant: {pause?: () => void; cancel?: () => void} | undefined;
        const registerCanvas = vi.fn(() => vi.fn());
        const scene = {identity: {}, version: 1, isActive: () => true};
        const context = {
            editorShell: {registerCanvas},
            designerRuntime: {readEditingScene: () => scene},
            designerCatalog: {},
            editorCommands: {},
            provide: (_name: string, next: unknown) => {
                providedService = next as {prepareInspectorDomain(): Promise<unknown>};
            },
            on: () => vi.fn(),
            onDispose: () => vi.fn(),
            onStop: (participant: unknown) => {
                stopParticipant = participant as {pause?: () => void; cancel?: () => void};
            },
        } as unknown as PluginContext;

        createEditorCanvasPlugin().activate(context);
        expect(registerCanvas).toHaveBeenCalledOnce();
        expect(createRuntimeMock).not.toHaveBeenCalled();

        if (!providedService) throw new Error('editorCanvas service was not provided');
        const shortcutSource: EditorShortcutInputQuery = {
            isActive: () => true,
            isActiveWithExactModifiers: () => true,
            subscribePressedState: () => vi.fn(),
        };
        providedService.registerShortcutInput(shortcutSource);
        expect(createRuntimeMock).not.toHaveBeenCalled();

        await expect(providedService.prepareInspectorDomain()).resolves.toEqual({kind: 'inspector-domain'});
        expect(createRuntimeMock).toHaveBeenCalledOnce();
        expect(registerCanvas).toHaveBeenCalledOnce();
        const shortcutBridge = createRuntimeMock.mock.calls[0]?.[1] as {query: EditorShortcutInputQuery};
        expect(shortcutBridge.query.isActive(SHORTCUT_ACTION_IDS.UNDO, {} as KeyboardEvent)).toBe(true);

        stopParticipant?.pause?.();
        expect(runtime.pause).toHaveBeenCalledOnce();
        stopParticipant?.cancel?.();
        expect(runtime.cancel).toHaveBeenCalledOnce();
    });

    it('aborts prepared capabilities and drops queued writes when the scene changes during import', async () => {
        const inspectorPrepare = vi.fn().mockResolvedValue({kind: 'inspector-domain'});
        const layerPrepare = vi.fn().mockResolvedValue({kind: 'layer-domain'});
        const aiPrepare = vi.fn().mockResolvedValue({kind: 'ai-session'});
        const repairPrepare = vi.fn().mockResolvedValue({kind: 'repair-service'});
        const performAction = vi.fn().mockResolvedValue(undefined);
        const paste = vi.fn().mockResolvedValue(undefined);
        const runtime = {
            service: {
                prepareInspectorDomain: inspectorPrepare,
                prepareLayerDomain: layerPrepare,
                prepareAiEditing: aiPrepare,
                prepareRepair: repairPrepare,
                performAction,
                paste,
            },
            contribution: {Canvas: () => null, ZoomControls: () => null, Footer: () => null, history: {undo: vi.fn(), redo: vi.fn()}},
            pause: vi.fn(), prepare: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), withdraw: vi.fn(), dispose: vi.fn(),
        };
        createRuntimeMock.mockReturnValue(runtime);
        const firstScene = {identity: {}, version: 7, isActive: () => true};
        const nextScene = {identity: {}, version: 7, isActive: () => true};
        let currentScene = firstScene;
        let providedService: EditorCanvasService | undefined;
        const disposeCallbacks: Array<() => void | Promise<void>> = [];
        const context = {
            editorShell: {registerCanvas: vi.fn(() => vi.fn())},
            designerRuntime: {readEditingScene: () => currentScene},
            designerCatalog: {},
            editorCommands: {},
            provide: (_name: string, next: unknown) => { providedService = next as EditorCanvasService; },
            on: () => vi.fn(),
            onDispose: (cleanup: () => void | Promise<void>) => { disposeCallbacks.push(cleanup); return vi.fn(); },
            onStop: vi.fn(),
        } as unknown as PluginContext;
        createEditorCanvasPlugin().activate(context);
        if (!providedService) throw new Error('editorCanvas service was not provided');

        const controller = new AbortController();
        const prepared = [
            providedService.prepareInspectorDomain(controller.signal),
            providedService.prepareLayerDomain(controller.signal),
            providedService.prepareAiEditing({} as never, controller.signal),
            providedService.prepareRepair(),
        ] as Promise<unknown>[];
        const writes = [
            providedService.performAction('doClone' as never),
            providedService.paste('clipboard-data'),
        ];
        currentScene = nextScene;
        const results = await Promise.allSettled(prepared);

        expect(results).toHaveLength(4);
        for (const result of results) {
            expect(result.status).toBe('rejected');
            if (result.status === 'rejected') expect(result.reason).toMatchObject({name: 'AbortError'});
        }
        await expect(Promise.all(writes)).resolves.toEqual([undefined, undefined]);
        expect(inspectorPrepare).not.toHaveBeenCalled();
        expect(layerPrepare).not.toHaveBeenCalled();
        expect(aiPrepare).not.toHaveBeenCalled();
        expect(repairPrepare).not.toHaveBeenCalled();
        expect(performAction).not.toHaveBeenCalled();
        expect(paste).not.toHaveBeenCalled();
        await disposeCallbacks[0]?.();
    });

    it('shows a local retry state when runtime initialization fails instead of throwing through the editor', async () => {
        const runtime = {
            service: {},
            contribution: {
                Canvas: () => <div data-testid="loaded-canvas" />,
                ZoomControls: () => null,
                Footer: () => null,
                history: {undo: vi.fn(), redo: vi.fn()},
            },
            pause: vi.fn(), prepare: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), withdraw: vi.fn(), dispose: vi.fn(),
        };
        createRuntimeMock.mockImplementationOnce(() => { throw new Error('temporary runtime failure'); })
            .mockReturnValue(runtime);
        let contribution: {Canvas: ComponentType<{project: unknown}>} | undefined;
        const disposeCallbacks: Array<() => void | Promise<void>> = [];
        const context = {
            editorShell: {
                registerCanvas: vi.fn((next: {Canvas: ComponentType<{project: unknown}>}) => {
                    contribution = next;
                    return vi.fn();
                }),
            },
            designerRuntime: {readEditingScene: () => undefined},
            designerCatalog: {},
            editorCommands: {},
            provide: vi.fn(),
            on: () => vi.fn(),
            onDispose: (cleanup: () => void | Promise<void>) => { disposeCallbacks.push(cleanup); return vi.fn(); },
            onStop: vi.fn(),
        } as unknown as PluginContext;
        createEditorCanvasPlugin().activate(context);
        if (!contribution) throw new Error('Canvas contribution was not registered');

        const rendered = render(<contribution.Canvas project={{}} />);
        expect(await screen.findByRole('alert')).toHaveTextContent('画布加载失败');
        fireEvent.click(screen.getByRole('button', {name: '重试'}));
        expect(await screen.findByTestId('loaded-canvas')).toBeInTheDocument();
        expect(createRuntimeMock).toHaveBeenCalledTimes(2);

        rendered.unmount();
        await disposeCallbacks[0]?.();
        expect(runtime.dispose).toHaveBeenCalledOnce();
    });
});
