/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {type ReactNode} from 'react';
import {observer} from "mobx-react";
import contextMenuStore from "@/designer/event/ContextMenuStore.ts";
import {
    cleanEmptyGroupings,
    doClone,
    doCopy,
    doDelete,
    doGrouping,
    doHide,
    doLock,
    doUnGrouping,
    doUnLock,
    editLoopContainer,
    groupBottomAligned,
    groupLeftAligned,
    groupRightAligned,
    groupTopAligned,
    layerMoveDown,
    layerMoveUp,
    layerToBottom,
    layerToTop,
    removeFromGroup,
    saveAsTemplate
} from "@/designer/operate-provider/hot-key/HotKeyImpl";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import LayerUtil from "@/designer/left/layer-list/util/LayerUtil";
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
import rightStore from "@/designer/right/RightStore.ts";
import shortcutStore from "@/designer/operate-provider/hot-key/ShortcutStore.ts";
import {getShortcutDisplayParts, getShortcutPlatform} from "@/designer/operate-provider/hot-key/HotKeyPlatform.ts";
import {SHORTCUT_ACTION_IDS, type ShortcutActionId} from "@/designer/operate-provider/hot-key/ShortcutTypes.ts";
import {
    getSelectionLockState,
} from "@/designer/operate-provider/selection/SelectionPolicy.ts";
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

const getShortcut = (actionId: ShortcutActionId): ReactNode | undefined => {
    const binding = shortcutStore.getBinding(actionId);
    if (!binding)
        return undefined;
    return getShortcutDisplayParts(binding, getShortcutPlatform()).map((part, index) => (
        <span className="context-menu-shortcut-part" key={`${actionId}-${part}-${index}`}>
            {index > 0 ? <span className="context-menu-shortcut-separator">+</span> : null}
            <span className="context-menu-shortcut-key">
                {renderShortcutKey(part)}
            </span>
        </span>
    ));
};

const buildDefaultDesignerMenus = () => [
    {
        name: '克隆',
        icon: CopyOne,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.CLONE),
        onClick: doClone,
    },
    {
        name: '复制',
        icon: Copy,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.COPY),
        onClick: doCopy,
    },
    {
        name: '上移',
        icon: Up,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.LAYER_MOVE_UP),
        onClick: layerMoveUp,
    },
    {
        name: '下移',
        icon: Down,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.LAYER_MOVE_DOWN),
        onClick: layerMoveDown,
    },
    {
        name: '置顶',
        icon: ToTopOne,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.LAYER_TO_TOP),
        onClick: layerToTop,
    },
    {
        name: '置底',
        icon: ToBottomOne,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.LAYER_TO_BOTTOM),
        onClick: layerToBottom,
    },
    {
        name: '删除',
        icon: DeleteOne,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.DELETE),
        onClick: doDelete,
        className: 'context-menu-item-danger',
    },
    {
        name: '隐藏',
        icon: PreviewClose,
        shortcut: getShortcut(SHORTCUT_ACTION_IDS.HIDE),
        onClick: doHide,
    },
    {
        name: '存为模板',
        icon: PageTemplate,
        onClick: saveAsTemplate,
    },
    {
        name: '清理空分组',
        icon: Clear,
        onClick: cleanEmptyGroupings,
    }
];

const CanvasContextMenu = observer(() => {

    const calculateMenus = () => {
        const {targetIds} = eventOperateStore;
        const selectLayerMenu = contextMenuStore.canvasMenuCandidates.length > 0 ? {
            name: '选择图层',
            icon: Layers,
            children: contextMenuStore.canvasMenuCandidates.map((candidate) => ({
                name: `${candidate.locked ? '🔒 ' : ''}${candidate.name}`,
                icon: candidate.locked ? Lock : Layers,
                onClick: () => {
                    eventOperateStore.setTargetIds([candidate.id], 'context-menu');
                    rightStore.activeConfig(candidate.id, candidate.type);
                },
            })),
        } : null;
        if (targetIds.length === 0)
            return selectLayerMenu ? [selectLayerMenu, devToolsMenuItem] : [devToolsMenuItem];
        const menus = buildDefaultDesignerMenus();
        const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager
        const {hasLocked, hasUnlocked} = getSelectionLockState(targetIds, layerConfigs);
        if (hasLocked) {
            menus.push({
                name: '解锁',
                icon: Unlock,
                shortcut: getShortcut(SHORTCUT_ACTION_IDS.UNLOCK),
                onClick: doUnLock,
            })
        }
        if (hasUnlocked) {
            menus.push({
                name: '锁定',
                icon: Lock,
                shortcut: getShortcut(SHORTCUT_ACTION_IDS.LOCK),
                onClick: doLock,
            })
        }
        if (targetIds.length === 1 && layerConfigs[targetIds[0]].type === 'LoopContainer') {
            menus.push({
                name: '循环容器',
                icon: Cycle,
                onClick: () => editLoopContainer(targetIds[0])
            })
        }
        if (targetIds.length > 1) {
            menus.splice(6, 0, ...[
                {
                    name: '上对齐',
                    icon: AlignTopTwo,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.ALIGN_TOP),
                    onClick: groupTopAligned
                },
                {
                    name: '下对齐',
                    icon: AlignBottomTwo,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.ALIGN_BOTTOM),
                    onClick: groupBottomAligned
                },
                {
                    name: '左对齐',
                    icon: AlignLeftTwo,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.ALIGN_LEFT),
                    onClick: groupLeftAligned,
                },
                {
                    name: '右对齐',
                    icon: AlignRightTwo,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.ALIGN_RIGHT),
                    onClick: groupRightAligned
                },
            ])
            if (!LayerUtil.hasSameGroup(targetIds)) {
                menus.push({
                    name: '编组',
                    icon: Group,
                    shortcut: getShortcut(SHORTCUT_ACTION_IDS.GROUP),
                    onClick: doGrouping,
                });
            }
        }
        let groupIds = LayerUtil.findTopGroupLayer(targetIds, true);
        //过滤掉其中分组等于自身的图层（即非分组图层）
        groupIds = groupIds.filter((id: string) => layerConfigs[id].type === 'group');
        if (groupIds.length > 0) {
            menus.push({
                name: '解组',
                icon: Ungroup,
                shortcut: getShortcut(SHORTCUT_ACTION_IDS.UNGROUP),
                onClick: doUnGrouping,
            })
        }
        const noGroup = targetIds.some((id: string) => !layerConfigs[id].pid);
        if (!noGroup)
            menus.push({
                name: '移出分组',
                icon: LinkRight,
                shortcut: getShortcut(SHORTCUT_ACTION_IDS.REMOVE_FROM_GROUP),
                onClick: removeFromGroup
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
