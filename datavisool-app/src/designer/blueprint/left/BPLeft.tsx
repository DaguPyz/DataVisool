/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import './BPLeft.less';
import bpLeftStore from "./BPLeftStore";
import {observer} from "mobx-react";
import {IdGenerate} from "@datavisool/sdk";
import {AddSubset, ApplicationOne, BytedanceMiniApp, CardTwo, Close, CodeBrackets, ConnectionPointTwo, Globe, LinkTwo, MessageOne, PreviewOpen, Search, Stopwatch, Toolkit} from "@icon-park/react";
import {Input} from "@datavisool/ui";
import bpHistoryRecordOperateProxy from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";
import bpWorkspaceUIStore from "@/designer/blueprint/workspace/BPWorkspaceUIStore";
import {isBPCanvasPointAvailable} from '@/designer/blueprint/workspace/BPCanvasHitTest';

const BPLeft: React.FC = observer(() => {
    const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 959px)').matches);
    const {leftOpen, nodeDragActive} = bpWorkspaceUIStore;
    const libraryVisible = nodeDragActive ? leftOpen : bpWorkspaceUIStore.isLeftLibraryVisible(isNarrow);

    useEffect(() => {
        const media = window.matchMedia('(max-width: 959px)');
        const handleChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
        setIsNarrow(media.matches);
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, []);

    useLayoutEffect(() => {
        // Each editor entry starts with the documented layer-node category.
        bpLeftStore.setActiveMenu('layer');
        bpLeftStore.setSearchValue('');
    }, []);

    return (
        <div className={`bp-left${leftOpen ? '' : ' bp-left--closed'}`} data-bp-ui>
            <BPNodeSortList libraryVisible={libraryVisible}/>
            <BPNodeList visible={libraryVisible}/>
        </div>
    )
});
export default BPLeft;

export const BPNodeSortList = observer(({libraryVisible}: {libraryVisible: boolean}) => {
    const {activeMenu} = bpLeftStore;
    const nodeSortList = [
        {
            icon: <ApplicationOne/>,
            label: '图层节点',
            key: 'layer'
        },
        {
            icon: <Toolkit/>,
            label: '功能节点',
            key: 'logical'
        },
        // {
        //     icon: <Filter/>,
        //     label: '过滤器',
        //     key: 'filter'
        // },
        {
            icon: <CodeBrackets/>,
            label: '全局变量',
            key: 'global'
        },
    ]
    return (
        <div className={'bp-node-sort-list'}>
            {
                nodeSortList.map((item, index) => {
                    return (
                    <button type="button"
                                className={`bp-left-item ${activeMenu === item.key ? "bp-left-item-active" : ""}`}
                                key={index}
                                disabled={bpWorkspaceUIStore.nodeDragActive}
                                aria-label={item.label}
                                aria-pressed={activeMenu === item.key}
                                aria-expanded={activeMenu === item.key && libraryVisible}
                                title={item.label}
                                onClick={() => {
                                    if (activeMenu === item.key) {
                                        bpWorkspaceUIStore.toggleLeft(libraryVisible);
                                        return;
                                    }
                                    bpLeftStore.setActiveMenu(item.key);
                                    bpWorkspaceUIStore.openLeft();
                                }}>
                            <span className={'bp-item-icon'}>{item.icon}</span>
                            <span className={'bp-item-label'}>{item.label}</span>
                        </button>
                    )
                })
            }
        </div>
    )
})

export const BPNodeList = observer(({visible}: {visible: boolean}) => {
    const {activeMenu, setSearchValue, searchValue} = bpLeftStore;
    const NodeList = nodeListMapping[activeMenu];
    const heading = activeMenu === 'logical' ? '功能节点' : activeMenu === 'global' ? '全局变量' : '图层节点';
    const panelRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{
        nodeId?: string;
        nodeType: string;
        nodeName: string;
        ghost: HTMLDivElement;
    } | null>(null);

    const getDropRects = useCallback(() => {
        const viewport = document.querySelector(".blue-print-canvas") as HTMLElement | null;
        const viewportRect = viewport?.getBoundingClientRect() ?? null;
        const contentEl = window.DATAVISOOL_ENV.currentManager.bluePrintManager?.bpDragContentRef ?? null;
        const contentRect = contentEl?.getBoundingClientRect() ?? null;
        return {viewportRect, contentRect};
    }, []);

    const stopDraggingRef = useRef<() => void>(() => undefined);

    const handleMouseMove = useCallback((event: MouseEvent) => {
        const current = dragRef.current;
        if (!current) return;
        current.ghost.style.left = `${event.clientX + 12}px`;
        current.ghost.style.top = `${event.clientY + 12}px`;
        const {viewportRect} = getDropRects();
        const viewport = document.querySelector<HTMLElement>('.blue-print-canvas');
        if (!viewportRect || !viewport) {
            document.body.style.cursor = 'grabbing';
            return;
        }
        const withinViewport =
            event.clientX >= viewportRect.left &&
            event.clientX <= viewportRect.right &&
            event.clientY >= viewportRect.top &&
            event.clientY <= viewportRect.bottom;
        const available = withinViewport && isBPCanvasPointAvailable(event.clientX, event.clientY, viewport);
        document.body.style.cursor = available ? 'grabbing' : 'not-allowed';
    }, [getDropRects]);

    const handleMouseUp = useCallback((event: MouseEvent) => {
        const current = dragRef.current;
        if (!current) return;
        const {viewportRect, contentRect} = getDropRects();
        if (viewportRect && isBPCanvasPointAvailable(event.clientX, event.clientY)) {
            const within =
                event.clientX >= viewportRect.left &&
                event.clientX <= viewportRect.right &&
                event.clientY >= viewportRect.top &&
                event.clientY <= viewportRect.bottom;
            if (within) {
                const {canvasScale} = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
                const scale = canvasScale || 1;
                const nodeType = current.nodeType;
                let nodeId = current.nodeId;
                const baseRect = contentRect ?? viewportRect;
                const position = {
                    x: (event.clientX - baseRect.left) / scale,
                    y: (event.clientY - baseRect.top) / scale
                };
                if (!nodeType || !['BPLayerNode', 'BPGlobalVariableNode'].includes(nodeType)) {
                    nodeId = IdGenerate.generateId();
                }
                bpHistoryRecordOperateProxy.doAddNode({id: nodeId, type: nodeType, position});
            }
        }
        stopDraggingRef.current();
    }, [getDropRects]);

    const stopDragging = useCallback(() => {
        const current = dragRef.current;
        if (!current) return;
        try {
            current.ghost.remove();
        } catch (e) {
            console.error('[BPLeft] remove drag ghost failed', e);
        }
        dragRef.current = null;
        bpWorkspaceUIStore.setNodeDragActive(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleMouseMove, true);
        window.removeEventListener('mouseup', handleMouseUp, true);
    }, [handleMouseMove, handleMouseUp]);

    useEffect(() => {
        stopDraggingRef.current = stopDragging;
    }, [stopDragging]);

    const startDragging = (nodeType: string, nodeName: string, nodeId: string | undefined, startEvent: MouseEvent) => {
        stopDragging();

        const ghost = document.createElement('div');
        ghost.style.position = 'fixed';
        ghost.style.left = '0';
        ghost.style.top = '0';
        ghost.style.zIndex = '99999';
        ghost.style.pointerEvents = 'none';
        ghost.style.background = 'rgba(0, 0, 0, 0.75)';
        ghost.style.color = '#fff';
        ghost.style.borderRadius = '6px';
        ghost.style.padding = '8px 10px';
        ghost.style.display = 'flex';
        ghost.style.gap = '8px';
        ghost.style.alignItems = 'center';
        ghost.style.maxWidth = '260px';
        ghost.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.35)';
        ghost.style.fontSize = '12px';
        ghost.style.lineHeight = '16px';
        ghost.textContent = nodeName;

        document.body.appendChild(ghost);
        dragRef.current = {nodeType, nodeName, nodeId, ghost};
        bpWorkspaceUIStore.setNodeDragActive(true);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('mouseup', handleMouseUp, true);
        handleMouseMove(startEvent);
    };

    useEffect(() => {
        return () => stopDragging();
    }, [stopDragging]);

    useLayoutEffect(() => {
        if (panelRef.current)
            panelRef.current.inert = !visible;
    }, [visible]);

    return (
        <div className={'bp-node-list'} ref={panelRef} aria-hidden={!visible}>
            <div className={'bp-node-list-header'}>
                <div className="bp-node-list-heading">
                    <span>{heading}</span>
                    <button type="button"
                            className="bp-node-list-close"
                            aria-label="关闭节点库"
                            title="关闭节点库"
                            disabled={bpWorkspaceUIStore.nodeDragActive}
                            onClick={() => bpWorkspaceUIStore.closeLeft()}>
                        <Close size={16} aria-hidden="true"/>
                    </button>
                </div>
                <div className={'bp-node-list-search'}>
                    <Input placeholder={'搜索节点'} value={searchValue}
                           prefix={<Search size={16}/>}
                           allowClear
                           onChange={setSearchValue}/>
                </div>
            </div>
            <div className={'bp-node-list-body'}>
                <div className={'bp-node-list-container'} id={'bp-node-draggable'} style={{overflow: "auto"}}>
                    {NodeList && <NodeList startDragging={startDragging}/>}
                </div>
            </div>
        </div>
    )
})

export const BPLayerNodeList = observer((props: { startDragging: (nodeType: string, nodeName: string, nodeId: string | undefined, startEvent: MouseEvent) => void }) => {
    const {startDragging} = props;
    const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager
    const {usedNodes, searchValue} = bpLeftStore;
    let layerIdList = layerConfigs ? Object.keys(layerConfigs) : [];
    if (searchValue !== '') {
        layerIdList = layerIdList.filter((key) => {
            const item = layerConfigs[key];
            return item.name?.indexOf(bpLeftStore.searchValue) !== -1
        })
    }
    return (
        <>
            {
                layerIdList.map((key, index) => {
                    const item = layerConfigs[key];
                    const used = usedNodes[key];
                    return (
                        <div className={`bp-node-list-item bp-drag-node ${used ? 'bp-node-list-item-used' : ''}`}
                             data-id={item.id}
                             data-type={'BPLayerNode'}
                             key={index}
                             onMouseDown={(e) => {
                                 if (used) return;
                                 if (e.button !== 0) return;
                                 e.preventDefault();
                                 e.stopPropagation();
                                 startDragging('BPLayerNode', item.name ?? '图层节点', item.id, e.nativeEvent);
                             }}>
                            <div className={'bpn-li-icon'}><CardTwo/></div>
                            <div className={'bpn-li-label'}>{item.name}</div>
                        </div>
                    )
                })
            }
        </>
    )
})

export const BPLogicalNodeList = observer((props: { startDragging: (nodeType: string, nodeName: string, nodeId: string | undefined, startEvent: MouseEvent) => void }) => {
    const {startDragging} = props;

    const logicalNodeList = [
        {name: '全局节点', icon: Globe, type: 'BPGlobalNode'},
        {name: '条件判断', icon: AddSubset, type: 'BPConditionNode'},
        {name: '逻辑处理', icon: BytedanceMiniApp, type: 'BPLogicalProcessNode'},
        {name: '显示隐藏', icon: PreviewOpen, type: 'BPVisibleNode'},
        {name: 'WebSocket', icon: LinkTwo, type: 'BPWebSocketNode'},
        {name: 'MQTT', icon: ConnectionPointTwo, type: 'BPMqttNode'},
        {name: '定时器', icon: Stopwatch, type: 'BPTimerNode'},
        {name: '弹框', icon: MessageOne, type: 'BPPopupBoxNode'},
    ].filter((item) => item.name.indexOf(bpLeftStore.searchValue) !== -1)

    return (
        <>
            {
                logicalNodeList.map((item, index) => {
                    return (
                        <div className={`bp-node-list-item bp-drag-node`}
                             data-type={item.type}
                             key={index}
                             onMouseDown={(e) => {
                                 if (e.button !== 0) return;
                                 e.preventDefault();
                                 e.stopPropagation();
                                 startDragging(item.type, item.name, undefined, e.nativeEvent);
                             }}>
                            <div className={'bpn-li-icon'}>
                                <item.icon/>
                            </div>
                            <div className={'bpn-li-label'}>{item.name}</div>
                        </div>
                    )
                })
            }
        </>
    )
})

export const BPGlobalVariablesNodeList = observer((props: { startDragging: (nodeType: string, nodeName: string, nodeId: string | undefined, startEvent: MouseEvent) => void }) => {
    const {startDragging} = props;
    const {globalVariableInstance} = window.DATAVISOOL_ENV.currentManager?.globalVariableManager ?? {};
    if (!globalVariableInstance)
        return null;
    const gvList = Object.values(globalVariableInstance).filter((item) => item.key.indexOf(bpLeftStore.searchValue) !== -1);
    const {usedNodes} = bpLeftStore;
    return (
        <>
            {
                gvList.map((gv) => {
                    const used = usedNodes[gv.id];
                    return (
                        <div className={`bp-node-list-item bp-drag-node ${used ? 'bp-node-list-item-used' : ''}`}
                             data-type={'BPGlobalVariableNode'}
                             data-id={gv.id}
                             key={gv.id}
                             onMouseDown={(e) => {
                                 if (used) return;
                                 if (e.button !== 0) return;
                                 e.preventDefault();
                                 e.stopPropagation();
                                 startDragging('BPGlobalVariableNode', gv.key ?? '全局变量', gv.id, e.nativeEvent);
                             }}>
                            <div className={'bpn-li-icon'}><CodeBrackets/></div>
                            <div className={'bpn-li-label'}>{gv.key}</div>
                        </div>
                    )
                })
            }
        </>
    )
})

const nodeListMapping: { [key: string]: React.FC<any> } = {
    'layer': BPLayerNodeList,
    'logical': BPLogicalNodeList,
    'global': BPGlobalVariablesNodeList,
    // 'filter': BPFilterNodeList,
}
