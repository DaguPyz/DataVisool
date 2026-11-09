/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './Legend.less';
import {FieldChangeData, DatavisoolGUI, type Control} from "@datavisool/ui";
import {ConfigType} from "@/designer/right/ConfigContent";
import {useState} from "react";
import {cloneDeep} from "lodash";

const defaultLegendConfig = {
    legend: {
        position: "top",
        layout: "horizontal",
        itemName: {
            style: {
                fill: "#989898ff",
                fontSize: 10,
            },
        },
    }
}

export const AntdLegend = (props: ConfigType) => {
    const {controller} = props;
    const {legend} = controller.getConfig().style;
    const [count, setCount] = useState(0);

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataFragment, reRender} = fieldChangeData;
        if (id === 'legendSwitch') {
            if (data) controller.update({style: cloneDeep(defaultLegendConfig)});
            else controller.update({style: {legend: false}});
        } else {
            controller.update(dataFragment);
        }
        if (reRender)
            setCount(count + 1);
    }

    const schema: Control = {
        key: 'style',
        type: 'accordion',
        label: '图例',
        children: [
            {
                key: 'legend',
                type: 'grid',
                children: [
                    {
                        id: 'legendSwitch',
                        type: 'switch',
                        label: '显示',
                        reRender: true,
                        value: !!legend
                    },
                    {
                        rules: `"${!!legend}" === "true"`,
                        children: [
                            {
                                type: 'sub-accordion',
                                label: '基础',
                                config: {
                                    containerStyle: {
                                        marginBottom: 0
                                    }
                                },
                                children: [
                                    {
                                        type: 'grid',
                                        children: [
                                            {
                                                key: 'position',
                                                type: 'select',
                                                label: '位置',
                                                value: 'left-top',
                                                config: {
                                                    options: [
                                                        {value: 'left-top', label: '左上'},
                                                        {value: 'left', label: '正左'},
                                                        {value: 'left-bottom', label: '左下'},
                                                        {value: 'top-left', label: '上左'},
                                                        {value: 'top', label: '正上'},
                                                        {value: 'top-right', label: '上右'},
                                                        {value: 'right-top', label: '右上'},
                                                        {value: 'right', label: '正右'},
                                                        {value: 'right-bottom', label: '右下'},
                                                        {value: 'bottom-left', label: '下左'},
                                                        {value: 'bottom', label: '正下'},
                                                        {value: 'bottom-right', label: '下右'},
                                                    ]
                                                }
                                            },
                                            {
                                                key: 'layout',
                                                type: 'select',
                                                label: '方向',
                                                value: 'horizontal',
                                                config: {
                                                    options: [
                                                        {value: 'horizontal', label: '水平'},
                                                        {value: 'vertical', label: '垂直'},
                                                    ]
                                                }
                                            },
                                            {
                                                key: 'itemName',
                                                children: [
                                                    {
                                                        key: 'style',
                                                        children: [
                                                            {
                                                                key: 'fontSize',
                                                                type: 'number-input',
                                                                label: '字号',
                                                                value: 12,
                                                                config: {
                                                                    min: 0,
                                                                    max: 100,
                                                                }
                                                            },
                                                            {
                                                                key: 'fill',
                                                                type: 'color-picker',
                                                                label: '颜色',
                                                                value: '#1c1c1c',
                                                                config: {
                                                                    showText: true,
                                                                }
                                                            }
                                                        ]
                                                    }
                                                ]
                                            },
                                            {
                                                key: 'itemSpacing',
                                                type: 'number-input',
                                                label: '水平间距',
                                                value: legend?.itemSpacing ?? 0,
                                            },
                                            {
                                                key: 'itemMarginBottom',
                                                type: 'number-input',
                                                label: '垂直间距',
                                                value: legend?.itemMarginBottom ?? 0,
                                            },
                                            {
                                                key: "marker",
                                                children: [
                                                    {
                                                        key: 'spacing',
                                                        type: 'number-input',
                                                        label: '图标间距',
                                                        value: legend?.itemName?.spacing ?? 0,
                                                    },
                                                    {
                                                        key: 'symbol',
                                                        label: '形状',
                                                        type: 'select',
                                                        value: legend?.marker?.symbol ?? 'circle',
                                                        config: {
                                                            options: [
                                                                {value: 'circle', label: '圆形'},
                                                                {value: 'square', label: '方形'},
                                                                {value: 'diamond', label: '钻石'},
                                                                {value: 'triangle', label: '三角'},
                                                                {value: 'triangle-down', label: '倒三角'},
                                                                {value: 'hexagon', label: '六角'},
                                                                {value: 'bowtie', label: '领结'},
                                                                {value: 'cross', label: '十字'},
                                                                {value: 'tick', label: '勾选'},
                                                                {value: 'plus', label: '加号'},
                                                                {value: 'hyphen', label: '连字'},
                                                                {value: 'line', label: '线条'},
                                                            ]
                                                        }
                                                    },
                                                    {
                                                        key: 'style',
                                                        children: [
                                                            {
                                                                key: 'r',
                                                                type: 'number-input',
                                                                label: '半径',
                                                                value: legend?.marker?.style?.r,
                                                            }
                                                        ]
                                                    }
                                                ]
                                            },
                                        ]
                                    }
                                ]
                            },

                            {
                                key: 'background',
                                type: 'sub-accordion',
                                label: '背景',
                                children: [
                                    {
                                        type: 'grid',
                                        children: [
                                            {
                                                key: 'padding',
                                                type: 'number-input',
                                                label: '边距',
                                                value: legend?.background?.padding ?? 0
                                            },
                                            {
                                                key: 'style',
                                                children: [
                                                    {
                                                        key: 'fill',
                                                        type: 'color-picker',
                                                        label: '颜色',
                                                        value: legend?.background?.style?.fill
                                                    },
                                                    {
                                                        key: 'x',
                                                        type: 'number-input',
                                                        label: '坐标x',
                                                        value: legend?.background?.style?.x ?? 0
                                                    },
                                                    {
                                                        key: 'y',
                                                        type: 'number-input',
                                                        label: '坐标y',
                                                        value: legend?.background?.style?.y ?? 0
                                                    },
                                                    {
                                                        key: 'width',
                                                        type: 'number-input',
                                                        label: '宽度',
                                                        value: legend?.background?.style?.width ?? 0
                                                    },
                                                    {
                                                        key: 'height',
                                                        type: 'number-input',
                                                        label: '高度',
                                                        value: legend?.background?.style?.height ?? 0
                                                    },
                                                    {
                                                        key: 'stroke',
                                                        type: 'color-picker',
                                                        label: '描边色',
                                                        value: legend?.background?.style?.stroke
                                                    },
                                                    {
                                                        key: 'lineWidth',
                                                        type: 'number-input',
                                                        label: '描边宽',
                                                        value: legend?.background?.style?.lineWidth ?? 0
                                                    },
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    );
};
