/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {useLayoutEffect, useRef, useState, useEffect} from 'react';
import './BPRight.less';
import {observer} from 'mobx-react';
import bpRightStore from './BPRightStore';
import bpWorkspaceUIStore from '@/designer/blueprint/workspace/BPWorkspaceUIStore';
import {Accordion} from '@datavisool/ui';
import {Close} from '@icon-park/react';
import type {AbstractBPNodeController} from '@/designer/blueprint/node/core/AbstractBPNodeController';
import BPNodeCommonConfig from './BPNodeCommonConfig';

export interface BPRightConfigProps<C = AbstractBPNodeController> {
    controller?: C;
}

export interface BPRightProps {
    onResizeStart?: React.PointerEventHandler<HTMLDivElement>;
}

const BPRight: React.FC<BPRightProps> = observer(({onResizeStart}) => {
    const panelRef = useRef<HTMLElement>(null);
    const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 959px)').matches);
    const manager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
    const {activeNode} = bpRightStore;
    const {leftOpen, rightOpen, activeNarrowPanel} = bpWorkspaceUIStore;
    const panelVisible = rightOpen && (!isNarrow || !leftOpen || activeNarrowPanel === 'right');
    const activeNodeController = activeNode ? manager.currPageNodeControllers[activeNode] : undefined;
    const activeNodeLayout = activeNode ? manager.currentPageManager?.bpNodeLayoutMap[activeNode] : undefined;
    const nodeConfig = activeNodeLayout ? activeNodeController?.getConfig() : undefined;
    const apList = nodeConfig ? [...nodeConfig.input, ...nodeConfig.output] : [];
    const ConfigComponent = activeNodeController?.getConfigComponent() as
        | React.ComponentType<BPRightConfigProps<any>>
        | null
        | undefined;

    useEffect(() => {
        const media = window.matchMedia('(max-width: 959px)');
        const handleChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
        setIsNarrow(media.matches);
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, []);

    useLayoutEffect(() => {
        if (panelRef.current)
            panelRef.current.inert = !panelVisible;
    }, [panelVisible]);

    return (
        <aside ref={panelRef}
               className="bp-right"
               data-bp-ui
               aria-hidden={!panelVisible}
               data-open={panelVisible}>
            <div className="bp-right-resize-handle" onPointerDown={onResizeStart} aria-hidden="true"/>
            <div className="bp-right-header">
                <span>节点配置</span>
                <button type="button"
                        className="bp-right-close"
                        aria-label="关闭节点配置面板"
                        title="关闭"
                        onClick={() => bpWorkspaceUIStore.closeRight()}>
                    <Close size={16} aria-hidden="true"/>
                </button>
            </div>
            {nodeConfig && activeNodeController ? (
                <div className="bp-node-config">
                    <div className="bp-node-config-header">
                        <div className="bp-node-config-name">{nodeConfig.name}</div>
                        <div className="bp-node-config-info">{`${nodeConfig.id} | ${nodeConfig.type}`}</div>
                    </div>
                    <div className="bp-node-config-list">
                        <div className="bp-ap-info-list">
                            <Accordion label="锚点信息" defaultActive={true}>
                                {apList.map(ap => (
                                    <div className="bp-ap-info-item" key={ap.id}>
                                        <div className={`bp-ap-info-type ${ap.type === 0 ? 'type-input' : 'type-output'}`}>
                                            {ap.type === 0 ? '输入' : '输出'}
                                        </div>
                                        <div className="bp-ap-info-name">{ap.name}</div>
                                    </div>
                                ))}
                            </Accordion>
                        </div>
                        <div className="bp-node-config-detail">
                            <Accordion label="基础配置" defaultActive={true}>
                                <BPNodeCommonConfig controller={activeNodeController}/>
                            </Accordion>
                        </div>
                        {ConfigComponent && (
                            <div className="bp-node-config-detail">
                                <Accordion label="节点配置" defaultActive={true}>
                                    <ConfigComponent controller={activeNodeController}/>
                                </Accordion>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="node-config-empty-info">请双击画布节点查看配置</div>
            )}
        </aside>
    );
});

export default BPRight;
