/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {observable, runInAction} from 'mobx';
import {observer} from 'mobx-react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {editorAiDraftChangedKey, type EditorAiEditingSession} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {designerWorkspaceChangedKey} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/editorCommands';
import type {DesignerWorkspaceIdentity} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {Brain} from '@icon-park/react';
import {AiDrivenProgressTerminalStore} from './AiDrivenProgressTerminalStore.ts';
import type {createAiDrivenWebEffectBridge} from './AiDrivenWebEffectBridge.ts';
import type {IAiDrivenTaskEvent} from './types/AiDrivenTaskSubmitTypes.ts';

interface PausedDraftView {
    readonly session: EditorAiEditingSession;
    readonly sceneIdentity: object;
    readonly sceneVersion: number;
    readonly scope: DesignerWorkspaceIdentity;
}

const sameWorkspace = (left: DesignerWorkspaceIdentity | undefined, right: DesignerWorkspaceIdentity | undefined) => Boolean(left && right
    && left.rootId === right.rootId && left.activeId === right.activeId && left.nested === right.nested
    && JSON.stringify(left.loopPath ?? []) === JSON.stringify(right.loopPath ?? []));

export function createEditorAiPlugin(): Plugin {
    return {
        id: 'editor-ai',
        requires: ['designerRuntime', 'editorCanvas', 'designerCatalog', 'editorShell', 'editorCommands'],
        provides: [],
        activate(context) {
            let active = true;
            let accepting = true;
            let generation = 0;
            let bridge: ReturnType<typeof createAiDrivenWebEffectBridge> | undefined;
            let pendingBridge: Promise<ReturnType<typeof createAiDrivenWebEffectBridge>> | undefined;
            const terminal = new AiDrivenProgressTerminalStore();
            let pausedDraftView: PausedDraftView | undefined;
            const prepareBridge = () => {
                if (!active || !accepting) return Promise.reject(new DOMException('AI 插件已暂停或停止。', 'AbortError'));
                if (bridge) return Promise.resolve(bridge);
                if (pendingBridge) return pendingBridge;
                const requestGeneration = generation;
                const request = Promise.all([
                    context.designerCatalog.prepare(), import('./AiDrivenWebEffectBridge.ts'),
                ]).then(([catalog, {createAiDrivenWebEffectBridge}]) => {
                    if (!active || !accepting || generation !== requestGeneration)
                        throw new DOMException('AI 插件的准备请求已失效。', 'AbortError');
                    return bridge = createAiDrivenWebEffectBridge({canvas: context.editorCanvas, catalog, terminal});
                }).finally(() => { if (pendingBridge === request) pendingBridge = undefined; });
                pendingBridge = request;
                return request;
            };
            const onTaskEvent = async (event: IAiDrivenTaskEvent) => {
                const requestGeneration = generation;
                try { await (await prepareBridge()).handleEvent(event); }
                catch (error) {
                    if ((error as Error)?.name === 'AbortError' || !active || !accepting || generation !== requestGeneration) return;
                    terminal.appendLog({level: 'error', message: error instanceof Error ? error.message : String(error)});
                }
            };
            const draftState = observable.box<{session?: EditorAiEditingSession; revision: number}>({revision: 0}, {deep: false});
            const setDraftState = (state: {session?: EditorAiEditingSession; revision: number}) =>
                runInAction(() => draftState.set(state));
            context.onDispose(context.on(editorAiDraftChangedKey, change => {
                if (!accepting) return;
                const session = bridge?.readDraftSession(change.scope, change.sceneVersion);
                if (session?.sceneIdentity !== change.sceneIdentity) return;
                setDraftState({session, revision: change.revision ?? 0});
            }));
            context.onDispose(context.on(designerWorkspaceChangedKey, () => {
                try { bridge?.invalidateInactiveScopes(); }
                finally {
                    pausedDraftView = undefined;
                    setDraftState({revision: 0});
                }
            }));
            context.onDispose(async () => {
                active = false;
                accepting = false;
                pausedDraftView = undefined;
                setDraftState({revision: 0});
                generation++;
                pendingBridge = undefined;
                const current = bridge;
                bridge = undefined;
                try { await current?.withdraw(); }
                finally { terminal.reset(); }
            });
            context.onStop({
                pause() {
                    accepting = false;
                    generation++;
                    pendingBridge = undefined;
                    bridge?.pause();
                    const workspace = context.editorCanvas.readAiWorkspace();
                    const currentSession = workspace
                        ? bridge?.readDraftSession(workspace.scope, workspace.sceneVersion)
                        : undefined;
                    const session = currentSession ?? draftState.get().session;
                    const draft = session?.isActive() ? session.readDraft() : undefined;
                    pausedDraftView = workspace && session && draft && session.isActive()
                        && session.sceneVersion === workspace.sceneVersion
                        && sameWorkspace(session.scope, workspace.scope)
                        ? {session, sceneIdentity: session.sceneIdentity, sceneVersion: workspace.sceneVersion, scope: workspace.scope}
                        : undefined;
                    terminal.setInlineHostAvailable(false);
                    setDraftState({revision: 0});
                },
                prepare() { return bridge?.prepareStop(); },
                cancel() {
                    if (!active) return;
                    accepting = true;
                    bridge?.cancelStop();
                    terminal.setInlineHostAvailable(true);
                    const paused = pausedDraftView;
                    pausedDraftView = undefined;
                    const workspace = context.editorCanvas.readAiWorkspace();
                    const session = workspace
                        ? bridge?.readDraftSession(workspace.scope, workspace.sceneVersion)
                        : undefined;
                    const draft = session?.isActive() ? session.readDraft() : undefined;
                    if (paused && workspace && session === paused.session && draft
                        && session.sceneIdentity === paused.sceneIdentity
                        && session.sceneVersion === paused.sceneVersion
                        && workspace.sceneVersion === paused.sceneVersion
                        && sameWorkspace(workspace.scope, paused.scope)
                        && sameWorkspace(session.scope, paused.scope))
                        setDraftState({session, revision: draft.revision});
                },
                withdraw() {
                    pausedDraftView = undefined;
                    setDraftState({revision: 0});
                    return bridge?.withdraw();
                },
            });
            context.onDispose(() => context.editorShell.setAssistantVisible(false));
            context.onDispose(context.editorCommands.register('assistant.open', () => {
                if (active && accepting) context.editorShell.setAssistantVisible(true);
            }));
            const AssistantPanel = lazy(async () => {
                const {default: AiDrivenBar} = await import('./AiDrivenBar.tsx');
                return {default: (props: {open: boolean; onClose(): void}) => (
                    <AiDrivenBar {...props} canvas={context.editorCanvas} terminal={terminal} onTaskEvent={onTaskEvent}/>
                )};
            });
            context.onDispose(context.editorShell.registerView('assistant', {
                label: 'AI驱动', title: 'AI驱动（Ctrl + Alt + A / Command + Option + A）',
                icon: <Brain theme="outline" size={20}/>,
                Panel: AssistantPanel,
            }));
            const DraftCanvas = lazy(async () => {
                const {default: AiLayerDraftCanvas} = await import('./AiLayerDraftCanvas.tsx');
                return {default: observer(() => {
                    const state = draftState.get();
                    return <AiLayerDraftCanvas session={state.session} revision={state.revision}/>;
                })};
            });
            context.onDispose(context.editorShell.registerView('canvasDraft', DraftCanvas));
            context.onDispose(() => { active = false; accepting = false; generation++; pendingBridge = undefined; });
        },
    };
}
