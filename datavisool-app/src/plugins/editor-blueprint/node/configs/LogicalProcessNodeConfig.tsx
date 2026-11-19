/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Suspense, useEffect, useMemo} from "react";
import type {BlueprintNodeConfigProps} from '../BlueprintNodeConfigProps.ts';
import type {BPLogicalProcessNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {debounce} from "lodash";
import {CodeEditor, Loading} from "@datavisool/ui";

export const LogicalProcessNodeConfig = (props: BlueprintNodeConfigProps) => {
    const {controller} = props;
    const config = controller?.getConfig() as BPLogicalProcessNodeConfig | null | undefined;
    const handleCode = config?.handler || "function handle(data) { \n \n}";
    const onCodeChange = useMemo(() => debounce((value: string | undefined) => {
        if (!value) return;
        controller?.update({handler: value});
    }, 300), [controller]);
    useEffect(() => () => onCodeChange.cancel(), [onCodeChange]);
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
