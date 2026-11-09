/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import BaseVideoController from "./BaseVideoController.ts";
import {ConfigType} from "../../../designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {Control} from "@datavisool/ui";

export const BaseVideoStyleConfig: React.FC<ConfigType<BaseVideoController>> = ({controller}) => {

    const config = controller.getConfig()?.style;

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        controller.update(dataFragment);
    }

    const schema: Control = {
        type: 'grid',
        key: 'style',
        children: [
            {
                type: 'accordion',
                label: '基础设置',
                children: [
                    {
                        type: 'grid',
                        children: [
                            {
                                type: 'input',
                                label: '视频地址',
                                key: 'src',
                                value: config?.src,
                            },
                            {
                                type: 'input',
                                label: '封面图',
                                key: 'poster',
                                value: config?.poster,
                            }
                        ]
                    }
                ]
            },
            {
                type: 'accordion',
                label: '播放控制',
                children: [
                    {
                        type: 'grid',
                        children: [
                            {
                                type: 'switch',
                                label: '自动播放',
                                key: 'autoPlay',
                                value: config?.autoPlay ?? true,
                            },
                            {
                                type: 'switch',
                                label: '循环播放',
                                key: 'loop',
                                value: config?.loop ?? false,
                            },
                            {
                                type: 'switch',
                                label: '静音',
                                key: 'muted',
                                value: config?.muted ?? false,
                            },
                            {
                                type: 'switch',
                                label: '显示控件',
                                key: 'controls',
                                value: config?.controls ?? true,
                            }
                        ]
                    }
                ]
            },
            {
                type: 'accordion',
                label: '样式设置',
                children: [
                    {
                        type: 'grid',
                        children: [
                            {
                                type: 'select',
                                label: '填充模式',
                                key: 'objectFit',
                                value: config?.objectFit ?? 'contain',
                                config: {
                                    options: [
                                        {label: '包含 (Contain)', value: 'contain'},
                                        {label: '覆盖 (Cover)', value: 'cover'},
                                        {label: '填充 (Fill)', value: 'fill'},
                                        {label: '无 (None)', value: 'none'},
                                        {label: '缩小 (Scale Down)', value: 'scale-down'},
                                    ]
                                }
                            }
                        ]
                    }
                ]
            }
        ]
    }

    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
    )
}
