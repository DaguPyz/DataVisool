/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import AntdBaseRadialBarController from "./AntdBaseRadialBarController.ts";
import {FieldChangeData, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import AntdCommonUtil from "@/comps/antd-common/AntdCommonUtil";
import {ConfigType} from "@/designer/right/ConfigContent";
import {ShapeAttrs} from "@antv/g-base";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";

export default function AntdBaseRadialBarStyleConfig(props: ConfigType<AntdBaseRadialBarController>) {
    const {controller} = props;
    const config = controller.getConfig()!.style;
    const label = (config?.xAxis as any)?.label;

    const schema: Control[] = [
        {
            type: 'accordion',
            label: '图形',
            children: [
                {
                    type: 'grid',
                    key: 'style',
                    children: [
                        {
                            type: 'number-input',
                            key: 'radius',
                            label: '外径',
                            config: {
                                min: 0.1,
                                max: 1,
                                step: 0.01
                            },
                            value: config?.radius
                        },
                        {
                            type: 'number-input',
                            key: 'innerRadius',
                            label: '内径',
                            config: {
                                min: 0.1,
                                max: 1,
                                step: 0.01
                            },
                            value: config?.innerRadius
                        },
                        {
                            type: 'number-input',
                            key: 'maxBarWidth',
                            label: '柱宽',
                            config: {
                                min: 0,
                            },
                            value: config?.maxBarWidth
                        },
                        {
                            key: 'barStyle',
                            children: [
                                {
                                    type: 'select',
                                    key: 'lineCap',
                                    label: '圆角',
                                    value: config?.barStyle?.lineCap,
                                    config: {
                                        options: [
                                            {label: '圆角', value: 'round'},
                                            {label: '直角', value: 'butt'},
                                        ]
                                    }
                                },
                            ]
                        },
                        {
                            id: 'colorConvert',
                            type: 'color-mode',
                            key: 'color',
                            label: '颜色',
                            value: Array.isArray(config?.color) ?
                                config?.color?.map(color => G2ColorUtil.parseG2ToCssColor(color)) :
                                G2ColorUtil.parseG2ToCssColor(config?.color as string) || '#1c1c1c',
                            config: {
                                modes: ['single', 'linear', 'radial']
                            }
                        },
                        {
                            type: 'number-input',
                            key: 'startAngle',
                            label: '起始角度',
                            id: 'startAngle',
                            config: {
                                step: 1,
                            },
                            value: (config?.startAngle || 0) / Math.PI * 180
                        },
                        {
                            type: 'number-input',
                            key: 'endAngle',
                            label: '结束角度',
                            id: 'endAngle',
                            config: {
                                step: 1,
                            },
                            value: (config?.endAngle || 0) / Math.PI * 180
                        },
                        {
                            type: 'number-input',
                            key: 'maxAngle',
                            label: '最大旋角',
                            config: {
                                min: -360,
                                max: 360,
                                step: 1,
                            },
                            value: config?.maxAngle
                        },
                        {
                            type: 'select',
                            key: 'type',
                            label: '图形类型',
                            config: {
                                options: [
                                    {label: '线形', value: 'line'},
                                    {label: '柱形', value: ''},
                                ]
                            },
                            value: config?.type
                        },
                    ]
                }
            ]
        },
        {
            type: 'accordion',
            label: '文本',
            key: 'style',
            children: [
                {
                    type: 'grid',
                    key: 'xAxis',
                    children: [
                        {
                            key: 'label',
                            children: [
                                {
                                    key: 'rotate',
                                    type: 'number-input',
                                    label: '角度',
                                    value: label.rotate || 0,
                                    config: {
                                        min: 0,
                                        step: 0.1,
                                        max: 360,
                                    }
                                },
                                {
                                    key: 'offset',
                                    type: 'number-input',
                                    label: '偏移',
                                    value: label.offset || 0,
                                },
                                {
                                    key: 'style',
                                    children: [
                                        {
                                            key: 'fontSize',
                                            type: 'number-input',
                                            label: '字号',
                                            value: (label.style as ShapeAttrs)?.fontSize || 12,
                                            config: {
                                                min: 1,
                                                max: 50,
                                            }
                                        },
                                        {
                                            key: 'fontWeight',
                                            type: 'number-input',
                                            label: '粗细',
                                            value: (label.style as ShapeAttrs)?.fontWeight || 500,
                                            config: {
                                                min: 100,
                                                step: 100,
                                                max: 900,
                                            }
                                        },
                                        {
                                            id: 'colorConvert',
                                            key: 'fill',
                                            type: 'color-picker',
                                            label: '颜色',
                                            value: G2ColorUtil.parseG2ToCssColor((label.style as ShapeAttrs)?.fill ?? "#fff"),
                                            config: {
                                                showText: true,
                                                modes: ['single', 'linear', 'radial']
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    ]

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment, dataKeyPath, data, id} = fieldChangeData;
        if (id === 'startAngle') {
            controller.update({style: {startAngle: (data as number) / 180 * Math.PI}})
        } else if (id === 'endAngle') {
            controller.update({style: {endAngle: (data as number) / 180 * Math.PI}})
        } else if (id === 'colorConvert') {
            if (Array.isArray(data)) {
                const newData = data.map(color => G2ColorUtil.parseCssToG2Color(color));
                controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            } else {
                const newData = G2ColorUtil.parseCssToG2Color(data as string);
                controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            }
        } else {
            controller.update(dataFragment)
        }
    }
    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    );
}

export const AntdRadialBarFieldMapping: React.FC<ConfigType<AntdBaseRadialBarController>> = ({controller}) => {
    const config = controller.config?.style;
    const options = AntdCommonUtil.getDataFieldOptions(controller);
    const schema: Control = {
        type: 'grid',
        key: 'style',
        children: [
            {
                type: 'select',
                key: 'xField',
                label: 'x字段',
                value: config?.xField,
                config: {options}
            },
            {
                type: 'select',
                key: 'yField',
                label: 'y字段',
                value: config?.yField,
                config: {options}
            },
            {
                type: 'select',
                key: 'colorField',
                label: '颜色字段',
                value: config?.colorField,
                config: {options}
            },
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        controller.update(fieldChangeData.dataFragment);
    }


    return <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
}
