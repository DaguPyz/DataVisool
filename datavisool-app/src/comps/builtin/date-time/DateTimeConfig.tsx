/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {DateTimeController} from "./DateTimeController.ts";
import {ConfigType} from "../../../designer/right/ConfigContent";
import {
    AlignBottomTwo,
    AlignHorizontalCenterTwo,
    AlignLeftTwo,
    AlignRightTwo,
    AlignTopTwo,
    AlignVerticalCenterTwo
} from "@icon-park/react";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";

export const DateTimeConfig: React.FC<ConfigType<DateTimeController>> = ({controller}) => {

    const config = controller.getConfig()?.style ?? {};

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        controller.update(dataFragment);
    }

    const schema: Control = {
        type: 'grid',
        children: [
            {
                key: 'style',
                children: [
                    {
                        key: 'fontSize',
                        type: 'number-input',
                        label: '字号',
                        value: config?.fontSize,
                        config: {min: 1}
                    },
                    {
                        key: 'fontWeight',
                        type: 'number-input',
                        label: '加粗',
                        value: config?.fontWeight || 400,
                        config: {
                            min: 100,
                            max: 900,
                            step: 100
                        }
                    },
                    {
                        key: 'color',
                        type: 'color-picker',
                        label: '颜色',
                        value: config?.color,
                        config: {
                            showText: true,
                        }
                    },
                    {
                        key: 'fontFamily',
                        type: 'select',
                        label: '字体',
                        value: config?.fontFamily,
                        config: {
                            options: window.DATAVISOOL_ENV.fonts,
                        }
                    },
                    {
                        key: 'letterSpacing',
                        type: 'number-input',
                        label: '字距',
                        value: config?.letterSpacing,
                        config: {
                            step: 0.1
                        }
                    },
                    {
                        type: "select",
                        label: "模板",
                        key: 'formatType',
                        value: config?.formatType,
                        config: {
                            options: [
                                {label: '-', value: '0'},
                                {label: '/', value: '1'},
                                {label: 'CN', value: '2'},
                            ]
                        }
                    },
                    {
                        label: "水平对齐",
                        type: 'group-button',
                        key: 'justifyContent',
                        value: config?.justifyContent,
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
                        value: config?.alignItems,
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
        ]
    }


    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}

