/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {lazy, useEffect} from "react";
import BPWorkspaceShell from './workspace/BPWorkspaceShell';
import useBPPanelResize from './workspace/useBPPanelResize';

const BPHeader = lazy(() => import("./header/BPHeader"));
const BPFooter = lazy(() => import("./footer/BPFooter"));
const BPLeft = lazy(() => import("./left/BPLeft"));
const BPRight = lazy(() => import("./right/BPRight"));
const BPCanvas = lazy(() => import("./BPCanvas"));

export default function BluePrint() {
    const startRightResize = useBPPanelResize();

    useEffect(() => {
        return () => {
            // 关闭蓝图面板时只清理运行态，保留页面数据，避免重新打开时丢失蓝图内容。
            window.DATAVISOOL_ENV.currentManager?.bluePrintManager?.closeView();
        }
    }, []);

    return (
        <BPWorkspaceShell canvas={<BPCanvas/>}
                          header={<BPHeader/>}
                          left={<BPLeft/>}
                          right={<BPRight onResizeStart={startRightResize}/>}
                          footer={<BPFooter/>}/>
    )
}
