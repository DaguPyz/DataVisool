/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ConfigType} from "../../designer/right/ConfigContent.tsx";
import EChartsController from "./EChartsController.ts";
import {useRef} from "react";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";
import {globalMessage} from "@datavisool/ui";

export default function EChartsCustomDataUpdateConfig(props: ConfigType<EChartsController>) {
    const {controller} = props;
    const config = controller.getConfig()?.style;

    const codeRef = useRef<string>(config?.customDataUpdateCode || '');

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data} = fieldChangeData;
        if (id === 'customDataUpdateCode') {
            codeRef.current = data as string;
            return;
        }
        if (id === 'saveDataUpdateFun') {
            controller.update({style: {customDataUpdateCode: codeRef.current}}, {reRender: false});
            globalMessage.messageApi?.success('保存成功');
        }
    }

    const schema: Control = {
        key: 'style',
        type: 'grid',
        children: [
            {
                type: 'card-panel',
                label: '自定义ECharts数据更新',
                tip: <p>
                    请参考 <b><a href='https://echarts.apache.org/zh/api.html#echartsInstance.setOption'
                                 target='_blank'>Echarts官方文档</a></b> 更新图表数据
                </p>,
                config: {
                    contentStyle: {
                        padding: 0
                    }
                },
                children: [
                    {
                        id: 'customDataUpdateCode',
                        type: 'code-editor',
                        value: codeRef.current,
                        config: {
                            language: 'javascript',
                            height: 600,
                            fullScreen: true,
                        }
                    }
                ]
            },
            {
                type: 'button',
                id: 'saveDataUpdateFun',
                config: {
                    children: '保存自定义处理函数',
                }
            }
        ]
    }


    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}