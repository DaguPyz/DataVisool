/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BPRightConfigProps} from "@/designer/blueprint/right/BPRight";
import BPVisibleNodeController, {BPVisibleNodeConfigType} from "./BPVisibleNodeController.ts";
import {DatavisoolGUI} from "@datavisool/ui";
import type {Control, FieldChangeData, ISelectOption} from "@datavisool/ui";

export const VisibleNodeConfig = (props: BPRightConfigProps<BPVisibleNodeController>) => {
    const {controller} = props;
    const config = controller?.getConfig();

    const getOptions = () => {
        if (window.DATAVISOOL_ENV.currentManager.layerManager) {
            return Object.values(window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs).map(layer => {
                return {
                    value: layer.id,
                    label: layer.name
                }
            });
        }
        return [];
    }

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
                    options: getOptions() as ISelectOption[],
                    showSearch: true
                }
            }
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        controller?.update(fieldChangeData.dataFragment as BPVisibleNodeConfigType)
    }

    return (
        <div className={'visible-node-config'}>
            <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
        </div>
    )
}
