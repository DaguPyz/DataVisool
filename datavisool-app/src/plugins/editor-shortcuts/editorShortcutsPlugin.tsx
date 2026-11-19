/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {Help} from '@icon-park/react';
import {reaction} from 'mobx';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {} from '@datavisool/sdk/plugin/contracts/editorCommands';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import {ShortcutStore} from './core/ShortcutStore.ts';
import {ShortcutContext} from './ShortcutContext.ts';
import {createShortcutEffects} from './shortcutEffects.ts';

export function createEditorShortcutsPlugin(): Plugin {
    return {
        id: 'editor-shortcuts',
        requires: ['editorProject', 'editorCanvas', 'editorShell', 'editorCommands'],
        provides: [],
        activate(context) {
            const {editorCanvas, editorShell, editorCommands} = context;
            const store = new ShortcutStore();
            const effects = createShortcutEffects();
            const value = {store, effects, readCanvasInput: () => editorCanvas.readInputContext()};
            let acceptingCommands = true;
            context.onStop({
                pause() { acceptingCommands = false; store.pause(); effects.pause(); },
                async prepare() {
                    await effects.waitForTasks();
                    if (store.saveState === 'error') await store.retrySave();
                    else await store.flushPendingSave();
                    if (store.saveError) throw new Error(`保存快捷键配置失败：${store.saveError}`);
                },
                cancel() { acceptingCommands = true; store.resume(); effects.resume(); },
            });
            context.onDispose(() => { acceptingCommands = false; });
            context.onDispose(() => store.dispose());
            context.onDispose(() => effects.dispose());
            context.onDispose(effects.register(() => editorCanvas.registerShortcutInput({
                isActive: (id, event) => store.isActive(id, event),
                isActiveWithExactModifiers: (id, event) => store.isActiveWithExactModifiers(id, event),
                subscribePressedState: listener => reaction(
                    () => [store.pressedStateVersion, store.capturingActionId, [...store.overrides]] as const,
                    listener,
                ),
            })));
            context.onDispose(editorShell.registerView('shortcuts', lazy(async () => {
                const {default: KeyboardBindings} = await import('./KeyboardBindings.tsx');
                return {default: () => <ShortcutContext.Provider value={value}><KeyboardBindings canvas={editorCanvas}/></ShortcutContext.Provider>};
            })));
            context.onDispose(editorShell.registerOverlay({
                id: 'shortcut-help',
                group: 'shortcut-help',
                View: lazy(async () => {
                    const {default: ShortcutHelp} = await import('./ShortcutHelp.tsx');
                    return {default: props => <ShortcutContext.Provider value={value}><ShortcutHelp {...props}/></ShortcutContext.Provider>};
                }),
            }));
            const ShortcutHelpToolbarButton = () => <button type="button" className="workspace-icon-button"
                aria-label="快捷键帮助" title="帮助与快捷键"
                onClick={() => { void editorCommands.execute('shortcuts.help').catch(error => console.error('打开快捷键帮助失败', error)); }}>
                <Help theme="outline" size={18}/>
            </button>;
            context.onDispose(editorShell.registerToolbarItem({
                id: 'shortcut-help',
                group: 'history',
                order: 51,
                groupClassName: 'workspace-toolbar-history',
                dividerClassName: 'workspace-toolbar-history-divider',
                View: ShortcutHelpToolbarButton,
            }));
            context.onDispose(editorCommands.register('shortcuts.help', (signal, options) => {
                if (!acceptingCommands || signal.aborted) return;
                if (options?.toggle && editorShell.isOverlayOpen('shortcut-help'))
                    editorShell.closeOverlay('shortcut-help');
                else
                    editorShell.openOverlay('shortcut-help');
            }));
            context.onDispose(() => editorShell.closeOverlay('shortcut-help'));
        },
    };
}
