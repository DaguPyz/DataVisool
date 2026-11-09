/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useRef} from 'react';
import {FieldChangeData, DatavisoolGUI, type Control} from "@datavisool/ui";
import {ConfigType} from "@/designer/right/ConfigContent";
import {AMapController} from "@/comps/map/AMapController.ts";


export default function G2PlotCustomConfig(props: ConfigType<AMapController>) {
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
                label: 'G2Plot代码',
                tip: <p>
                    请参考 <b><a href='https://g2plot.antv.antgroup.com/examples'
                                 target='_blank'>G2Plot官方文档</a></b> 复制并调试代码
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
                            fullScreen: true
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
