/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {designerWorkspaceChangedKey} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {editorTemplateCreatedKey} from '@datavisool/sdk/plugin/contracts/editorTemplates';
import type {} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {} from '@datavisool/sdk/plugin/contracts/editorCommands';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import {PageTemplate} from '@icon-park/react';
import TemplateLibraryStore from './TemplateLibraryStore.ts';

export function createEditorTemplateLibraryPlugin(): Plugin {
    return {
        id: 'editor-template-library',
        requires: ['designerRuntime', 'editorCanvas', 'editorShell', 'editorCommands'],
        provides: [],
        activate(context) {
            const {editorCanvas, editorShell, editorCommands} = context;
            const templateStore = new TemplateLibraryStore();
            const drafts = new Set<{sceneVersion: number; cancel(): void}>();
            const pendingTasks = new Set<Promise<unknown>>();
            const pauseCleanups = new Set<() => void>();
            let acceptingSaves = true;
            let active = true;
            const lifecycle = {
                isActive: () => active,
                isAccepting: () => active && acceptingSaves,
                trackTask<T>(task: Promise<T>) {
                    pendingTasks.add(task);
                    const remove = () => pendingTasks.delete(task);
                    void task.then(remove, remove);
                    return task;
                },
                registerPauseCleanup(cleanup: () => void) {
                    if (!active) {
                        return () => undefined;
                    }
                    pauseCleanups.add(cleanup);
                    if (!acceptingSaves) {
                        try { cleanup(); }
                        catch (error) { console.error('清理模板库交互失败', error); }
                    }
                    return () => { pauseCleanups.delete(cleanup); };
                },
            };
            const runPauseCleanups = () => {
                for (const cleanup of [...pauseCleanups]) {
                    try { cleanup(); }
                    catch (error) { console.error('清理模板库交互失败', error); }
                }
            };

            const registerDraft = (sceneVersion: number, cancel: () => void) => {
                const draft = {sceneVersion, cancel};
                drafts.add(draft);
                return () => { drafts.delete(draft); };
            };
            const cancelStaleDrafts = () => {
                for (const draft of [...drafts]) {
                    if (!editorCanvas.isSceneActive(draft.sceneVersion)) draft.cancel();
                }
            };

            context.onStop({
                pause() {
                    acceptingSaves = false;
                    runPauseCleanups();
                },
                async prepare() {
                    await Promise.allSettled([...pendingTasks]);
                },
                cancel() {
                    acceptingSaves = true;
                },
            });
            context.onDispose(() => {
                acceptingSaves = false;
                active = false;
                for (const draft of [...drafts]) draft.cancel();
                runPauseCleanups();
                pauseCleanups.clear();
                templateStore.dispose();
            });
            context.onDispose(context.on(editorTemplateCreatedKey, () => templateStore.refresh()));
            context.onDispose(context.on(designerWorkspaceChangedKey, cancelStaleDrafts));
            context.onDispose(editorCommands.register('template.save-selection', async signal => {
                if (!acceptingSaves || signal.aborted) return false;
                const snapshot = editorCanvas.readSelectionTemplate();
                if (!snapshot) return false;
                const {saveSelectionTemplate} = await import('./saveSelectionTemplate.tsx');
                if (!acceptingSaves || signal.aborted || !editorCanvas.isSceneActive(snapshot.sceneVersion)) return false;

                const saving = saveSelectionTemplate({
                    signal,
                    snapshot,
                    isSceneActive: sceneVersion => editorCanvas.isSceneActive(sceneVersion),
                    isAccepting: () => acceptingSaves,
                    isActive: () => active,
                    trackTask: task => lifecycle.trackTask(task),
                    registerDraft,
                    emitCreated: () => context.emit(editorTemplateCreatedKey, undefined),
                });
                return await saving;
            }));
            context.onDispose(editorShell.registerDockPanel({
                id: 'template-lib', label: '模板库', icon: <PageTemplate theme="outline" size={20}/>, order: 40,
                Panel: lazy(async () => {
                    const {default: TemplateLib} = await import('./TemplateLib.tsx');
                    return {default: props => <TemplateLib {...props} canvas={editorCanvas} store={templateStore} lifecycle={lifecycle}/>};
                }),
            }));
        },
    };
}
