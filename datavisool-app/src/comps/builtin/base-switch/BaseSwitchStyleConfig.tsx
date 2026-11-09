/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {ConfigType} from "../../../designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";
import {SwitchController} from "./BaseSwitchController.ts";

export const SwitchStyleConfig: React.FC<ConfigType<SwitchController>> = ({controller}) => {
    const {style} = controller.getConfig()!;

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        console.log(dataFragment);
        controller.update(dataFragment!);
    };

    const schema: Control[] = [
        {
            type: 'accordion',
            key: 'style',
            label: '基础设置',
            children: [
                {
                    type: 'grid',
                    key: 'props',
                    config: {containerStyle: {marginBottom: '10px'}},
                    children: [
                        {
                            key: 'size',
                            type: 'select',
                            label: '开关尺寸',
                            value: style?.props?.size || 'default',
                            config: {
                                options: [
                                    {label: '默认', value: 'default'},
                                    {label: '小号', value: 'small'},
                                    {label: '大号', value: 'large'},
                                ]
                            }
                        },
                        {
                            key: 'checkedChildren',
                            type: 'input',
                            label: '开启时文本',
                            value: style?.props?.checkedChildren || '',
                        },
                        {
                            key: 'unCheckedChildren',
                            type: 'input',
                            label: '关闭时文本',
                            value: style?.props?.unCheckedChildren || '',
                        },
                    ]
                },
                {
                    type: 'grid',
                    key: 'props',
                    children: [
                        {
                            key: 'loading',
                            type: 'switch',
                            label: '加载状态',
                            value: style?.props?.loading ?? false,
                        },
                        {
                            key: 'disabled',
                            type: 'switch',
                            label: '禁用状态',
                            value: style?.props?.disabled ?? false,
                        },
                    ]
                },
            ]
        },
        {
            type: 'accordion',
            label: '开关按钮样式',
            key: 'style',
            children: [
                {
                    type: 'grid',
                    key: 'token',
                    config: {containerStyle: {marginBottom: '10px'}},
                    children: [
                        {key: 'colorPrimary', type: 'color-picker', label: '主色', value: style?.token?.colorPrimary || '#1677ff', config: {showText: true}},
                        {key: 'colorPrimaryHover', type: 'color-picker', label: '悬浮色', value: style?.token?.colorPrimaryHover || '#1677ff', config: {showText: true}},
                        {key: 'colorPrimaryBorder', type: 'color-picker', label: '边框色', value: style?.token?.colorPrimaryBorder || '#1677ff', config: {showText: true}},
                        {key: 'colorText', type: 'color-picker', label: '文本色', value: style?.token?.colorText || '#1677ff', config: {showText: true}},
                        {key: 'colorTextLightSolid', type: 'color-picker', label: '按钮状态文本', value: style?.token?.colorTextLightSolid || '#1677ff', config: {showText: true}},
                    ]
                },
                {
                    type: 'grid',
                    key: 'components',
                    children: [
                        {key: 'handleSize', type: 'number-input', label: '把手尺寸', value: style?.components?.handleSize ?? 20, config: {min: 0}},
                        {key: 'trackHeight', type: 'number-input', label: '开关高度', value: style?.components?.trackHeight ?? 24, config: {min: 0}},
                        {key: 'trackMinWidth', type: 'number-input', label: '最小宽度', value: style?.components?.trackMinWidth ?? 44, config: {min: 0}},
                        {key: 'trackPadding', type: 'number-input', label: '内边距', value: style?.components?.trackPadding ?? 2, config: {min: 0}},
                        {key: 'handleBg', type: 'color-picker', label: '把手背景', value: style?.components?.handleBg || '#1677ff', config: {showText: true}},
                        {key: 'colorBgContainer', type: 'color-picker', label: '容器背景', value: style?.components?.colorBgContainer || '#1677ff', config: {showText: true}},

                    ]
                }
            ]
        },
        {
            type: 'accordion',
            label: '标签文本',
            key: 'style',
            children: [
                {
                    type: 'grid',
                    key: 'label',
                    children: [
                        {
                            key: 'content',
                            type: 'input',
                            label: '标签文本',
                            value: style?.label?.content || '',
                        },
                        {
                            key: 'position',
                            type: 'select',
                            label: '标签位置',
                            value: style?.label?.position || 'left',
                            config: {
                                options: [
                                    {label: '左侧', value: 'left'},
                                    {label: '右侧', value: 'right'},
                                ]
                            }
                        },
                        {
                            key: 'fontSize',
                            type: 'number-input',
                            label: '标签字号',
                            value: style?.label?.fontSize || 14,
                            config: {min: 8, max: 72}
                        },
                        {
                            key: 'fontWeight',
                            type: 'number-input',
                            label: '标签字重',
                            value: style?.label?.fontWeight || 400,
                            config: {min: 100, max: 900, step: 100}
                        },
                        {
                            key: 'fontFamily',
                            type: 'select',
                            label: '标签字体',
                            value: style?.label?.fontFamily,
                            config: {
                                options: window.DATAVISOOL_ENV.fonts,
                            }
                        },
                        {
                            key: 'color',
                            type: 'color-picker',
                            label: '标签文字色',
                            value: style?.label?.color || '#ffffff',
                            config: {
                                showText: true,
                            }
                        },
                        {
                            key: 'fontWeight',
                            type: 'number-input',
                            label: '标签文字粗细',
                            value: style?.label?.fontWeight || 400,
                            config: {
                                min: 100,
                                max: 900,
                                step: 100
                            }
                        },
                    ]
                }
            ]
        },
    ];

    return (
        <div style={{padding: 10}}>
            <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
        </div>
    );
};