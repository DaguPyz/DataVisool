/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {ConfigType} from "../../../designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";
import {BaseTabController} from "./BaseTabController.ts";

export const BaseTabStyleConfig: React.FC<ConfigType<BaseTabController>> = ({controller}) => {
    const {style} = controller.getConfig()!;

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
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
                    children: [
                        {
                            key: 'mode',
                            type: 'select',
                            label: '选择模式',
                            value: style?.mode || 'single',
                            config: {
                                options: [
                                    {label: '单选', value: 'single'},
                                    {label: '多选', value: 'multiple'},
                                ]
                            }
                        },
                        {
                            key: 'layout',
                            type: 'select',
                            label: '布局方向',
                            value: style?.layout || 'horizontal',
                            config: {
                                options: [
                                    {label: '水平', value: 'horizontal'},
                                    {label: '垂直', value: 'vertical'},
                                ]
                            }
                        },
                        {
                            key: 'justifyContent',
                            type: 'select',
                            label: '对齐方式',
                            value: style?.justifyContent || 'flex-start',
                            config: {
                                options: [
                                    {label: '左对齐', value: 'flex-start'},
                                    {label: '居中', value: 'center'},
                                    {label: '右对齐', value: 'flex-end'},
                                    {label: '两端对齐', value: 'space-between'},
                                ]
                            }
                        },
                        {
                            key: 'flexWrap',
                            type: 'switch',
                            label: '自动换行',
                            value: style?.flexWrap ?? false,
                        },
                        {
                            key: 'itemGap',
                            type: 'number-input',
                            label: '选项间距',
                            value: style?.itemGap ?? 8,
                            config: {min: 0, max: 100}
                        },
                    ]
                }
            ]
        },
        {
            type: 'accordion',
            label: '容器样式',
            children: [
                {
                    type: 'grid',
                    key: 'style',
                    children: [
                        {
                            key: 'containerBgColor',
                            type: 'color-picker',
                            label: '背景颜色',
                            value: style?.containerBgColor || 'transparent',
                            config: {showText: true}
                        },
                        {
                            key: 'containerRadius',
                            type: 'number-input',
                            label: '容器圆角',
                            value: style?.containerRadius ?? 8,
                            config: {min: 0, max: 100}
                        },
                        {
                            key: 'containerPadding',
                            type: 'number-input',
                            label: '内边距',
                            value: style?.containerPadding ?? 4,
                            config: {min: 0, max: 50}
                        },
                        {
                            key: 'containerBorderWidth',
                            type: 'number-input',
                            label: '边框宽度',
                            value: style?.containerBorderWidth ?? 0,
                            config: {min: 0, max: 10}
                        },
                        {
                            key: 'containerBorderColor',
                            type: 'color-picker',
                            label: '边框颜色',
                            value: style?.containerBorderColor || 'transparent',
                            config: {showText: true}
                        },
                    ]
                }
            ]
        },
        {
            type: 'accordion',
            label: '按钮样式 (默认)',
            children: [
                {
                    type: 'grid',
                    key: 'style',
                    children: [
                        {
                            key: 'itemBgColor',
                            type: 'color-picker',
                            label: '背景颜色',
                            value: style?.itemBgColor || '#2C2C3E',
                            config: {showText: true}
                        },
                        {
                            key: 'itemColor',
                            type: 'color-picker',
                            label: '文字颜色',
                            value: style?.itemColor || '#A0A0B2',
                            config: {showText: true}
                        },
                        {
                            key: 'itemFontSize',
                            type: 'number-input',
                            label: '文字大小',
                            value: style?.itemFontSize ?? 14,
                            config: {min: 8, max: 72}
                        },
                        {
                            key: 'itemHeight',
                            type: 'number-input',
                            label: '按钮高度',
                            value: style?.itemHeight ?? 32,
                            config: {min: 20, max: 100}
                        },
                        {
                            key: 'itemRadius',
                            type: 'number-input',
                            label: '按钮圆角',
                            value: style?.itemRadius ?? 4,
                            config: {min: 0, max: 50}
                        },
                        {
                            key: 'itemBorderWidth',
                            type: 'number-input',
                            label: '边框宽度',
                            value: style?.itemBorderWidth ?? 1,
                            config: {min: 0, max: 5}
                        },
                        {
                            key: 'itemBorderColor',
                            type: 'color-picker',
                            label: '边框颜色',
                            value: style?.itemBorderColor || 'transparent',
                            config: {showText: true}
                        },
                    ]
                }
            ]
        },
        {
            type: 'accordion',
            label: '按钮样式 (选中)',
            children: [
                {
                    type: 'grid',
                    key: 'style',
                    children: [
                        {
                            key: 'activeBgColor',
                            type: 'color-picker',
                            label: '选中背景',
                            value: style?.activeBgColor || '#4FB8FF',
                            config: {showText: true}
                        },
                        {
                            key: 'activeColor',
                            type: 'color-picker',
                            label: '选中文字',
                            value: style?.activeColor || '#FFFFFF',
                            config: {showText: true}
                        },
                        {
                            key: 'activeBorderColor',
                            type: 'color-picker',
                            label: '选中边框',
                            value: style?.activeBorderColor || 'transparent',
                            config: {showText: true}
                        },
                        {
                            key: 'activeFontWeight',
                            type: 'number-input',
                            label: '选中字重',
                            value: style?.activeFontWeight ?? 600,
                            config: {min: 100, max: 900, step: 100}
                        },
                    ]
                }
            ]
        },
        {
            type: 'accordion',
            label: '按钮样式 (悬停)',
            children: [
                {
                    type: 'grid',
                    key: 'style',
                    children: [
                        {
                            key: 'itemHoverBgColor',
                            type: 'color-picker',
                            label: '悬停背景',
                            value: style?.itemHoverBgColor || '#343447',
                            config: {showText: true}
                        },
                        {
                            key: 'itemHoverColor',
                            type: 'color-picker',
                            label: '悬停文字',
                            value: style?.itemHoverColor || '#FFFFFF',
                            config: {showText: true}
                        },
                        {
                            key: 'itemHoverBorderColor',
                            type: 'color-picker',
                            label: '悬停边框',
                            value: style?.itemHoverBorderColor || '#4FB8FF',
                            config: {showText: true}
                        },
                    ]
                }
            ]
        }
    ];

    return (
        <div style={{padding: 10}}>
            <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
        </div>
    );
};
