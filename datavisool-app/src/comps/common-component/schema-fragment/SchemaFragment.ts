/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Control} from "@datavisool/ui";
import {Label} from "@antv/g2plot/src/types/label.ts";

/**
 * 字体设置
 * @param config
 */
export const fontSetSchema = (config: { fontSize: number, fontWeight: number, fontFamily: string }): Control[] => {
    return [
        {
            key: 'fontSize',
            type: 'number-input',
            label: '字号',
            value: config?.fontSize || 12,
        },
        {
            key: 'fontWeight',
            type: 'number-input',
            label: '粗细',
            value: config?.fontWeight || 400,
            config: {
                min: 100,
                max: 900,
                step: 100,
            }
        },
        {
            key: 'fontFamily',
            type: 'select',
            label: '字体',
            value: config?.fontFamily || 'Arial',
            config: {
                options: window.DATAVISOOL_ENV.fonts,
            }
        }
    ]
}

/**
 * css字体设置
 * @param config
 */
export const cssFontSetSchema = (config: { color: string, fontSize: number, fontWeight: number, fontFamily: string }): Control[] => {
    return [
        {
            key: 'color',
            type: 'color-picker',
            label: '颜色',
            value: config?.color || '#fff',
            config: {
                showText: true
            }
        },
        ...fontSetSchema(config)
    ]
}

/**
 * g2plot字体设置
 * @param config
 */
export const g2plotFontSetSchema = (config: { fill: string, fontSize: number, fontWeight: number, fontFamily: string }): Control[] => {
    return [
        {
            key: 'fill',
            type: 'color-picker',
            label: '颜色',
            value: config?.fill || '#fff',
            config: {
                showText: true
            }
        },
        ...fontSetSchema(config)
    ]
}

/**
 * g2plot系列图表数据点文本设置
 * @param label
 */
export const g2plotLabelSetSchema = (label?: Label): Control => {
    return {
        label: '文本',
        type: 'sub-accordion',
        children: [
            {
                type: 'grid',
                key: 'label',
                children: [
                    {
                        key: 'position',
                        type: 'select',
                        label: '位置',
                        value: (label as any)?.position || 'top',
                        config: {
                            options: [
                                {value: 'top', label: '顶部'},
                                {value: 'bottom', label: '底部'},
                                {value: 'middle', label: '中间'},
                                {value: 'left', label: '左侧'},
                                {value: 'right', label: '右侧'},
                            ]
                        }
                    },
                    {
                        key: 'offsetY',
                        type: 'number-input',
                        label: 'Y偏移',
                        value: (label as any)?.offsetY || 0,
                    },
                    {
                        key: 'offsetX',
                        type: 'number-input',
                        label: 'X偏移',
                        value: (label as any)?.offsetX || 0,
                    },
                    {
                        key: 'style',
                        children: g2plotFontSetSchema((label as any)?.style),
                    }
                ]
            }
        ]
    }
}

