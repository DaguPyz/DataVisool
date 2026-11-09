/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Suspense} from "react";
import {Loading, globalMessage} from "@datavisool/ui";
import BPWebSocketNodeController from "./BPWebSocketNodeController.ts";
import {WebSocketConfig} from "@/comps/common-component/data-source-config/WebSocketConfig.tsx";
import {BPRightConfigProps} from "@/designer/blueprint/right/BPRight.tsx";

export const WebSocketNodeConfig: React.FC<BPRightConfigProps<BPWebSocketNodeController>> = (props) => {
    const {controller} = props;
    const config = controller?.getConfig();
    return (
        <div className={'logical-process-node-config'}>
            <Suspense fallback={<Loading/>}>
                <WebSocketConfig data={config?.nodeConfig ?? {}}
                                 onSave={(data) => {
                                     controller?.update({nodeConfig: data});
                                     globalMessage.messageApi?.success('配置项已刷新');
                                 }}/>
            </Suspense>
        </div>
    )
}
