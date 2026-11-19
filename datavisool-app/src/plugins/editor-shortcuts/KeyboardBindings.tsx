/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useMemo} from 'react';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import AuthTools from '@/util/AuthTools.ts';
import {createHotkeyConfigs} from './HotKeyConfig.ts';
import {useEditorCommands} from '@/shared/designer/EditorCommandContext.ts';
import {useEditorShell} from '@/shared/designer/EditorShellContext.ts';
import {getShortcutDisplayParts, getShortcutPlatform} from '@/plugins/editor-shortcuts/core/HotKeyPlatform.ts';
import {useShortcuts, useShortcutEffect} from './ShortcutContext.ts';
import {useEditorProject} from '@/shared/designer/EditorProjectContext.ts';
import HotKey from './HotKey.tsx';

export default function KeyboardBindings({canvas}: {canvas: EditorCanvasService}) {
    const {store: shortcutStore, effects} = useShortcuts();
    const commands = useEditorCommands();
    const shell = useEditorShell();
    const {saveThrottled} = useEditorProject();
    const bindings = useMemo(() => createHotkeyConfigs(saveThrottled, canvas, commands,
        operation => effects.run(operation).catch(error => console.error('执行快捷键操作失败', error))),
    [saveThrottled, canvas, commands, effects]);

    useShortcutEffect(() => shell.registerShortcutHints(id => {
        const binding = shortcutStore.getBinding(id);
        return binding ? getShortcutDisplayParts(binding, getShortcutPlatform()) : undefined;
    }), [shell, shortcutStore]);

    useShortcutEffect(() => {
        void shortcutStore.initialize(AuthTools.getUserId() ?? 'anonymous').catch(error => {
            console.warn('初始化用户快捷键失败', error);
        });
        const paste = (event: ClipboardEvent) => {
            void effects.run(() => canvas.paste(event.clipboardData?.getData('text/plain') ?? '')).catch(error => console.error('粘贴图层失败', error));
        };
        document.addEventListener('paste', paste);
        return () => document.removeEventListener('paste', paste);
    }, [canvas, shortcutStore]);

    return <HotKey handlerMapping={bindings}/>;
}
