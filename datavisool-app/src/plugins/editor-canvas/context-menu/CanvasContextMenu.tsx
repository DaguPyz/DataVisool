/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {type ReactNode, useEffect} from 'react';
import {useEditorCommands} from '@/shared/designer/EditorCommandContext.ts';
import {useEditorShell} from '@/shared/designer/EditorShellContext.ts';
import type {EditorShellService} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {EditorCommandService} from '@datavisool/sdk/plugin/contracts/editorCommands';
import {useEditorWorkspace} from '@/shared/designer/EditorWorkspaceContext.ts';
import {observer} from "mobx-react";
import LayerUtil from "@/plugins/editor-canvas/layers/LayerUtil";
import {useEditorCanvasActivation} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';
import {
    AlignBottomTwo,
    AlignLeftTwo,
    AlignRightTwo,
    AlignTopTwo,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Clear,
    Code,
    Command,
    Copy,
    CopyOne,
    Cycle,
    DeleteKey,
    DeleteOne,
    Down,
    Group,
    LinkRight,
    Lock,
    Layers,
    PageTemplate,
    PreviewClose,
    ToBottomOne,
    ToTopOne,
    Unlock,
    Ungroup,
    Up
} from "@icon-park/react";
import ContextMenu from "@/framework/context-menu/ContextMenu.tsx";
import {openDevTools} from "@/util/DevToolsUtil.ts";
import {SHORTCUT_ACTION_IDS, type ShortcutActionId} from '@datavisool/sdk/plugin/contracts/editorShortcuts';
import {
    getSelectionLockState,
} from "@/plugins/editor-canvas/selection/SelectionPolicy.ts";
import './CanvasContextMenu.less';


const devToolsMenuItem = {
    name: '打开 DevTools',
    icon: Code,
    onClick: openDevTools,
    separated: true,
};

const renderShortcutKey = (part: string): ReactNode => {
    const iconProps = {
        className: 'context-menu-shortcut-key-icon',
        size: 13,
        strokeWidth: 3,
        'aria-label': part,
    };

    switch (part) {
        case 'Command':
            return <Command {...iconProps}/>;
        case 'Option':
            return <span className="context-menu-shortcut-key-symbol" aria-label={part}>⌥</span>;
        case 'Backspace':
            return <DeleteKey {...iconProps}/>;
        case '方向上键':
            return <ArrowUp {...iconProps}/>;
        case '方向下键':
            return <ArrowDown {...iconProps}/>;
        case '方向左键':
            return <ArrowLeft {...iconProps}/>;
        case '方向右键':
            return <ArrowRight {...iconProps}/>;
        default:
            return part;
    }
};

const getShortcut = (actionId: ShortcutActionId, shell: EditorShellService): ReactNode | undefined => {
    return shell.readShortcutHint(actionId)?.map((part, index) => (
        <span className="context-menu-shortcut-part" key={`${actionId}-${part}-${index}`}>
            {index > 0 ? <span className="context-menu-shortcut-separator">+</span> : null}
            <span className="context-menu-shortcut-key">
                {renderShortcutKey(part)}
            </span>
        </span>
    ));
};

const buildDefaultDesignerMenus = (shell: EditorShellService, commands: EditorCommandService, actions: ReturnType<typeof useEditorCanvasActivation>['actions']) => [
    {
        name: '克隆',
        icon: CopyOne,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.CLONE, shell),
        onClick: actions.doClone,
    },
    {
        name: '复制',
        icon: Copy,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.COPY, shell),
        onClick: actions.doCopy,
    },
    {
        name: '上移',
        icon: Up,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.LAYER_MOVE_UP, shell),
        onClick: actions.layerMoveUp,
    },
    {
        name: '下移',
        icon: Down,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.LAYER_MOVE_DOWN, shell),
        onClick: actions.layerMoveDown,
    },
    {
        name: '置顶',
        icon: ToTopOne,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.LAYER_TO_TOP, shell),
        onClick: actions.layerToTop,
    },
    {
        name: '置底',
        icon: ToBottomOne,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.LAYER_TO_BOTTOM, shell),
        onClick: actions.layerToBottom,
    },
    {
        name: '删除',
        icon: DeleteOne,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.DELETE, shell),
        onClick: actions.doDelete,
        className: 'context-menu-item-danger',
    },
    {
        name: '隐藏',
        icon: PreviewClose,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.HIDE, shell),
        onClick: actions.doHide,
    },
    ...(commands.has('template.save-selection') ? [{
        name: '存为模板',
        icon: PageTemplate,
        onClick: () => { void commands.execute('template.save-selection').catch(error => {
            if (error?.name !== 'AbortError') console.error('保存模板失败', error);
        }); },
    }] : []),
    {
        name: '清理空分组',
        icon: Clear,
        onClick: actions.cleanEmptyGroupings,
    }
];

const CanvasContextMenu = observer(() => {
    const activation = useEditorCanvasActivation();
    const {contextMenuStore, eventOperateStore, actions} = activation;
    const canEdit = activation.canEdit();
    useEffect(() => {
        if (!canEdit || !activation.canEdit()) return undefined;
        let dismissTimer: ReturnType<typeof setTimeout> | undefined;
        const onClick = (event: MouseEvent) => {
            if (event.button !== 0 || !contextMenuStore.canvasMenuVisible) return;
            const lifecycleVersion = contextMenuStore.getDismissVersion();
            // Let the menu item's click handler run before its DOM is removed.
            dismissTimer = setTimeout(() => {
                dismissTimer = undefined;
                if (contextMenuStore.isDismissVersionCurrent(lifecycleVersion))
                    contextMenuStore.updateCanvasMenuVisible(false);
            });
        };
        const onContextMenu = (event: MouseEvent) => {
            const {rightDragActive, consumeSuppressedContextMenu, hideMenu, requestCanvasMenu} = contextMenuStore;
            if (rightDragActive || consumeSuppressedContextMenu()) {
                event.preventDefault();
                hideMenu();
                return;
            }
            const target = event.target;
            const eventContainer = document.querySelector('.datavisool-event-container');
            const layerListContainer = document.querySelector('.layer-items');
            if (target instanceof Node && (eventContainer?.contains(target) || layerListContainer?.contains(target))) {
                event.preventDefault();
                requestCanvasMenu([event.clientX, event.clientY]);
            } else {
                hideMenu();
            }
        };
        const onPointerUp = (event: PointerEvent) => contextMenuStore.setPointerTarget(event.target);

        document.addEventListener('click', onClick);
        document.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('pointerup', onPointerUp);
        return () => {
            document.removeEventListener('click', onClick);
            document.removeEventListener('contextmenu', onContextMenu);
            document.removeEventListener('pointerup', onPointerUp);
            if (dismissTimer !== undefined) clearTimeout(dismissTimer);
        };
    }, [canEdit]);

    const workspace = useEditorWorkspace();
    const commands = useEditorCommands();
    const shell = useEditorShell();

    if (!canEdit) return null;

    const calculateMenus = () => {
        const layerConfigs = {...activation.sceneStore.readLayerConfigs()};
        // Model history can remove a layer before the selection event reaches the view.
        const targetIds = eventOperateStore.targetIds.filter(id => Boolean(layerConfigs[id]));
        const candidates = contextMenuStore.canvasMenuCandidates.filter(candidate => Boolean(layerConfigs[candidate.id]));
        const selectLayerMenu = candidates.length > 0 ? {
            name: '选择图层',
            icon: Layers,
            children: candidates.map((candidate) => ({
                name: `${candidate.locked ? '🔒 ' : ''}${candidate.name}`,
                icon: candidate.locked ? Lock : Layers,
                onClick: () => {
                    eventOperateStore.setTargetIds([candidate.id], 'context-menu', {kind: 'inspect', id: candidate.id});
                },
            })),
        } : null;
        if (targetIds.length === 0)
            return selectLayerMenu ? [selectLayerMenu, devToolsMenuItem] : [devToolsMenuItem];
        const menus = buildDefaultDesignerMenus(shell, commands, actions);
        if (!activation.readScene()) return menus;
        const {hasLocked, hasUnlocked} = getSelectionLockState(targetIds, layerConfigs);
        if (hasLocked) {
            menus.push({
                name: '解锁',
                icon: Unlock,
                shortcut: getShortcut(SHORTCUT_ACTION_IDS.UNLOCK, shell),
                onClick: actions.doUnLock,
            })
        }
        if (hasUnlocked) {
            menus.push({
                name: '锁定',
                icon: Lock,
                shortcut: getShortcut(SHORTCUT_ACTION_IDS.LOCK, shell),
                onClick: actions.doLock,
            })
        }
        if (targetIds.length === 1 && layerConfigs[targetIds[0]]?.type === 'LoopContainer') {
            menus.push({
                name: '循环容器',
                icon: Cycle,
                onClick: () => { workspace?.enterLoopContainer(targetIds[0]); },
            })
        }
        if (targetIds.length > 1) {
            menus.splice(6, 0, ...[
                {
                    name: '上对齐',
                    icon: AlignTopTwo,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.ALIGN_TOP, shell),
                onClick: actions.groupTopAligned
                },
                {
                    name: '下对齐',
                    icon: AlignBottomTwo,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.ALIGN_BOTTOM, shell),
                    onClick: actions.groupBottomAligned
                },
                {
                    name: '左对齐',
                    icon: AlignLeftTwo,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.ALIGN_LEFT, shell),
                    onClick: actions.groupLeftAligned,
                },
                {
                    name: '右对齐',
                    icon: AlignRightTwo,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.ALIGN_RIGHT, shell),
                    onClick: actions.groupRightAligned
                },
            ])
            if (!LayerUtil.hasSameGroup(targetIds, layerConfigs)) {
                menus.push({
                    name: '编组',
                    icon: Group,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.GROUP, shell),
                    onClick: actions.doGrouping,
                });
            }
        }
        let groupIds = LayerUtil.findTopGroupLayer(targetIds, true, layerConfigs);
        //过滤掉其中分组等于自身的图层（即非分组图层）
        groupIds = groupIds.filter((id: string) => layerConfigs[id].type === 'group');
        if (groupIds.length > 0) {
            menus.push({
                name: '解组',
                icon: Ungroup,
                shortcut: getShortcut(SHORTCUT_ACTION_IDS.UNGROUP, shell),
                onClick: actions.doUnGrouping,
            })
        }
        const noGroup = targetIds.some((id: string) => !layerConfigs[id].pid);
        if (!noGroup)
            menus.push({
                name: '移出分组',
                icon: LinkRight,
                shortcut: getShortcut(SHORTCUT_ACTION_IDS.REMOVE_FROM_GROUP, shell),
                onClick: actions.removeFromGroup
            })
        return [...(selectLayerMenu ? [selectLayerMenu] : []), ...menus, devToolsMenuItem];
    }

    const {canvasMenuVisible} = contextMenuStore;
    const menus = calculateMenus();

    return (
        <ContextMenu
            menus={menus}
            visible={canvasMenuVisible}
            position={contextMenuStore.position}
            className="canvas-context-menu"
            width={240}
            itemHeight={38}
        />
    );
})

export default CanvasContextMenu;
