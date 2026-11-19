/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {lazy} from "react";
import {useEditorBlueprintSession} from './session/EditorBlueprintSessionContext.tsx';
import BPWorkspaceShell from './workspace/BPWorkspaceShell';
import useBPPanelResize from './workspace/useBPPanelResize';

const BPHeader = lazy(() => import("./header/BPHeader"));
const BPFooter = lazy(() => import("./footer/BPFooter"));
const BPLeft = lazy(() => import("./left/BPLeft"));
const BPRight = lazy(() => import("./right/BPRight"));
const BPCanvas = lazy(() => import("./BPCanvas"));

export default function BluePrint({onClose}: {onClose(): void}) {
    const startRightResize = useBPPanelResize();
    useEditorBlueprintSession();

    return (
        <BPWorkspaceShell canvas={<BPCanvas/>}
                          header={<BPHeader onClose={onClose}/>}
                          left={<BPLeft/>}
                          right={<BPRight onResizeStart={startRightResize}/>}
                          footer={<BPFooter/>}/>
    )
}
