/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {PluginStopParticipant} from '@datavisool/sdk/plugin';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {DesignerProjectSession, DesignerRuntimeService} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {DesignerMode} from '@datavisool/sdk/types';
import {EditorWorkspaceContext} from '@/shared/designer/EditorWorkspaceContext.ts';
import DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts';
import EditDesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/EditDesignerLoader.ts';
import {createDesignerRuntimePlugin} from '@/plugins/designer-runtime/designerRuntimePlugin.ts';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});

vi.mock('@/plugins/editor-inspector/DesignerRight.tsx', async () => {
    const React = await import('react');
    return {
        default: ({domain}: {domain: EditorInspectorDomain}) => {
            const [draft, setDraft] = React.useState('');
            return <section data-testid="inspector-domain">
                <output>{domain.sceneVersion}</output>
                <input aria-label="未提交草稿" value={draft} onChange={event => setDraft(event.currentTarget.value)}/>
            </section>;
        },
    };
});

import InspectorRoot from '@/plugins/editor-inspector/InspectorRoot.tsx';

const originalEnvironmentDescriptor = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalEnvironmentDescriptor)
        Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnvironmentDescriptor);
    else
        Reflect.deleteProperty(window, 'DATAVISOOL_ENV');
});

describe('Inspector draft across runtime pause', () => {
    it('keeps an unsubmitted draft after the real runtime owner domain pauses and resumes', async () => {
        const cleanupCallbacks: Array<() => void | Promise<void>> = [];
        const stopParticipants: PluginStopParticipant[] = [];
        const services = new Map<string, unknown>();
        const runtimePluginContext = {
            provide(name: string, service: unknown) { services.set(name, service); },
            onStop(participant: PluginStopParticipant) { stopParticipants.push(participant); },
            onDispose(cleanupCallback: () => void | Promise<void>) {
                cleanupCallbacks.push(cleanupCallback);
                return () => {
                    const index = cleanupCallbacks.indexOf(cleanupCallback);
                    if (index >= 0) cleanupCallbacks.splice(index, 1);
                };
            },
            on: () => () => undefined,
            emit: async () => undefined,
        };
        await createDesignerRuntimePlugin().activate(runtimePluginContext as never);

        const runtime = services.get('designerRuntime') as DesignerRuntimeService;
        const createSession = await runtime.prepare(DesignerMode.EDIT);
        const session = createSession() as DesignerProjectSession;
        const load = vi.spyOn(DesignerLoader.prototype, 'load').mockImplementation(async function (this: DesignerLoader, id: string) {
            const name = 'Inspector pause project';
            await this.initDesignerManager({id, name, layerManager: {layerConfigs: {}, elemConfigs: {}}} as never);
            this.projectInfo = {id, name};
            (this as EditDesignerLoader).initializeRuntimeEnv(id, this.designerManager);
        });
        const store = createInspectorStore();
        let view: ReturnType<typeof render> | undefined;

        try {
            await session.load('inspector-pause-project');
            expect(load).toHaveBeenCalledOnce();
            const ownerScene = runtime.readEditingScene();
            expect(ownerScene?.isActive()).toBe(true);

            let ownerDomain: EditorInspectorDomain | undefined;
            const prepareDomain = async () => {
                ownerDomain = await runtime.prepareInspectorDomain({
                    canWrite: () => store.isAccepting,
                    recordChange: () => true,
                    emit: () => undefined,
                    select: () => undefined,
                });
                return ownerDomain;
            };
            view = render(
                <EditorWorkspaceContext.Provider value={session.editing as never}>
                    <InspectorRoot
                        prepareDomain={prepareDomain}
                        closePanel={() => store.setContentVisible(false)}
                        store={store}
                        trackTask={task => task}
                    />
                </EditorWorkspaceContext.Provider>,
            );

            await act(async () => {
                store.setContentVisible(true);
                await Promise.resolve();
                await Promise.resolve();
            });
            expect(await screen.findByTestId('inspector-domain')).toBeInTheDocument();
            fireEvent.change(screen.getByRole('textbox', {name: '未提交草稿'}), {target: {value: '保留这段草稿'}});

            const runtimeStop = stopParticipants[0];
            await act(async () => {
                await runtimeStop.pause?.('application');
                store.setAccepting(false);
                await runtimeStop.prepare?.('application');
            });
            expect(ownerDomain?.isActive()).toBe(true);
            expect(screen.getByRole('textbox', {name: '未提交草稿'})).toHaveValue('保留这段草稿');

            await act(async () => {
                await runtimeStop.cancel?.('application');
                store.setAccepting(true);
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(await screen.findByRole('textbox', {name: '未提交草稿'})).toHaveValue('保留这段草稿');
        } finally {
            view?.unmount();
            store.dispose();
            session.close();
            for (const dispose of cleanupCallbacks.splice(0).reverse()) await dispose();
        }
    });
});
