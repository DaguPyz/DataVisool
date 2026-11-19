/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {BlueprintNodeConfigProps} from '../BlueprintNodeConfigProps.ts';
import type {BPTimerNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {DatavisoolGUI} from "@datavisool/ui";
import type {Control, FieldChangeData} from "@datavisool/ui";

export const TimerNodeConfig = (props: BlueprintNodeConfigProps) => {
    const {controller} = props;
    const config = controller?.getConfig() as BPTimerNodeConfig | null | undefined;

    const schema: Control = {
        type: 'grid',
        children: [
            {
                type: 'switch',
                label: '循环',
                key: 'loop',
                value: config?.loop ?? true,
            },
            {
                type: 'number-input',
                label: '时间间隔(秒)',
                key: 'interval',
                value: config?.interval ?? 5,
                config: {
                    min: 0,
                }
            },
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        controller?.update(fieldChangeData.dataFragment)
    }

    return (
        <div className={'visible-node-config'}>
            <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
        </div>
    )
}
