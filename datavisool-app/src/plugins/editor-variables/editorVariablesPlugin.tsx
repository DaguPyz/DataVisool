/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {CodeBrackets} from '@icon-park/react';

export function createEditorVariablesPlugin(): Plugin {
    return {
        id: 'editor-variables',
        requires: ['designerRuntime', 'editorShell'],
        provides: [],
        activate(context) {
            let active = true;
            let accepting = true;
            const pendingTasks = new Set<Promise<unknown>>();
            const trackTask = <T,>(task: Promise<T>) => {
                pendingTasks.add(task);
                const remove = () => pendingTasks.delete(task);
                void task.then(remove, remove);
                return task;
            };
            const canEdit = () => active && accepting;
            context.onStop({
                pause() { accepting = false; },
                async prepare() { await Promise.allSettled([...pendingTasks]); },
                cancel() { if (active) accepting = true; },
            });
            context.onDispose(() => { active = false; accepting = false; });
            context.onDispose(context.editorShell.registerDockPanel({
                id: 'global-variable', label: '全局变量', icon: <CodeBrackets theme="outline" size={20}/>, order: 50,
                Panel: lazy(async () => {
                    const {default: GlobalVariableList} = await import('./GlobalVariableList.tsx');
                    return {default: props => <GlobalVariableList {...props} canEdit={canEdit} trackTask={trackTask}/>};
                }),
            }));
        },
    };
}
