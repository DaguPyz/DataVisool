/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {useState} from "react";
import {FieldChangeData, DatavisoolGUI, type Control} from "@datavisool/ui";
import LoopContainerController, {LoopContainerProps} from "./LoopContainerController.ts";
import {ConfigType} from "@/designer/right/ConfigContent.tsx";

const LoopContainerConfig: React.FC<ConfigType<LoopContainerController>> = ({controller}) => {
    const [, setCount] = useState(0);

    const config = controller.getConfig()?.style ?? {};
    const horizontalGap = Number(config?.horizontalGap ?? 0) || 0;
    const verticalGap = Number(config?.verticalGap ?? 0) || 0;

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment, reRender} = fieldChangeData;
        controller.update(dataFragment as LoopContainerProps);
        if (reRender)
            setCount((count) => count + 1);
    }

    const schema: Control = {
        key: 'style',
        type: 'grid',
        children: [
            {
                key: 'flexDirection',
                type: 'select',
                label: '布局方式',
                value: config?.flexDirection,
                config: {
                    options: [
                        {value: 'row', label: '横向'},
                        {value: 'column', label: '纵向'},
                    ]
                }
            },
            {
                key: 'enableCarousel',
                type: 'switch',
                label: '无限轮播',
                reRender: true,
                value: config?.enableCarousel ?? false,
            },
            {
                key: 'carouselDirection',
                type: 'select',
                label: '轮播方向',
                value: config?.carouselDirection ?? config?.flexDirection ?? 'column',
                config: {
                    options: [
                        {value: 'row', label: '横向'},
                        {value: 'column', label: '纵向'},
                    ]
                }
            },
            {
                key: 'carouselSpeed',
                type: 'number-input',
                label: '轮播速度',
                value: config?.carouselSpeed ?? 3,
                config: {
                    min: 0.1,
                    step: 0.1
                }
            },
            {
                key: 'carouselPauseSeconds',
                type: 'number-input',
                label: '轮播停顿(秒)',
                value: config?.carouselPauseSeconds ?? 0.08,
                config: {
                    min: 0,
                    step: 0.01
                }
            },
            {
                key: 'flexWrap',
                type: 'select',
                label: '是否换行',
                value: config?.flexWrap,
                config: {
                    disabled: !!config?.enableCarousel,
                    options: [
                        {value: 'nowrap', label: '固定一行'},
                        {value: 'wrap', label: '溢出换行'},
                    ]
                }
            },
            {
                key: 'verticalGap',
                type: 'number-input',
                label: '上下间距',
                value: verticalGap,
                config: {
                    min: 0
                }
            },
            {
                key: 'horizontalGap',
                type: 'number-input',
                label: '左右间距',
                value: horizontalGap,
                config: {
                    min: 0
                }
            },
            {
                key: 'overflow',
                type: 'select',
                label: '溢出范围',
                value: config?.overflow,
                config: {
                    disabled: !!config?.enableCarousel,
                    options: [
                        {label: '隐藏', value: 'hidden'},
                        {label: '滚动', value: 'auto'},
                    ]
                }
            }
        ]
    }

    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}

export default LoopContainerConfig;
