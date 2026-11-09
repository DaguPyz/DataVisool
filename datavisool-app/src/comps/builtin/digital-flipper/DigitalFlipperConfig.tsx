/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {DigitalFlipperController} from "./DigitalFlipperController";
import {ConfigType} from "../../../designer/right/ConfigContent";
import {AlignBottomTwo, AlignHorizontalCenterTwo, AlignLeftTwo, AlignRightTwo, AlignTopTwo, AlignVerticalCenterTwo} from "@icon-park/react";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";

export const DigitalFlipperConfig: React.FC<ConfigType<DigitalFlipperController>> = ({controller}) => {

    const config = controller.getConfig();

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment, id, data} = fieldChangeData;
        if (id === 'color') {
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
            controller.update(dataFragment);
    }

    const schema: Control = {
        type: 'grid',
        key: 'style',
        children: [
            {
                key: 'prefix',
                type: 'input',
                label: '前缀',
                value: config?.style?.prefix,
            },
            {
                key: 'suffix',
                type: 'input',
                label: '后缀',
                value: config?.style?.suffix,
            },
            {
                key: 'decimalPlaces',
                type: 'number-input',
                label: '小数位',
                value: config?.style?.decimalPlaces,
            },
            {
                key: 'separator',
                type: 'input',
                label: '分隔符',
                value: config?.style?.separator,
            },
            {
                key: 'duration',
                type: 'number-input',
                label: '动画时长',
                value: config?.style?.duration,
                config: {min: 0, step: 0.1}
            },
            {
                key: 'fontSize',
                type: 'number-input',
                label: '字号',
                value: config?.style?.fontSize,
                config: {min: 0},
            },
            {
                key: 'fontWeight',
                type: 'number-input',
                label: '粗细',
                value: config?.style?.fontWeight,
                config: {min: 0, max: 900, step: 100},
            },
            {
                id: 'color',
                key: 'color',
                type: 'color-picker',
                label: '颜色',
                value: config?.style?.color,
                config: {
                    showText: true,
                    modes: ['single', 'linear', 'radial']
                }
            },
            {
                key: 'type',
                type: 'select',
                label: '类型',
                tip: '注：渐变色仅在跳动效果下生效',
                value: config?.style?.type,
                config: {
                    options: [
                        {label: '滑动', value: 'slide'},
                        {label: '跳动', value: 'caper'},
                    ]
                }
            },
            {
                key: 'fontFamily',
                type: 'select',
                label: '字体',
                value: config?.style?.fontFamily,
                config: {
                    options: window.DATAVISOOL_ENV.fonts,
                }
            },
            {
                label: "水平对齐",
                type: 'group-button',
                key: 'justifyContent',
                value: config?.style?.justifyContent,
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
                label: "垂直对齐",
                type: 'group-button',
                key: 'alignItems',
                value: config?.style?.alignItems,
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
            }
        ]
    }


    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}

