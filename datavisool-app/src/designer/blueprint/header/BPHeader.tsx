/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {useEffect, useState} from "react";
import './BPHeader.less';
import {observer} from 'mobx-react';
import {Return, Setting} from '@icon-park/react';
import designerHeaderStore from "@/designer/header/DesignerHeaderStore.ts";
import bpRightStore from '@/designer/blueprint/right/BPRightStore';
import bpWorkspaceUIStore from '@/designer/blueprint/workspace/BPWorkspaceUIStore';

const BPHeader: React.FC = observer(() => {
    const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 959px)').matches);
    const manager = window.DATAVISOOL_ENV.currentManager?.bluePrintManager;
    const activeNode = bpRightStore.activeNode;
    const canOpenConfig = Boolean(activeNode && manager?.currentPageManager?.bpNodeLayoutMap[activeNode] &&
        manager.currPageNodeControllers[activeNode]);
    const pageName = manager?.currentPageManager?.pageName;
    const configVisible = bpWorkspaceUIStore.rightOpen &&
        (!isNarrow || !bpWorkspaceUIStore.leftOpen || bpWorkspaceUIStore.activeNarrowPanel === 'right');

    useEffect(() => {
        const media = window.matchMedia('(max-width: 959px)');
        const handleChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
        setIsNarrow(media.matches);
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, []);

    return (
        <div className={'bp-header'} data-bp-ui>
            <div className="bp-header-identity">
                <div className={'bp-header-title'}>蓝图编辑器</div>
                {pageName && <div className="bp-header-page-name" title={pageName}>{pageName}</div>}
            </div>
            <div className={'bp-header-menu'}>
                <span className="bp-header-action">
                    <button type="button"
                            className="bp-header-config-toggle"
                            aria-label="节点配置"
                            aria-describedby="bp-header-config-tooltip"
                            aria-expanded={configVisible}
                            disabled={!canOpenConfig}
                            onClick={() => configVisible
                                ? bpWorkspaceUIStore.closeRight()
                                : bpWorkspaceUIStore.openRight()}>
                        <Setting size={18} aria-hidden="true"/>
                    </button>
                    <span id="bp-header-config-tooltip" className="bp-header-tooltip" role="tooltip">
                        {canOpenConfig ? '节点配置' : '节点配置（双击节点打开）'}
                    </span>
                </span>
                <span className="bp-header-action">
                    <button type="button" className="bp-header-return" aria-label="返回编辑器"
                            aria-describedby="bp-header-return-tooltip" onClick={() => {
                                designerHeaderStore.setCurrentKey('');
                                manager?.setCanvasTranslate({x: 0, y: 0});
                                manager?.setCanvasScale(1);
                            }}>
                        <Return size={18} aria-hidden="true"/>
                    </button>
                    <span id="bp-header-return-tooltip" className="bp-header-tooltip" role="tooltip">返回编辑器</span>
                </span>
            </div>
        </div>
    )
});

export default BPHeader;
