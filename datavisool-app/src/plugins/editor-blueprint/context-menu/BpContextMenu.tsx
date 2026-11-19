/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import ContextMenu, {IContextMenuItem} from "@/framework/context-menu/ContextMenu.tsx";
import {Code, ConnectionPointTwo, DeleteOne, Fork, Globe, LinkTwo, MessageOne, PreviewOpen, Ring, Stopwatch} from "@icon-park/react";
import {IdGenerate as idGenerate} from "@datavisool/sdk";
import {openDevTools} from "@/util/DevToolsUtil.ts";
import './BpContextMenu.less';
import {useEditorBlueprintSession} from '@/plugins/editor-blueprint/session/EditorBlueprintSessionContext.tsx';

const addNewBPNode = (session: ReturnType<typeof useEditorBlueprintSession>, event: MouseEvent, nodeType: string) => {
    const contentPos = session.bpDragContentRef?.getBoundingClientRect();
    //计算节点生成位置
    const position = {
        x: (event.clientX - (contentPos?.x || 0)) / session.canvasScale,
        y: (event.clientY - (contentPos?.y || 0)) / session.canvasScale
    };
    session.addBPNodeLayout({
        id: idGenerate.generateId(),
        type: nodeType,
        position
    });
}

const buildBpMenuList = (session: ReturnType<typeof useEditorBlueprintSession>): IContextMenuItem[] => [
    {
        name: '全局节点',
        icon: Globe,
        onClick: (event: MouseEvent) => addNewBPNode(session, event, 'BPGlobalNode')
    },
    {
        name: '条件判断',
        icon: Fork,
        onClick: (event: MouseEvent) => addNewBPNode(session, event, 'BPConditionNode')
    },
    {
        name: '逻辑处理',
        icon: Ring,
        onClick: (event: MouseEvent) => addNewBPNode(session, event, 'BPLogicalProcessNode')
    },
    {
        name: '显示隐藏',
        icon: PreviewOpen,
        onClick: (event: MouseEvent) => addNewBPNode(session, event, 'BPVisibleNode')
    },
    {
        name: 'WebSocket',
        icon: LinkTwo,
        onClick: (event: MouseEvent) => addNewBPNode(session, event, 'BPWebSocketNode')
    },
    {
        name: 'MQTT',
        icon: ConnectionPointTwo,
        onClick: (event: MouseEvent) => addNewBPNode(session, event, 'BPMqttNode')
    },
    {
        name: '定时器',
        icon: Stopwatch,
        onClick: (event: MouseEvent) => addNewBPNode(session, event, 'BPTimerNode')
    },
    {
        name: '弹框',
        icon: MessageOne,
        onClick: (event: MouseEvent) => addNewBPNode(session, event, 'BPPopupBoxNode')
    },
];

const devToolsMenuItem: IContextMenuItem = {
    name: '打开 DevTools',
    icon: Code,
    onClick: openDevTools,
    separated: true,
};

const buildBpMenu = (session: ReturnType<typeof useEditorBlueprintSession>): IContextMenuItem[] => {
    const bpMenuList = buildBpMenuList(session);
    const {selectedNodeIds, selectedLines} = session;
    if (selectedNodeIds.length > 0 || selectedLines.length > 0) {
        return [{
            name: '删除',
            icon: DeleteOne,
            className: 'context-menu-item-danger',
            onPointerDown: () => {
                session.contextMenu.updateBpMenuVisible(false);
                session.deleteSelection();
            },
        }, ...bpMenuList, devToolsMenuItem];
    }
    return [...bpMenuList, devToolsMenuItem];
}

const BpContextMenu = observer(() => {
    const session = useEditorBlueprintSession();

    return <ContextMenu
        menus={buildBpMenu(session)}
        visible={session.contextMenu.bpMenuVisible}
        position={session.contextMenu.position}
        className="bp-context-menu"
        width={190}
        itemHeight={38}
    />
})

export default BpContextMenu;
