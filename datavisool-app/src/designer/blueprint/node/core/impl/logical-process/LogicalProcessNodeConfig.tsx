/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Suspense, useState} from "react";
import {BPRightConfigProps} from "@/designer/blueprint/right/BPRight";
import {debounce} from "lodash";
import {CodeEditor, Loading} from "@datavisool/ui";
import BPLogicalProcessNodeController from "./BPLogicalProcessNodeController.ts";

export const LogicalProcessNodeConfig = (props: BPRightConfigProps<BPLogicalProcessNodeController>) => {
    const {controller} = props;
    const config = controller?.getConfig();
    const handleCode = config?.handler || "function handle(data) { \n \n}";
    const [count, setCount] = useState(0);
    const onCodeChange = debounce((value: string | undefined) => {
        if (!value) return;
        controller?.update({handler: value});
        //重新渲染更新代码编辑器的prop中的value值，避免下次打开同样类型的节点，导致props相同而不会重新渲染的问题
        setCount(count + 1);
    }, 300);
    return (
        <div className={'logical-process-node-config'}>
            <Suspense fallback={<Loading/>}>
                <CodeEditor value={handleCode} onChange={onCodeChange} height={260} fullScreen={true}
                            showStatusBar={false}
                            language={'javascript'}/>
            </Suspense>
        </div>
    )
}
