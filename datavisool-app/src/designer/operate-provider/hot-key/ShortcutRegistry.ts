/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {
    SHORTCUT_ACTION_IDS,
    type KeyboardShortcutDefinition,
    type ShortcutActionId,
    type ShortcutBinding,
    type ShortcutContext,
    type ShortcutDefinition,
    type ShortcutModifier,
    type ShortcutPlatform,
} from './ShortcutTypes.ts';

const DESIGNER_CONTEXT = ['designer'] as const;
const CANVAS_AND_LAYER_CONTEXT = ['canvas', 'layer-list'] as const;
const CANVAS_CONTEXT = ['canvas'] as const;
const CANVAS_TOOL_CONTEXT = ['canvas.tool'] as const;
const DELETE_CONTEXT = ['canvas', 'layer-list', 'blueprint'] as const;
const SELECTION_CONTEXT = ['canvas.selection'] as const;
const DRAG_CONTEXT = ['canvas.drag'] as const;

export const codeBinding = (
    code: string,
    modifiers: ShortcutModifier[] = [],
    trigger: ShortcutBinding['trigger'] = 'press',
): ShortcutBinding => ({
    key: {kind: 'code', code},
    modifiers,
    trigger,
});

export const modifierBinding = (
    modifier: ShortcutModifier,
    modifiers: ShortcutModifier[] = [],
): ShortcutBinding => ({
    key: {kind: 'modifier', modifier},
    modifiers,
    trigger: 'hold',
});

const shortcut = (
    id: ShortcutActionId,
    label: string,
    defaultBinding: KeyboardShortcutDefinition['defaultBinding'],
    contexts: readonly ShortcutContext[],
    options: Pick<KeyboardShortcutDefinition, 'allowInInput' | 'repeat' | 'visible' | 'defaultPriority'> = {},
): KeyboardShortcutDefinition => ({
    id,
    label,
    kind: 'shortcut',
    defaultBinding,
    contexts,
    ...options,
});

export const shortcutDefinitions: readonly ShortcutDefinition[] = [
    shortcut(SHORTCUT_ACTION_IDS.SAVE, '保存项目', codeBinding('KeyS', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.SELECT_ALL, '全选组件', codeBinding('KeyA', ['primary']), CANVAS_AND_LAYER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.CLONE, '克隆组件', codeBinding('KeyD', ['primary']), CANVAS_AND_LAYER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.COPY, '复制组件', codeBinding('KeyC', ['primary']), CANVAS_AND_LAYER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.DELETE, '删除组件', {
        windows: codeBinding('Delete'),
        mac: codeBinding('Backspace', ['primary']),
    }, DELETE_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.LOCK, '锁定组件', codeBinding('KeyL', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.UNLOCK, '解锁组件', codeBinding('KeyL', ['primary', 'shift']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.HIDE, '隐藏组件', codeBinding('KeyH', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.TOGGLE_AUXILIARY_BORDER, '开/关辅助边框', codeBinding('KeyK', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.LAYER_TO_TOP, '图层置顶', codeBinding('ArrowUp', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.LAYER_TO_BOTTOM, '图层置底', codeBinding('ArrowDown', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.LAYER_MOVE_UP, '图层上移', codeBinding('ArrowUp', ['alt']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.LAYER_MOVE_DOWN, '图层下移', codeBinding('ArrowDown', ['alt']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.MOVE_UP, '组件上移', codeBinding('ArrowUp'), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.MOVE_DOWN, '组件下移', codeBinding('ArrowDown'), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.MOVE_LEFT, '组件左移', codeBinding('ArrowLeft'), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.MOVE_RIGHT, '组件右移', codeBinding('ArrowRight'), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.EXPAND_UP, '组件上扩大', codeBinding('ArrowUp', ['primary', 'shift']), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.EXPAND_DOWN, '组件下扩大', codeBinding('ArrowDown', ['primary', 'shift']), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.EXPAND_LEFT, '组件左扩大', codeBinding('ArrowLeft', ['primary', 'shift']), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.EXPAND_RIGHT, '组件右扩大', codeBinding('ArrowRight', ['primary', 'shift']), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.SHRINK_UP, '组件上缩小', codeBinding('ArrowUp', ['primary', 'alt']), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.SHRINK_DOWN, '组件下缩小', codeBinding('ArrowDown', ['primary', 'alt']), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.SHRINK_LEFT, '组件左缩小', codeBinding('ArrowLeft', ['primary', 'alt']), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.SHRINK_RIGHT, '组件右缩小', codeBinding('ArrowRight', ['primary', 'alt']), CANVAS_AND_LAYER_CONTEXT, {repeat: true}),
    shortcut(SHORTCUT_ACTION_IDS.UNDO, '撤销', codeBinding('KeyZ', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.REDO, '重做', codeBinding('KeyZ', ['primary', 'shift']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.TOGGLE_PROJECT_PANEL, '打开/关闭项目设置', codeBinding('Digit1', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.TOGGLE_CANVAS_PANEL, '打开/关闭画布设置', codeBinding('Digit2', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.TOGGLE_THEME_PANEL, '打开/关闭全局主题设置', codeBinding('Digit3', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.TOGGLE_SHORTCUT_PANEL, '打开/关闭快捷键设置', codeBinding('Digit4', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.OPEN_AI_CONSOLE, '打开AI驱动控制台', codeBinding('KeyA', ['primary', 'alt']), DESIGNER_CONTEXT, {allowInInput: true}),
    shortcut(SHORTCUT_ACTION_IDS.GROUP, '编组', codeBinding('KeyG', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.UNGROUP, '解除编组', codeBinding('KeyG', ['primary', 'shift']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.REMOVE_FROM_GROUP, '从分组中移除', codeBinding('KeyG', ['alt', 'shift']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.SEARCH_LAYER, '搜索图层/组件', codeBinding('KeyF', ['primary']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.ALIGN_TOP, '组内上对齐', codeBinding('ArrowUp', ['shift']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.ALIGN_BOTTOM, '组内下对齐', codeBinding('ArrowDown', ['shift']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.ALIGN_LEFT, '组内左对齐', codeBinding('ArrowLeft', ['shift']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.ALIGN_RIGHT, '组内右对齐', codeBinding('ArrowRight', ['shift']), DESIGNER_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.SELECTION_TOGGLE, '增加/取消选择', modifierBinding('shift'), SELECTION_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.SELECTION_DEEP, '深入选择分组子元素', modifierBinding('primary'), SELECTION_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.BOX_SELECTION_START, '从元素上开始框选', codeBinding('KeyX', [], 'hold'), SELECTION_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.BOX_SELECTION_CONTAIN, '临时完整包含框选', modifierBinding('alt'), SELECTION_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.AXIS_LOCK, '拖拽锁轴', modifierBinding('shift'), DRAG_CONTEXT),
    shortcut(SHORTCUT_ACTION_IDS.CANVAS_TOOL_SELECT, '选择工具', codeBinding('KeyV'), CANVAS_TOOL_CONTEXT, {defaultPriority: 'yield-to-custom'}),
    shortcut(SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND, '抓手工具', codeBinding('KeyH'), CANVAS_TOOL_CONTEXT, {defaultPriority: 'yield-to-custom'}),
    shortcut(SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND, '临时抓手工具', codeBinding('Space', [], 'hold'), CANVAS_TOOL_CONTEXT, {defaultPriority: 'yield-to-custom'}),
    {
        id: SHORTCUT_ACTION_IDS.PASTE_GUIDE,
        label: '粘贴组件',
        kind: 'guide',
        contexts: CANVAS_AND_LAYER_CONTEXT,
        display: {windows: ['Ctrl', 'V'], mac: ['Command', 'V']},
    },
    {
        id: SHORTCUT_ACTION_IDS.CANVAS_ZOOM_GUIDE,
        label: '缩放画布',
        kind: 'guide',
        contexts: CANVAS_CONTEXT,
        display: {windows: ['Alt', '鼠标滚轮'], mac: ['Option', '鼠标滚轮']},
    },
    {
        id: SHORTCUT_ACTION_IDS.CANVAS_PAN_GUIDE,
        label: '拖拽画布',
        kind: 'guide',
        contexts: CANVAS_CONTEXT,
        display: {windows: ['长按鼠标右键'], mac: ['长按鼠标右键']},
    },
];

const shortcutDefinitionMap = new Map(shortcutDefinitions.map((definition) => [definition.id, definition]));

export const getShortcutDefinition = (actionId: ShortcutActionId): ShortcutDefinition => {
    const definition = shortcutDefinitionMap.get(actionId);
    if (!definition)
        throw new Error(`Unknown shortcut action: ${actionId}`);
    return definition;
};

export const isKeyboardShortcutDefinition = (
    definition: ShortcutDefinition,
): definition is KeyboardShortcutDefinition => definition.kind === 'shortcut';

export const resolveDefaultBinding = (
    definition: KeyboardShortcutDefinition,
    platform: ShortcutPlatform,
): ShortcutBinding => {
    const binding = definition.defaultBinding;
    return 'key' in binding ? binding : binding[platform];
};

const contextOverlaps = (left: ShortcutContext, right: ShortcutContext): boolean => {
    if (left === right || left === 'designer' || right === 'designer')
        return true;

    if (left === 'canvas.tool' || right === 'canvas.tool')
        return ['canvas', 'canvas.selection', 'canvas.drag', 'canvas.tool'].includes(left === 'canvas.tool' ? right : left);

    if (left === 'canvas')
        return right === 'canvas.selection' || right === 'canvas.drag';
    if (right === 'canvas')
        return left === 'canvas.selection' || left === 'canvas.drag';

    return false;
};

export const shortcutContextsOverlap = (
    left: readonly ShortcutContext[],
    right: readonly ShortcutContext[],
): boolean => left.some((leftContext) => right.some((rightContext) => contextOverlaps(leftContext, rightContext)));
