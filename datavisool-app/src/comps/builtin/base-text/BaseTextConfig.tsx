/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Component} from 'react';
import {BaseTextController} from "./BaseTextController";
import {ConfigType} from "../../../designer/right/ConfigContent";
import {AlignBottomTwo, AlignHorizontalCenterTwo, AlignLeftTwo, AlignRightTwo, AlignTopTwo, AlignVerticalCenterTwo} from "@icon-park/react";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";

export const BaseTextStyleConfig: React.FC<ConfigType<BaseTextController>> = ({controller}) => {

    const {data, style, base} = controller.getConfig()!;

    const changeContent = (data: string) => {
        controller.update({data: {value: data}});
        if (!base?.id)
            return;
        if (!window.DATAVISOOL_ENV.currentManager.layerManager?.layerConfigs)
            return;
        if (window.DATAVISOOL_ENV.currentManager.layerManager?.layerConfigs[base?.id])
            window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs[base?.id].name = data;
        if (!window.DATAVISOOL_ENV.layerInstances)
            return;
        const layerInstance = window.DATAVISOOL_ENV.layerInstances[base?.id];
        layerInstance && (layerInstance as Component).setState({name: data});
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment, id, data} = fieldChangeData;
        if (id === 'baseTextContent')
            changeContent(data as string)
        else if (id === 'color') {
            if ((data as string).includes("gradient")) {
                //渐变色
                controller.update({
                    style: {
                        color: data as string,
                        backgroundImage: data as string,
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }
                })
            } else {
                //单色
                controller.update({
                    style: {
                        color: data as string,
                        backgroundImage: 'initial',
                        backgroundClip: 'initial',
                        WebkitBackgroundClip: 'initial',
                        WebkitTextFillColor: 'initial',
                    }
                });
            }
        } else
            controller.update(dataFragment!);
    }

    const schema: Control = {
        type: 'grid',
        children: [
            {
                key: 'data',
                children: [
                    {
                        id: 'baseTextContent',
                        key: 'value',
                        type: 'text-area',
                        label: '内容',
                        value: data?.value,
                    },
                ]
            },
            {
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
                        id: 'color',
                        key: 'color',
                        type: 'color-picker',
                        label: '颜色',
                        value: style?.color,
                        config: {
                            showText: true,
                            modes: ['single', 'linear', 'radial']
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
                        key: 'letterSpacing',
                        type: 'number-input',
                        label: '字距',
                        value: style?.letterSpacing,
                        config: {
                            min: 0,
                            step: 0.1
                        }
                    },
                    {
                        key: 'lineHeight',
                        type: 'number-input',
                        label: '行距',
                        value: style?.lineHeight,
                        config: {
                            min: 0,
                            step: 0.1
                        }
                    },
                    {
                        label: "文本对齐",
                        type: 'group-button',
                        key: 'textAlign',
                        value: style?.textAlign,
                        config: {
                            items: [
                                {
                                    value: 'left',
                                    content: <AlignLeftTwo theme="filled" size="16"
                                                           strokeWidth={2}
                                                           strokeLinecap="square"/>
                                },
                                {
                                    value: 'center',
                                    content: <AlignHorizontalCenterTwo theme="filled" size="16"
                                                                       strokeWidth={2} strokeLinecap="square"/>
                                },
                                {
                                    value: 'right',
                                    content: <AlignRightTwo theme="filled" size="16"
                                                            strokeWidth={2}
                                                            strokeLinecap="square"/>
                                }
                            ]
                        }
                    },
                    {
                        label: "水平对齐",
                        type: 'group-button',
                        key: 'justifyContent',
                        value: style?.justifyContent,
                        config: {
                            items: [
                                {
                                    value: 'flex-start',
                                    content: <AlignLeftTwo theme="filled" size="16"
                                                           strokeWidth={2}
                                                           strokeLinecap="square"/>
                                },
                                {
                                    value: 'center',
                                    content: <AlignHorizontalCenterTwo theme="filled" size="16"
                                                                       strokeWidth={2} strokeLinecap="square"/>
                                },
                                {
                                    value: 'flex-end',
                                    content: <AlignRightTwo theme="filled" size="16"
                                                            strokeWidth={2}
                                                            strokeLinecap="square"/>
                                }
                            ]
                        }
                    },
                    {
                        label: '垂直对齐',
                        type: 'group-button',
                        key: 'alignItems',
                        value: style?.alignItems,
                        config: {
                            items: [
                                {
                                    value: 'flex-start',
                                    content: <AlignTopTwo theme="filled" size="16"
                                                          strokeWidth={2}
                                                          strokeLinecap="square"/>
                                },
                                {
                                    value: 'center',
                                    content: <AlignVerticalCenterTwo theme="filled" size="16"
                                                                     strokeWidth={2} strokeLinecap="square"/>
                                },
                                {
                                    value: 'flex-end',
                                    content: <AlignBottomTwo theme="filled" size="16"
                                                             strokeWidth={2}
                                                             strokeLinecap="square"/>
                                }
                            ]
                        }
                    },
                    {
                        key: 'strokeColor',
                        type: 'color-picker',
                        label: '描边色',
                        value: style?.strokeColor,
                        config: {
                            showText: true,
                        }
                    },
                    {
                        key: 'strokeWidth',
                        type: 'number-input',
                        label: '描边宽',
                        value: style?.strokeWidth,
                        config: {
                            min: 0,
                            max: 10,
                            step: 1
                        }
                    },
                ]
            },

        ]
    }

    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}
