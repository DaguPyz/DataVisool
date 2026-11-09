/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {BaseSelectController} from "./BaseSelectController.ts";
import {ConfigType} from "../../../designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";

export const BaseSelectStyleConfig: React.FC<ConfigType<BaseSelectController>> = ({controller}) => {

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
                            key: 'fontFamily',
                            type: 'select',
                            label: '字体',
                            value: style?.fontFamily,
                            config: {
                                options: window.DATAVISOOL_ENV.fonts,
                            }
                        },
                        {
                            key: 'selectorBg',
                            type: 'color-picker',
                            label: '背景',
                            value: style?.selectorBg,
                            config: {
                                showText: true,
                                 modes: ['single', 'linear', 'radial']
                            }
                        },
                        {
                            key: 'colorText',
                            type: 'color-picker',
                            label: '文本',
                            value: style?.colorText,
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
                            key: 'lineWidth',
                            type: 'number-input',
                            label: '边框宽度',
                            value: style?.lineWidth,
                            config: {min: 0}
                        },
                        {
                            key: 'colorBorder',
                            type: 'color-picker',
                            label: '边框颜色',
                            value: style?.colorBorder,
                            config: {
                                showText: true,
                            }
                        },
                        {
                            key: 'colorPrimaryHover',
                            type: 'color-picker',
                            label: '边框悬浮',
                            value: style?.colorPrimaryHover,
                            config: {
                                showText: true,
                            }
                        },
                        {
                            key: 'controlOutline',
                            type: 'color-picker',
                            label: '边框激活',
                            value: style?.controlOutline,
                            config: {
                                showText: true,
                            }
                        },
                    ]
                }
            ]
        },
        {
            type: 'accordion',
            label: '下拉选项',
            children: [
                {
                    type: 'grid',
                    key: 'style',
                    children: [
                        {
                            key: 'optionFontSize',
                            type: 'number-input',
                            label: '字号',
                            value: style?.optionFontSize,
                            config: {min: 1}
                        },
                        {
                            key: 'optionHeight',
                            type: 'number-input',
                            label: '选项高度',
                            value: style?.optionHeight,
                            config: {min: 1}
                        },
                        {
                            key: 'borderRadiusLG',
                            type: 'number-input',
                            label: '边框圆角',
                            value: style?.borderRadiusLG,
                            config: {min: 1}
                        },
                        {
                            key: 'optionSelectedBg',
                            type: 'color-picker',
                            label: '选中背景',
                            value: style?.optionSelectedBg,
                            config: {showText: true}
                        },
                        {
                            key: 'optionSelectedColor',
                            type: 'color-picker',
                            label: '选中文本',
                            value: style?.optionSelectedColor,
                            config: {showText: true}
                        },
                        {
                            key: 'optionActiveBg',
                            type: 'color-picker',
                            label: '悬浮背景',
                            value: style?.optionActiveBg,
                            config: {showText: true}
                        },
                        {
                            key: 'colorBgElevated',
                            type: 'color-picker',
                            label: '面板背景',
                            value: style?.colorBgElevated,
                            config: {showText: true}
                        },
                    ]
                }
            ]
        }
    ]

    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}
