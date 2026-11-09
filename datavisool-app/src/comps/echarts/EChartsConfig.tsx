/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useRef} from 'react';
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";
import {ConfigType} from "../../designer/right/ConfigContent.tsx";
import EChartsController from "./EChartsController.ts";


export default function EChartsConfig(props: ConfigType<EChartsController>) {
    const {controller} = props;
    const config = controller.getConfig()?.style;

    const codeRef = useRef<string>(config?.customCode || '');

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataFragment} = fieldChangeData;
        if (id === 'customCode') {
            codeRef.current = data as string;
            return;
        }
        if (id === 'refreshChart')
            controller.update({style: {customCode: codeRef.current}});
        else
            controller.update(dataFragment);
    }

    const schema: Control = {
        key: 'style',
        type: 'grid',
        children: [
            {
                type: 'card-panel',
                label: '自定义Echarts代码',
                tip: <p>
                    请参考 <b><a href='https://echarts.apache.org/examples/zh/index.html'
                                 target='_blank'>Echarts官方文档</a></b> 复制并调试代码
                </p>,
                config: {
                    contentStyle: {
                        padding: 0
                    }
                },
                children: [
                    {
                        id: 'customCode',
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
                id: 'refreshChart',
                config: {
                    children: '刷新图表',
                }
            }
        ]
    }


    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}
