/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {ConfigType} from "../../../designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";
import {DateTimePickerController} from "./DateTimePickerController.ts";

export const DateTimePickerStyleConfig: React.FC<ConfigType<DateTimePickerController>> = ({controller}) => {
    const {style} = controller.getConfig()!;

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        console.log(dataFragment);
        controller.update(dataFragment!);
    };

    const schema: Control[] = [
        {
            type: 'accordion',
            label: '基础设置',
            children: [
                {
                    type: 'grid',
                    key: 'style',
                    config: {
                        containerStyle: {
                            marginBottom: '10px'
                        }
                    },
                    children: [
                        {
                            key: 'pickerType',
                            type: 'select',
                            label: '选择器类型',
                            value: style?.pickerType || 'date',
                            config: {
                                options: [
                                    {label: '日期', value: 'date'},
                                    {label: '周', value: 'week'},
                                    {label: '月', value: 'month'},
                                    {label: '季度', value: 'quarter'},
                                    {label: '年', value: 'year'},
                                    {label: '日期时间', value: 'datetime'},
                                    {label: '日期范围', value: 'range'},
                                ]
                            }
                        },
                        {
                            key: 'placeholder',
                            type: 'input',
                            label: '占位文本',
                            value: style?.placeholder,
                        },
                        {
                            key: 'format',
                            type: 'input',
                            label: '日期格式',
                            value: style?.format || 'YYYY-MM-DD',
                        },
                    ]
                },
                {
                    type: 'grid',
                    key: 'style',
                    children: [
                        {
                            key: 'allowClear',
                            type: 'switch',
                            label: '允许清空',
                            value: style?.allowClear ?? true,
                        },
                        {
                            key: 'disabled',
                            type: 'switch',
                            label: '禁用状态',
                            value: style?.disabled ?? false,
                        },
                        {
                            key: 'showTime',
                            type: 'switch',
                            label: '显示时间',
                            value: style?.showTime ?? false,
                        },
                        {
                            key: 'showNow',
                            type: 'switch',
                            label: '显示此刻',
                            value: style?.showNow ?? true,
                        }
                    ]
                },
            ],
        },
        {
            type: 'accordion',
            label: '颜色',
            key: 'style',
            children: [
                {
                    key: 'token',
                    type: 'grid',
                    config: {
                        containerStyle: {
                            marginBottom: '10px'
                        }
                    },
                    children: [
                        {key: 'colorBgContainerDisabled', type: 'color-picker', label: '输入框禁用背景', value: style?.token?.colorBgContainerDisabled, config: {showText: true}},
                        {key: 'colorBgElevated', type: 'color-picker', label: '弹框背景', value: style?.token?.colorBgElevated, config: {showText: true}},
                        {key: 'colorBorder', type: 'color-picker', label: '边框色', value: style?.token?.colorBorder, config: {showText: true}},
                        {key: 'colorIcon', type: 'color-picker', label: '图标色', value: style?.token?.colorIcon, config: {showText: true}},
                        {key: 'colorIconHover', type: 'color-picker', label: '图标悬浮色', value: style?.token?.colorIconHover, config: {showText: true}},
                        {key: 'colorText', type: 'color-picker', label: '图标色', value: style?.token?.colorText, config: {showText: true}},
                        {key: 'colorSplit', type: 'color-picker', label: '分割线', value: style?.token?.colorSplit, config: {showText: true}},
                        {key: 'colorPrimary', type: 'color-picker', label: '基础色', value: style?.token?.colorPrimary, config: {showText: true}},
                        {key: 'colorTextHeading', type: 'color-picker', label: '弹窗标题', value: style?.token?.colorTextHeading, config: {showText: true}},
                        {key: 'colorTextPlaceholder', type: 'color-picker', label: '占位符', value: style?.token?.colorTextPlaceholder, config: {showText: true}},
                    ]
                },
                {
                    key: 'components',
                    type: 'grid',
                    children: [
                        {key: 'colorBgContainer', type: 'color-picker', label: '输入框背景', value: style?.components?.colorBgContainer, config: {showText: true}},
                        {key: 'activeBg', type: 'color-picker', label: '输入框激活背景', value: style?.components?.activeBg, config: {showText: true}},
                        {key: 'activeBorderColor', type: 'color-picker', label: '输入框激活边框', value: style?.components?.activeBorderColor, config: {showText: true}},
                        {key: 'cellActiveWithRangeBg', type: 'color-picker', label: '日期范围激活背景', value: style?.components?.cellActiveWithRangeBg, config: {showText: true}},
                        {key: 'cellHoverWithRangeBg', type: 'color-picker', label: '日期范围悬浮背景', value: style?.components?.cellHoverWithRangeBg, config: {showText: true}},
                        {key: 'cellHoverBg', type: 'color-picker', label: '单元格悬浮背景', value: style?.components?.cellHoverBg, config: {showText: true}},
                        {key: 'hoverBg', type: 'color-picker', label: '输入框悬浮背景', value: style?.components?.hoverBg, config: {showText: true}},
                        {key: 'hoverBorderColor', type: 'color-picker', label: '输入框悬浮边框', value: style?.components?.hoverBorderColor, config: {showText: true}},
                        {key: 'activeShadow', type: 'color-picker', label: '激活阴影', value: style?.components?.activeShadow, config: {showText: true}},
                    ]
                }
            ]
        },
        {
            type: 'accordion',
            label: '尺寸布局',
            key: 'style',
            children: [
                {
                    type: 'grid',
                    key: 'components',
                    config: {
                        containerStyle: {
                            marginBottom: '10px'
                        }
                    },
                    children: [
                        {key: 'cellHeight', type: 'number-input', label: '单元格高度', value: style?.components?.cellHeight, config: {step: 1, min: 0}},
                        {key: 'cellWidth', type: 'number-input', label: '单元格宽度', value: style?.components?.cellWidth, config: {step: 1, min: 0}},
                        {key: 'inputFontSize', type: 'number-input', label: '输入框字号', value: style?.components?.inputFontSize, config: {step: 1, min: 0}},
                        {key: 'paddingBlock', type: 'number-input', label: '输入框纵向内边距', value: style?.components?.paddingBlock, config: {step: 1, min: 0}},
                        {key: 'paddingInline', type: 'number-input', label: '输入框横向内边距', value: style?.components?.paddingInline, config: {step: 1, min: 0}},
                        {key: 'textHeight', type: 'number-input', label: '文本高度', value: style?.components?.textHeight, config: {step: 1, min: 0}},
                        {key: 'timeCellHeight', type: 'number-input', label: '时间单元格高度', value: style?.components?.timeCellHeight, config: {step: 1, min: 0}},
                        {key: 'timeColumnHeight', type: 'number-input', label: '时间列高度', value: style?.components?.timeColumnHeight, config: {step: 1, min: 0}},
                        {key: 'timeColumnWidth', type: 'number-input', label: '时间列宽度', value: style?.components?.timeColumnWidth, config: {step: 1, min: 0}},
                        {key: 'withoutTimeCellHeight', type: 'number-input', label: '无时间单元格高度', value: style?.components?.withoutTimeCellHeight, config: {step: 1, min: 0}},

                    ]
                },
                {
                    type: 'grid',
                    key: 'token',
                    children: [
                        {key: 'fontSize', type: 'number-input', label: '基础字号', value: style?.token?.fontSize, config: {step: 1, min: 0}},
                        {key: 'padding', type: 'number-input', label: '内边距', value: style?.token?.padding, config: {step: 1, min: 0}},
                        {key: 'lineWidth', type: 'number-input', label: '线宽', value: style?.token?.lineWidth, config: {step: 1, min: 0}},
                        {key: 'borderRadius', type: 'number-input', label: '圆角', value: style?.token?.borderRadius, config: {step: 1, min: 0}},
                        {
                            key: 'lineType', type: 'select', label: '边框类型', value: style?.token?.lineType, config: {
                                options: [
                                    {label: '实线', value: 'solid'},
                                    {label: '虚线', value: 'dashed'},
                                    {label: '点状线', value: 'dotted'},
                                    {label: '双线', value: 'double'},
                                ]
                            }
                        },
                    ]
                }
            ]
        },
        {
            type: 'accordion',
            label: '字体',
            key: 'style',
            children: [
                {
                    type: 'grid',
                    key: 'token',
                    children: [
                        {key: 'fontFamily', type: 'select', label: '字体', value: style?.token?.fontFamily, config: {options: window.DATAVISOOL_ENV.fonts}},
                        {key: 'fontWeightStrong', type: 'number-input', label: '字体', value: style?.token?.fontWeightStrong, config: {step: 100, min: 100}},
                    ]
                }
            ]
        }
    ];

    return (
        <div>
            <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
        </div>
    );
};
