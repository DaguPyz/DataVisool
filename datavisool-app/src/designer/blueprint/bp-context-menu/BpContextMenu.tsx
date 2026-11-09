/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import ContextMenu, {IContextMenuItem} from "@/framework/context-menu/ContextMenu.tsx";
import {Code, ConnectionPointTwo, DeleteOne, Fork, Globe, LinkTwo, MessageOne, PreviewOpen, Ring, Stopwatch} from "@icon-park/react";
import contextMenuStore from "@/designer/event/ContextMenuStore.ts";
import {IdGenerate as idGenerate} from "@datavisool/sdk";
import bpHistoryRecordOperateProxy from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";
import {openDevTools} from "@/util/DevToolsUtil.ts";
import './BpContextMenu.less';

const addNewBPNode = (event: MouseEvent, nodeType: string) => {
    const {bpDragContentRef, canvasScale} = window.DATAVISOOL_ENV.currentManager.bluePrintManager!;
    const contentPos = bpDragContentRef?.getBoundingClientRect();
    //计算节点生成位置
    const position = {
        x: (event.clientX - (contentPos?.x || 0)) / canvasScale,
        y: (event.clientY - (contentPos?.y || 0)) / canvasScale
    };
    bpHistoryRecordOperateProxy.doAddNode({
        id: idGenerate.generateId(),
        type: nodeType,
        position
    });
}

const bpMenuList: IContextMenuItem[] = [
    {
        name: '全局节点',
        icon: Globe,
        onClick: (event: MouseEvent) => addNewBPNode(event, 'BPGlobalNode')
    },
    {
        name: '条件判断',
        icon: Fork,
        onClick: (event: MouseEvent) => addNewBPNode(event, 'BPConditionNode')
    },
    {
        name: '逻辑处理',
        icon: Ring,
        onClick: (event: MouseEvent) => addNewBPNode(event, 'BPLogicalProcessNode')
    },
    {
        name: '显示隐藏',
        icon: PreviewOpen,
        onClick: (event: MouseEvent) => addNewBPNode(event, 'BPVisibleNode')
    },
    {
        name: 'WebSocket',
        icon: LinkTwo,
        onClick: (event: MouseEvent) => addNewBPNode(event, 'BPWebSocketNode')
    },
    {
        name: 'MQTT',
        icon: ConnectionPointTwo,
        onClick: (event: MouseEvent) => addNewBPNode(event, 'BPMqttNode')
    },
    {
        name: '定时器',
        icon: Stopwatch,
        onClick: (event: MouseEvent) => addNewBPNode(event, 'BPTimerNode')
    },
    {
        name: '弹框',
        icon: MessageOne,
        onClick: (event: MouseEvent) => addNewBPNode(event, 'BPPopupBoxNode')
    },
];

const devToolsMenuItem: IContextMenuItem = {
    name: '打开 DevTools',
    icon: Code,
    onClick: openDevTools,
    separated: true,
};

const buildBpMenu = (): IContextMenuItem[] => {
    if (!window.DATAVISOOL_ENV.currentManager.bluePrintManager)
        return [...bpMenuList, devToolsMenuItem];
    const {selectedNodeIds, selectedLines} = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
    if (selectedNodeIds.length > 0 || selectedLines.length > 0) {
        return [{
            name: '删除',
            icon: DeleteOne,
            className: 'context-menu-item-danger',
            onPointerDown: () => {
                if (window.DATAVISOOL_ENV.currentManager.bluePrintManager) {
                    const {selectedNodeIds, selectedLines} = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
                    const nodeIds = [...selectedNodeIds];
                    const lineIds = [...selectedLines];
                    contextMenuStore.updateBpMenuVisible(false);
                    if (nodeIds.length > 0)
                        bpHistoryRecordOperateProxy.doDelNodes(nodeIds);
                    else if (lineIds.length > 0)
                        bpHistoryRecordOperateProxy.doDelLines(lineIds);
                }
            },
        }, ...bpMenuList, devToolsMenuItem];
    }
    return [...bpMenuList, devToolsMenuItem];
}

const BpContextMenu = observer(() => {

    return <ContextMenu
        menus={buildBpMenu()}
        visible={contextMenuStore.bpMenuVisible}
        position={contextMenuStore.position}
        className="bp-context-menu"
        width={190}
        itemHeight={38}
    />
})

export default BpContextMenu;
