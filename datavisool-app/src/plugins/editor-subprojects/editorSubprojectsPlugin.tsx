/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createElement, lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {EditorDockPanelProps} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/editorProject';
import {FolderClose} from '@icon-park/react';

export function createEditorSubprojectsPlugin(): Plugin {
    return {
        id: 'editor-subprojects',
        requires: ['editorProject', 'editorShell'],
        provides: [],
        activate(context) {
            let active = true;
            let accepting = true;
            const tasks = new Set<Promise<unknown>>();
            const pauseHandlers = new Set<() => void>();
            const resumeHandlers = new Set<() => void>();
            const runHandlers = (handlers: Set<() => void>) => {
                for (const handler of handlers) {
                    try { handler(); }
                    catch (error) { console.error('清理子项目面板操作失败', error); }
                }
            };
            const lifecycle = {
                canEdit: () => active && accepting,
                isActive: () => active,
                trackTask<T>(task: Promise<T>): Promise<T> {
                    tasks.add(task);
                    const remove = () => tasks.delete(task);
                    void task.then(remove, remove);
                    return task;
                },
                registerPauseHandlers(onPause: () => void, onResume: () => void) {
                    pauseHandlers.add(onPause);
                    resumeHandlers.add(onResume);
                    return () => { pauseHandlers.delete(onPause); resumeHandlers.delete(onResume); };
                },
            };
            context.onStop({
                pause() {
                    accepting = false;
                    runHandlers(pauseHandlers);
                },
                async prepare() { await Promise.allSettled([...tasks]); },
                cancel() {
                    accepting = true;
                    runHandlers(resumeHandlers);
                },
            });
            context.onDispose(() => {
                active = false;
                accepting = false;
                runHandlers(pauseHandlers);
                pauseHandlers.clear();
                resumeHandlers.clear();
            });
            const Panel = lazy(async () => {
                const {default: SubProject} = await import('./SubProject.tsx');
                return {default: (props: EditorDockPanelProps) => createElement(SubProject, {...props, lifecycle})};
            });
            context.onDispose(context.editorShell.registerDockPanel({
                id: 'sub-project', label: '子项目', icon: <FolderClose theme="outline" size={20}/>, order: 60,
                Panel,
            }));
        },
    };
}
