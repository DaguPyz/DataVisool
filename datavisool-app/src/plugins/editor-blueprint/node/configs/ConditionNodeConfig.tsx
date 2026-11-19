/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Suspense, useEffect, useMemo} from "react";
import {debounce} from "lodash";
import {CodeEditor, Loading} from "@datavisool/ui";
import type {BlueprintNodeConfigProps} from '../BlueprintNodeConfigProps.ts';
import type {BPConditionNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';

export const ConditionNodeConfig = (props: BlueprintNodeConfigProps) => {
    const {controller} = props;
    const config = controller?.getConfig() as BPConditionNodeConfig | null | undefined;
    const handleCode = config?.handler || "function handler(data) { \n \n}";
    const onCodeChange = useMemo(() => debounce((value: string | undefined) => {
        if (!value) return;
        controller?.update({handler: value});
    }, 500), [controller]);
    useEffect(() => () => onCodeChange.cancel(), [onCodeChange]);
    return (
        <div className={'condition-node-config'}>
            <Suspense fallback={<Loading/>}>
                <CodeEditor value={handleCode} onChange={onCodeChange} height={260} fullScreen={true}
                            showStatusBar={false}
                            language={'javascript'}/>
            </Suspense>
        </div>
    )
}
