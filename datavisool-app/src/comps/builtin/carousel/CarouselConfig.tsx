/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {CarouselController} from "./CarouselController.ts";
import {ConfigType} from "../../../designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";

export const CarouselConfig: React.FC<ConfigType<CarouselController>> = ({controller}) => {

    const config = controller.getConfig()?.style ?? {};

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        const fragment = dataFragment as {style?: Record<string, unknown>};
        const style = {...fragment.style};
        if (typeof style.autoplaySpeed === 'number')
            style.autoplaySpeed = Math.max(0, Math.min(60000, style.autoplaySpeed));
        if (typeof style.speed === 'number')
            style.speed = Math.max(0, Math.min(10000, style.speed));
        controller.update({...fragment, style});
    }

    const schema: Control = {
        key: 'style',
        type: 'grid',
        children: [
            {
                type: 'switch',
                key: 'autoplay',
                label: '自动播放',
                value: config.autoplay,
            },
            {
                type: 'number-input',
                key: 'autoplaySpeed',
                label: '播放速度',
                value: config.autoplaySpeed,
                config: {min: 0, max: 60000},
            },
            {
                type: 'switch',
                key: 'dots',
                label: '显示按钮',
                value: config.dots,
            },
            {
                type: 'switch',
                key: 'fade',
                label: '淡入淡出',
                value: config.fade,
            },
            {
                type: 'number-input',
                key: 'speed',
                label: '动效速度',
                value: config.speed,
                config: {min: 0, max: 10000},
            },
        ]
    }


    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}

