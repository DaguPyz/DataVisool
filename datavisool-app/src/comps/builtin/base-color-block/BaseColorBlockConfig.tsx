/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {BaseColorBlockController} from "./BaseColorBlockController";
import {ConfigType} from "../../../designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";

export const BaseColorBlockConfig: React.FC<ConfigType<BaseColorBlockController>> = ({controller}) => {

    const {background, borderWidth, borderColor, borderStyle, borderRadius} = controller.getConfig()?.style ?? {};

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        controller.update(dataFragment);
    }

    const schema: Control = {
        key: 'style',
        type: 'grid',
        children: [
            {
                key: 'background',
                type: 'color-picker',
                label: '背景色',
                value: background,
                config: {
                    showText: true,
                    modes: ['single', 'linear', 'radial']
                }
            },
            {
                key: 'borderWidth',
                type: 'number-input',
                label: '边框宽',
                value: borderWidth,
                config: {
                    min: 0,
                    max: 10,
                    step: 1
                }
            },
            {
                key: 'borderColor',
                type: 'color-picker',
                label: '边框色',
                value: borderColor,
                config: {
                    showText: true,
                }
            },
            {
                key: 'borderStyle',
                type: 'select',
                label: '样式',
                value: borderStyle,
                config: {
                    options: [
                        {label: '实线', value: 'solid'},
                        {label: '虚线', value: 'dashed'},
                        {label: '点线', value: 'dotted'},
                        {label: '双线', value: 'double'},
                        {label: '3D凹槽', value: 'groove'},
                        {label: '3D垄状', value: 'ridge'},
                        {label: '3D内嵌', value: 'inset'},
                        {label: '3D外嵌', value: 'outset'},
                        {label: '无边框', value: 'none'},
                    ]
                }
            },
            {
                key: 'borderRadius',
                type: 'number-input',
                label: '圆角',
                value: borderRadius,
                config: {
                    min: 0,
                }
            },
        ]
    }


    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}

