/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
export const SHORTCUT_ACTION_IDS = {
    SELECT_ALL: 'designer.selectAll',
    CLONE: 'designer.clone',
    COPY: 'designer.copy',
    DELETE: 'designer.delete',
    LOCK: 'designer.lock',
    UNLOCK: 'designer.unlock',
    HIDE: 'designer.hide',
    LAYER_TO_TOP: 'designer.layer.toTop',
    LAYER_TO_BOTTOM: 'designer.layer.toBottom',
    LAYER_MOVE_UP: 'designer.layer.moveUp',
    LAYER_MOVE_DOWN: 'designer.layer.moveDown',
    SAVE: 'designer.save',
    UNDO: 'designer.history.undo',
    REDO: 'designer.history.redo',
    TOGGLE_AUXILIARY_BORDER: 'designer.auxiliaryBorder.toggle',
    TOGGLE_PROJECT_PANEL: 'designer.panel.project.toggle',
    TOGGLE_CANVAS_PANEL: 'designer.panel.canvas.toggle',
    TOGGLE_THEME_PANEL: 'designer.panel.theme.toggle',
    TOGGLE_SHORTCUT_PANEL: 'designer.panel.shortcuts.toggle',
    OPEN_AI_CONSOLE: 'designer.ai.open',
    MOVE_UP: 'designer.move.up',
    MOVE_DOWN: 'designer.move.down',
    MOVE_LEFT: 'designer.move.left',
    MOVE_RIGHT: 'designer.move.right',
    EXPAND_UP: 'designer.resize.expand.up',
    EXPAND_DOWN: 'designer.resize.expand.down',
    EXPAND_LEFT: 'designer.resize.expand.left',
    EXPAND_RIGHT: 'designer.resize.expand.right',
    SHRINK_UP: 'designer.resize.shrink.up',
    SHRINK_DOWN: 'designer.resize.shrink.down',
    SHRINK_LEFT: 'designer.resize.shrink.left',
    SHRINK_RIGHT: 'designer.resize.shrink.right',
    GROUP: 'designer.group.create',
    UNGROUP: 'designer.group.ungroup',
    REMOVE_FROM_GROUP: 'designer.group.remove',
    SEARCH_LAYER: 'designer.layer.search',
    ALIGN_TOP: 'designer.align.top',
    ALIGN_BOTTOM: 'designer.align.bottom',
    ALIGN_LEFT: 'designer.align.left',
    ALIGN_RIGHT: 'designer.align.right',
    SELECTION_TOGGLE: 'designer.selection.toggle',
    SELECTION_DEEP: 'designer.selection.deep',
    BOX_SELECTION_START: 'designer.selection.boxStart',
    BOX_SELECTION_CONTAIN: 'designer.selection.boxContain',
    AXIS_LOCK: 'designer.transform.axisLock',
    PASTE_GUIDE: 'designer.guide.paste',
    CANVAS_ZOOM_GUIDE: 'designer.guide.canvasZoom',
    CANVAS_PAN_GUIDE: 'designer.guide.canvasPan',
    CANVAS_TOOL_SELECT: 'designer.canvas.tool.select',
    CANVAS_TOOL_HAND: 'designer.canvas.tool.hand',
    CANVAS_TOOL_TEMPORARY_HAND: 'designer.canvas.tool.temporaryHand',
} as const;

export type ShortcutActionId = typeof SHORTCUT_ACTION_IDS[keyof typeof SHORTCUT_ACTION_IDS];

export type ShortcutPlatform = 'mac' | 'windows';

export type ShortcutModifier = 'primary' | 'control' | 'meta' | 'alt' | 'shift';

export type ShortcutKey =
    | {kind: 'code'; code: string}
    | {kind: 'modifier'; modifier: ShortcutModifier};

export type ShortcutTrigger = 'press' | 'hold';

export interface ShortcutBinding {
    key: ShortcutKey;
    modifiers: ShortcutModifier[];
    trigger: ShortcutTrigger;
}

export type ShortcutBindingOverride = ShortcutBinding | null;

export type ShortcutContext =
    | 'designer'
    | 'canvas'
    | 'canvas.selection'
    | 'canvas.drag'
    | 'canvas.tool'
    | 'layer-list'
    | 'blueprint';

export interface ShortcutDefinitionBase {
    id: ShortcutActionId;
    label: string;
    contexts: readonly ShortcutContext[];
    visible?: boolean;
}

export interface KeyboardShortcutDefinition extends ShortcutDefinitionBase {
    kind: 'shortcut';
    defaultBinding: ShortcutBinding | Record<ShortcutPlatform, ShortcutBinding>;
    allowInInput?: boolean;
    repeat?: boolean;
    /** Default tool bindings yield to user-configured bindings in overlapping canvas contexts. */
    defaultPriority?: 'yield-to-custom';
}

export interface ShortcutGuideDefinition extends ShortcutDefinitionBase {
    kind: 'guide';
    display: Record<ShortcutPlatform, readonly string[]>;
}

export type ShortcutDefinition = KeyboardShortcutDefinition | ShortcutGuideDefinition;

export interface ShortcutPreferencesV1 {
    version: 1;
    updatedAt: number;
    overrides: Partial<Record<ShortcutActionId, ShortcutBindingOverride>>;
}

export type ShortcutLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type ShortcutSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface ShortcutConflict {
    actionId: ShortcutActionId;
    label: string;
}

export type ShortcutBindingUpdateResult =
    | {ok: true}
    | {ok: false; reason: 'invalid'; message: string}
    | {ok: false; reason: 'conflict'; conflicts: ShortcutConflict[]};

export type ShortcutHandler = (event: KeyboardEvent) => unknown;

export interface ShortcutHandlerRegistration {
    handler: ShortcutHandler | readonly ShortcutHandler[];
    contexts: readonly ShortcutContext[];
}

export type ShortcutHandlerMap = Partial<Record<ShortcutActionId, ShortcutHandlerRegistration>>;
