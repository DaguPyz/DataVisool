/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {TextScrollerController} from "./TextScrollerController.ts";
import {ConfigType} from "../../../designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";

export const TextScrollerConfig: React.FC<ConfigType<TextScrollerController>> = ({controller}) => {

    const config = controller.getConfig()?.style ?? {};

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
        key: 'style',
        type: 'grid',
        children: [
            {
                key: 'speed',
                type: 'number-input',
                label: '速度',
                value: config.speed,
                config: {
                    min: 0,
                    step: 0.1
                }
            },
            {
                key: 'fontSize',
                type: 'number-input',
                label: '字号',
                value: config.fontSize,
                config: {
                    min: 1,
                    max: 100
                }
            },
            {
                key: 'fontWeight',
                type: 'number-input',
                label: '加粗',
                value: config.fontWeight,
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
                value: config?.color,
                config: {
                    showText: true,
                    modes: ['single', 'linear', 'radial']
                }
            },
            {
                key: 'fontFamily',
                type: 'select',
                label: '字体',
                value: config.fontFamily,
                config: {
                    options: window.DATAVISOOL_ENV.fonts,
                }
            }
        ]
    }


    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}

