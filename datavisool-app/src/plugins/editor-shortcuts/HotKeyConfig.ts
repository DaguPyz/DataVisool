/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorCommandService} from '@datavisool/sdk/plugin/contracts/editorCommands';
import {getShortcutDefinition} from '@/plugins/editor-shortcuts/core/ShortcutRegistry.ts';
import {
    SHORTCUT_ACTION_IDS,
    type ShortcutActionId,
    type ShortcutHandlerRegistration,
    type ShortcutHandlerMap,
} from '@datavisool/sdk/plugin/contracts/editorShortcuts';

const handlerEntry = (
    actionId: ShortcutActionId,
    handler: ShortcutHandlerRegistration['handler'],
): ShortcutHandlerRegistration => ({
    handler,
    contexts: getShortcutDefinition(actionId).contexts,
});

export const createHotkeyConfigs = (
    saveThrottled: () => void,
    canvas: EditorCanvasService,
    commands: EditorCommandService,
    runOperation: (operation: () => unknown) => unknown,
): ShortcutHandlerMap => {
    const entry = (actionId: ShortcutActionId, handler: ShortcutHandlerRegistration['handler']) => {
        const handlers = Array.isArray(handler) ? handler : [handler];
        return handlerEntry(actionId, handlers.map(fn => (event: KeyboardEvent) => runOperation(() => fn(event))));
    };
    const run = (action: Parameters<EditorCanvasService['performAction']>[0]) => () => {
        return canvas.performAction(action).catch(error => console.error('执行画布操作失败', error));
    };
    const command = <Key extends Parameters<EditorCommandService['has']>[0]>(
        id: Key, ...args: import('@datavisool/sdk/plugin/contracts/editorCommands').EditorCommandArgs<Key>
    ) => () => {
        if (commands.has(id)) return commands.execute(id, ...args).catch(error => {
            if (error?.name !== 'AbortError') console.error('执行编辑命令失败', error);
        });
    };
    return ({
    [SHORTCUT_ACTION_IDS.SELECT_ALL]: entry(SHORTCUT_ACTION_IDS.SELECT_ALL, run('selectAll')),
    [SHORTCUT_ACTION_IDS.CLONE]: entry(SHORTCUT_ACTION_IDS.CLONE, run('doClone')),
    [SHORTCUT_ACTION_IDS.COPY]: entry(SHORTCUT_ACTION_IDS.COPY, run('doCopy')),
    [SHORTCUT_ACTION_IDS.DELETE]: entry(SHORTCUT_ACTION_IDS.DELETE, [command('blueprint.delete-selection'), run('doDelete')]),
    [SHORTCUT_ACTION_IDS.LOCK]: entry(SHORTCUT_ACTION_IDS.LOCK, run('doLock')),
    [SHORTCUT_ACTION_IDS.UNLOCK]: entry(SHORTCUT_ACTION_IDS.UNLOCK, run('doUnLock')),
    [SHORTCUT_ACTION_IDS.HIDE]: entry(SHORTCUT_ACTION_IDS.HIDE, run('doHide')),
    [SHORTCUT_ACTION_IDS.LAYER_TO_TOP]: entry(SHORTCUT_ACTION_IDS.LAYER_TO_TOP, run('layerToTop')),
    [SHORTCUT_ACTION_IDS.LAYER_TO_BOTTOM]: entry(SHORTCUT_ACTION_IDS.LAYER_TO_BOTTOM, run('layerToBottom')),
    [SHORTCUT_ACTION_IDS.LAYER_MOVE_UP]: entry(SHORTCUT_ACTION_IDS.LAYER_MOVE_UP, run('layerMoveUp')),
    [SHORTCUT_ACTION_IDS.LAYER_MOVE_DOWN]: entry(SHORTCUT_ACTION_IDS.LAYER_MOVE_DOWN, run('layerMoveDown')),
    [SHORTCUT_ACTION_IDS.SAVE]: entry(SHORTCUT_ACTION_IDS.SAVE, saveThrottled),
    [SHORTCUT_ACTION_IDS.UNDO]: entry(SHORTCUT_ACTION_IDS.UNDO, () => canvas.undo()),
    [SHORTCUT_ACTION_IDS.REDO]: entry(SHORTCUT_ACTION_IDS.REDO, () => canvas.redo()),
    [SHORTCUT_ACTION_IDS.TOGGLE_AUXILIARY_BORDER]: entry(SHORTCUT_ACTION_IDS.TOGGLE_AUXILIARY_BORDER, run('toggleSecondaryBorder')),
    [SHORTCUT_ACTION_IDS.TOGGLE_PROJECT_PANEL]: entry(SHORTCUT_ACTION_IDS.TOGGLE_PROJECT_PANEL, command('project.dialog', 'project', {toggle: true})),
    [SHORTCUT_ACTION_IDS.TOGGLE_CANVAS_PANEL]: entry(SHORTCUT_ACTION_IDS.TOGGLE_CANVAS_PANEL, command('project.dialog', 'canvas', {toggle: true})),
    [SHORTCUT_ACTION_IDS.TOGGLE_THEME_PANEL]: entry(SHORTCUT_ACTION_IDS.TOGGLE_THEME_PANEL, command('project.dialog', 'theme', {toggle: true})),
    [SHORTCUT_ACTION_IDS.TOGGLE_SHORTCUT_PANEL]: entry(SHORTCUT_ACTION_IDS.TOGGLE_SHORTCUT_PANEL, command('shortcuts.help', {toggle: true})),
    [SHORTCUT_ACTION_IDS.OPEN_AI_CONSOLE]: entry(SHORTCUT_ACTION_IDS.OPEN_AI_CONSOLE, command('assistant.open')),
    [SHORTCUT_ACTION_IDS.MOVE_UP]: entry(SHORTCUT_ACTION_IDS.MOVE_UP, run('doMoveUp')),
    [SHORTCUT_ACTION_IDS.MOVE_DOWN]: entry(SHORTCUT_ACTION_IDS.MOVE_DOWN, run('doMoveDown')),
    [SHORTCUT_ACTION_IDS.MOVE_LEFT]: entry(SHORTCUT_ACTION_IDS.MOVE_LEFT, run('doMoveLeft')),
    [SHORTCUT_ACTION_IDS.MOVE_RIGHT]: entry(SHORTCUT_ACTION_IDS.MOVE_RIGHT, run('doMoveRight')),
    [SHORTCUT_ACTION_IDS.EXPAND_UP]: entry(SHORTCUT_ACTION_IDS.EXPAND_UP, run('doBaseBottomEnlargeUp')),
    [SHORTCUT_ACTION_IDS.EXPAND_DOWN]: entry(SHORTCUT_ACTION_IDS.EXPAND_DOWN, run('doBaseUpEnlargeDown')),
    [SHORTCUT_ACTION_IDS.EXPAND_LEFT]: entry(SHORTCUT_ACTION_IDS.EXPAND_LEFT, run('doBaseRightEnlargeLeft')),
    [SHORTCUT_ACTION_IDS.EXPAND_RIGHT]: entry(SHORTCUT_ACTION_IDS.EXPAND_RIGHT, run('doBaseLeftEnlargeRight')),
    [SHORTCUT_ACTION_IDS.SHRINK_UP]: entry(SHORTCUT_ACTION_IDS.SHRINK_UP, run('doBaseBottomDecreaseUp')),
    [SHORTCUT_ACTION_IDS.SHRINK_DOWN]: entry(SHORTCUT_ACTION_IDS.SHRINK_DOWN, run('doBaseUpDecreaseDown')),
    [SHORTCUT_ACTION_IDS.SHRINK_LEFT]: entry(SHORTCUT_ACTION_IDS.SHRINK_LEFT, run('doBaseRightDecreaseLeft')),
    [SHORTCUT_ACTION_IDS.SHRINK_RIGHT]: entry(SHORTCUT_ACTION_IDS.SHRINK_RIGHT, run('doBaseLeftDecreaseRight')),
    [SHORTCUT_ACTION_IDS.GROUP]: entry(SHORTCUT_ACTION_IDS.GROUP, run('doGrouping')),
    [SHORTCUT_ACTION_IDS.UNGROUP]: entry(SHORTCUT_ACTION_IDS.UNGROUP, run('doUnGrouping')),
    [SHORTCUT_ACTION_IDS.REMOVE_FROM_GROUP]: entry(SHORTCUT_ACTION_IDS.REMOVE_FROM_GROUP, run('removeFromGroup')),
    [SHORTCUT_ACTION_IDS.SEARCH_LAYER]: entry(SHORTCUT_ACTION_IDS.SEARCH_LAYER, command('layers.search')),
    [SHORTCUT_ACTION_IDS.ALIGN_TOP]: entry(SHORTCUT_ACTION_IDS.ALIGN_TOP, run('groupTopAligned')),
    [SHORTCUT_ACTION_IDS.ALIGN_BOTTOM]: entry(SHORTCUT_ACTION_IDS.ALIGN_BOTTOM, run('groupBottomAligned')),
    [SHORTCUT_ACTION_IDS.ALIGN_LEFT]: entry(SHORTCUT_ACTION_IDS.ALIGN_LEFT, run('groupLeftAligned')),
    [SHORTCUT_ACTION_IDS.ALIGN_RIGHT]: entry(SHORTCUT_ACTION_IDS.ALIGN_RIGHT, run('groupRightAligned')),
    [SHORTCUT_ACTION_IDS.CANVAS_TOOL_SELECT]: entry(SHORTCUT_ACTION_IDS.CANVAS_TOOL_SELECT, run('selectTool')),
    [SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND]: entry(SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND, run('handTool')),
    [SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND]: entry(
        SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND,
        (event) => event.preventDefault(),
    ),
    });
};
