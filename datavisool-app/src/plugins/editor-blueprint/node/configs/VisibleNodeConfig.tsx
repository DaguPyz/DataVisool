/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {BlueprintNodeConfigProps} from '../BlueprintNodeConfigProps.ts';
import type {BPVisibleNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {DatavisoolGUI} from "@datavisool/ui";
import type {Control, FieldChangeData, ISelectOption} from "@datavisool/ui";
import {useEditorBlueprintSession} from '../../session/EditorBlueprintSessionContext.tsx';

export const VisibleNodeConfig = (props: BlueprintNodeConfigProps) => {
    const {controller} = props;
    const session = useEditorBlueprintSession();
    const config = controller?.getConfig() as BPVisibleNodeConfig | null | undefined;
    const options = Object.values(session.readLayerConfigs()).map(layer => ({value: layer.id, label: layer.name}));

    const schema: Control = {
        type: 'grid',
        key: 'nodeConfig',
        children: [
            {
                type: 'select',
                label: '绑定节点',
                key: 'nodeIds',
                value: config?.nodeConfig?.nodeIds ?? [],
                config: {
                    options: options as ISelectOption[],
                    showSearch: true
                }
            }
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        controller?.update(fieldChangeData.dataFragment as BPVisibleNodeConfig)
    }

    return (
        <div className={'visible-node-config'}>
            <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
        </div>
    )
}
