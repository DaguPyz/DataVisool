/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {BaseInputController} from "./BaseInputController.ts";
import {ConfigType} from "../../../designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";

export const BaseInputStyleConfig: React.FC<ConfigType<BaseInputController>> = ({controller}) => {

    const {style} = controller.getConfig()!;

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        controller.update(dataFragment!);
    }

    const schema: Control[] = [
        {
            type: 'accordion',
            label: '基础',
            children: [
                {
                    type: 'grid',
                    key: 'style',
                    children: [
                        {
                            key: 'fontSize',
                            type: 'number-input',
                            label: '字号',
                            value: style?.fontSize,
                            config: {min: 1}
                        },
                        {
                            key: 'fontWeight',
                            type: 'number-input',
                            label: '加粗',
                            value: style?.fontWeight || 400,
                            config: {
                                min: 100,
                                max: 900,
                                step: 100
                            }
                        },
                        {
                            key: 'fontFamily',
                            type: 'select',
                            label: '字体',
                            value: style?.fontFamily,
                            config: {
                                options: window.DATAVISOOL_ENV.fonts,
                            }
                        },
                        {
                            key: 'color',
                            type: 'color-picker',
                            label: '颜色',
                            value: style?.color,
                            config: {
                                showText: true,
                            }
                        },
                        {
                            key: 'backgroundColor',
                            type: 'color-picker',
                            label: '背景',
                            value: style?.backgroundColor,
                            config: {
                                showText: true,
                            }
                        },
                        {
                            key: 'borderRadius',
                            type: 'number-input',
                            label: '边框圆角',
                            value: style?.borderRadius,
                            config: {min: 0}
                        },
                        {
                            key: 'borderWidth',
                            type: 'number-input',
                            label: '边框宽度',
                            value: style?.borderWidth,
                            config: {min: 0}
                        },
                        {
                            key: 'borderColor',
                            type: 'color-picker',
                            label: '边框颜色',
                            value: style?.borderColor,
                            config: {showText: true}
                        },
                        {
                            key: 'borderStyle',
                            type: 'select',
                            label: '边框样式',
                            value: style?.borderStyle,
                            config: {
                                options: [
                                    {label: '无边框', value: 'none'},
                                    {label: '实线', value: 'solid'},
                                    {label: '虚线', value: 'dashed'},
                                    {label: '点线', value: 'dotted'},
                                    {label: '双线', value: 'double'},
                                    {label: '三维凹槽', value: 'groove'},
                                    {label: '三维凸槽', value: 'ridge'},
                                    {label: '三维内嵌', value: 'inset'},
                                    {label: '三维外凸', value: 'outset'}
                                ]
                            }
                        },
                    ]
                },
            ]
        },
        {
            type: 'accordion',
            label: '悬浮',
            children: [
                {
                    type: 'grid',
                    key: 'style',
                    children: [
                        {
                            key: 'backgroundColorHover',
                            type: 'color-picker',
                            label: '背景',
                            value: style?.backgroundColorHover,
                            config: {
                                showText: true,
                            }
                        },
                        {
                            key: 'borderRadiusHover',
                            type: 'number-input',
                            label: '边框圆角',
                            value: style?.borderRadiusHover,
                            config: {min: 0}
                        },
                        {
                            key: 'borderWidthHover',
                            type: 'number-input',
                            label: '边框宽度',
                            value: style?.borderWidthHover,
                            config: {min: 0}
                        },
                        {
                            key: 'borderColorHover',
                            type: 'color-picker',
                            label: '边框颜色',
                            value: style?.borderColorHover,
                            config: {showText: true}
                        }
                    ]
                },

            ]
        }
    ]

    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}
