/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BPRightConfigProps} from "@/designer/blueprint/right/BPRight";
import BPVisibleNodeController, {BPPopupBoxNodeConfigType} from "./BPPopupBoxNodeController.ts";
import {DatavisoolGUI} from "@datavisool/ui";
import type {Control, FieldChangeData, ISelectOption} from "@datavisool/ui";

export const PopupBoxNodeConfig = (props: BPRightConfigProps<BPVisibleNodeController>) => {
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
        children: [
            {
                type: 'select',
                label: '节点',
                tip: '选择需要展示的节点, 弹框内容的大小与该节点的大小一致, 分组组件的尺寸以外部包围盒尺寸为准。同时应该尽量避免尺寸过大',
                key: 'nodeId',
                value: config?.nodeId ?? '',
                config: {
                    options: getOptions() as ISelectOption[],
                    showSearch: true,
                }
            },
            {
                type: 'input',
                label: '标题',
                key: 'title',
                value: config?.title ?? '',
            },
            {
                type: 'color-picker',
                label: '标题颜色',
                key: 'titleColor',
                value: config?.titleColor ?? '',
                config: {
                    showText: true
                }
            },
            {
                type: 'color-picker',
                label: '背景颜色',
                key: 'background',
                value: config?.background ?? '',
                config: {
                    showText: true
                }
            },
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        controller?.update(fieldChangeData.dataFragment as BPPopupBoxNodeConfigType)
    }

    return (
        <div className={'visible-node-config'}>
            <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
        </div>
    )
}
