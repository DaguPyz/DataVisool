/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ConfigType} from "@/designer/right/ConfigContent";
import AntdWordCloudController from "./AntdWordCloudController.ts";
import AntdCommonUtil from "@/comps/antd-common/AntdCommonUtil.ts";
import {FieldChangeData, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";

export const AntdWordCloudStyle = (props: ConfigType<AntdWordCloudController>) => {
    const {controller} = props;
    const {style} = controller.getConfig()!;
    const schema: Control = {
        type: 'grid',
        key: 'style',
        children: [
            {
                type: 'input',
                label: '遮罩',
                key: 'imageMask',
                value: style?.imageMask,
            },
            {
                id: 'colorConvert',
                type: 'color-mode',
                key: 'color',
                label: '颜色',
                value: Array.isArray(style?.color) ?
                    style?.color?.map(color => G2ColorUtil.parseG2ToCssColor(color)) :
                    G2ColorUtil.parseG2ToCssColor(style?.color as string) || '#1c1c1c',
                config: {
                    modes: ['single', 'linear', 'radial']
                }
            },
            {
                id: 'randomPosition',
                type: 'switch',
                key: 'random',
                label: '随机',
                tip: '开启后词云图每次更新数据，词语位置随机展示',
                value: typeof style?.random !== 'number',
            },
            {
                key: 'spiral',
                type: 'select',
                label: '形状',
                value: style?.spiral,
                config: {
                    options: [
                        {label: '椭圆', value: 'archimedean'},
                        {label: '矩形', value: 'rectangular'},
                    ]

                },
            },
            {
                key: 'wordStyle',
                children: [
                    {
                        type: 'select',
                        key: 'fontFamily',
                        label: '字体',
                        value: style?.wordStyle?.fontFamily,
                        config: {
                            options: window.DATAVISOOL_ENV.fonts
                        }
                    },
                    {
                        key: 'fontWeight',
                        type: 'number-input',
                        label: '粗细',
                        value: style?.wordStyle?.fontWeight || 500,
                        config: {min: 100, max: 900, step: 100},
                    },
                    {
                        key: 'fontSize',
                        type: 'range-slider',
                        label: '字号',
                        value: style?.wordStyle?.fontSize,
                        config: {min: 0},
                    },
                    {
                        key: 'padding',
                        type: 'number-input',
                        label: '间距',
                        value: style?.wordStyle?.padding,
                        config: {min: 0},
                    },
                ]
            }
        ]
    }
    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataKeyPath, dataFragment} = fieldChangeData;
        if (id === 'randomPosition') {
            const random = data ? undefined : 0.5;
            controller.update({style: {random}})
        } else if (id === 'colorConvert') {
            if (Array.isArray(data)) {
                const newData = data.map(color => G2ColorUtil.parseCssToG2Color(color));
                controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            } else {
                const newData = G2ColorUtil.parseCssToG2Color(data as string);
                controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            }
        } else {
            controller.update(dataFragment);
        }
    }

    return <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
}
export const AntdWordCloudFieldMapping = (props: ConfigType<AntdWordCloudController>) => {
    const {controller} = props;
    const options = AntdCommonUtil.getDataFieldOptions(controller);
    const {style} = controller.getConfig()!;
    const schema: Control = {
        type: 'grid',
        key: "style",
        children: [
            {
                type: 'select',
                label: '颜色字段',
                key: 'colorField',
                value: style?.colorField,
                config: {
                    options,
                }
            },
            {
                type: 'select',
                label: '权重字段',
                key: 'weightField',
                value: style?.weightField,
                config: {
                    options,
                }
            },
            {
                type: 'select',
                label: '内容字段',
                key: 'wordField',
                value: style?.wordField,
                config: {
                    options,
                }
            },
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        controller.update(dataFragment);
    }

    return <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
}
