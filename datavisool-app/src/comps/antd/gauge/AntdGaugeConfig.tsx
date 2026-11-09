/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ConfigType} from "@/designer/right/ConfigContent";
import AntdGaugeController from "./AntdGaugeController.ts";
import {Indicator} from "@antv/g2plot/lib/plots/gauge/types";
import {CSSProperties} from "react";
import {StatisticText} from "@antv/g2plot";
import {FieldChangeData, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";

export default function AntdGaugeConfig(props: ConfigType<AntdGaugeController>) {
    const {controller} = props;
    const config = controller.getConfig()?.style;

    const schema: Control = {
        key: 'style',
        children: [
            {
                type: 'accordion',
                label: '图形',
                children: [
                    {
                        type: 'sub-accordion',
                        label: '基础',
                        children: [
                            {
                                type: 'grid',
                                children: [
                                    {
                                        key: 'radius',
                                        type: 'number-input',
                                        label: '外半径',
                                        value: config?.radius,
                                        config: {
                                            min: 0,
                                            max: 1,
                                            step: 0.01
                                        },
                                    },
                                    {
                                        id: 'startAngle',
                                        key: 'startAngle',
                                        type: 'number-input',
                                        label: '起始角度',
                                        value: config!.startAngle! / Math.PI * 180,
                                    },
                                    {
                                        key: 'innerRadius',
                                        type: 'number-input',
                                        label: '内半径',
                                        value: config?.innerRadius,
                                        config: {
                                            min: 0,
                                            max: 1,
                                            step: 0.01
                                        },
                                    },
                                    {
                                        id: 'endAngle',
                                        key: 'endAngle',
                                        type: 'number-input',
                                        label: '结束角度',
                                        value: config!.endAngle! / Math.PI * 180,
                                    },
                                    {
                                        key: 'range',
                                        children: [
                                            {
                                                id: 'colorConvert',
                                                key: 'color',
                                                type: 'color-mode',
                                                label: '颜色',
                                                value: Array.isArray(config?.range?.color) ?
                                                    config?.range?.color?.map(color => G2ColorUtil.parseG2ToCssColor(color)) :
                                                    G2ColorUtil.parseG2ToCssColor(config?.range?.color as string) || '#1c1c1c',
                                                config: {
                                                    modes: ['single', 'linear', 'radial']
                                                }
                                            },
                                        ]
                                    },
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                type: 'accordion',
                label: '指针',
                key: 'indicator',
                children: [
                    {
                        type: 'grid',
                        children: [
                            {
                                label: '基础',
                                key: 'pointer',
                                type: 'sub-accordion',
                                children: [
                                    {
                                        type: 'grid',
                                        key: 'style',
                                        children: [
                                            {
                                                id: 'colorConvert',
                                                key: 'stroke',
                                                type: 'color-picker',
                                                label: '颜色',
                                                value: G2ColorUtil.parseG2ToCssColor((config?.indicator as Indicator)?.pointer!.style?.stroke ?? "#fff"),
                                                config: {
                                                    showText: true,
                                                    modes: ['single', 'linear', 'radial']
                                                }
                                            },
                                            {
                                                key: 'lineWidth',
                                                type: 'number-input',
                                                label: '线宽',
                                                value: (config?.indicator as Indicator)?.pointer!.style?.lineWidth,
                                                config: {
                                                    min: 0,
                                                    max: 10,
                                                    step: 1
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                type: 'sub-accordion',
                                label: '指针原点',
                                children: [
                                    {
                                        key: 'pin',
                                        type: 'grid',
                                        children: [
                                            {
                                                key: 'style',
                                                children: [
                                                    {
                                                        id: 'colorConvert',
                                                        key: 'stroke',
                                                        type: 'color-picker',
                                                        label: '描边',
                                                        value: G2ColorUtil.parseG2ToCssColor((config?.indicator as Indicator)?.pin!.style?.stroke ?? "#fff"),
                                                        config: {
                                                            showText: true,
                                                            modes: ['single', 'linear', 'radial']
                                                        }
                                                    },
                                                    {
                                                        id: 'colorConvert',
                                                        key: 'fill',
                                                        type: 'color-picker',
                                                        label: '填充',
                                                        value: G2ColorUtil.parseG2ToCssColor((config?.indicator as Indicator)?.pin!.style?.fill ?? "#fff"),
                                                        config: {
                                                            showText: true,
                                                            modes: ['single', 'linear', 'radial']
                                                        }
                                                    },
                                                    {
                                                        key: 'r',
                                                        type: 'number-input',
                                                        label: '半径',
                                                        value: (config?.indicator as Indicator)?.pin!.style?.r,
                                                        config: {
                                                            min: 0,
                                                        }
                                                    },
                                                    {
                                                        key: 'lineWidth',
                                                        type: 'number-input',
                                                        label: '描边宽',
                                                        value: (config?.indicator as Indicator)?.pin!.style?.lineWidth,
                                                        config: {
                                                            min: 0,
                                                        }
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                ]
                            },
                        ]
                    }
                ]
            },
            {
                type: 'accordion',
                label: '刻度',
                children: [
                    {
                        type: 'grid',
                        children: [
                            {
                                type: 'sub-accordion',
                                label: '主刻度',
                                key: 'axis',
                                children: [
                                    {
                                        key: 'tickLine',
                                        type: 'grid',
                                        children: [
                                            {
                                                key: 'style',
                                                children: [
                                                    {
                                                        id: 'colorConvert',
                                                        key: 'stroke',
                                                        type: 'color-picker',
                                                        label: '颜色',
                                                        value: G2ColorUtil.parseG2ToCssColor((config?.axis as any)?.tickLine?.style?.stroke ?? "#fff"),
                                                        config: {
                                                            showText: true,
                                                            modes: ['single', 'linear', 'radial']
                                                        }
                                                    },
                                                    {
                                                        key: 'lineWidth',
                                                        type: 'number-input',
                                                        label: '宽度',
                                                        value: (config?.axis as any)?.tickLine?.style?.lineWidth,
                                                        config: {
                                                            min: 0,
                                                        }
                                                    }
                                                ]
                                            },
                                            {
                                                key: 'length',
                                                type: 'number-input',
                                                label: '长度',
                                                value: (config?.axis as any)?.tickLine?.length,
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                type: 'sub-accordion',
                                label: '子刻度',
                                key: 'axis',
                                children: [
                                    {
                                        key: 'subTickLine',
                                        type: 'grid',
                                        children: [
                                            {
                                                key: 'style',
                                                children: [
                                                    {
                                                        id: 'colorConvert',
                                                        key: 'stroke',
                                                        type: 'color-picker',
                                                        label: '颜色',
                                                        value: G2ColorUtil.parseG2ToCssColor((config?.axis as any)?.subTickLine?.style?.stroke ?? "#fff"),
                                                        config: {
                                                            showText: true,
                                                            modes: ['single', 'linear', 'radial']
                                                        }
                                                    },
                                                    {
                                                        key: 'lineWidth',
                                                        type: 'number-input',
                                                        label: '宽度',
                                                        value: (config?.axis as any)?.subTickLine?.style?.lineWidth,
                                                        config: {
                                                            min: 0,
                                                        }
                                                    }
                                                ]
                                            },
                                            {
                                                key: 'length',
                                                type: 'number-input',
                                                label: '长度',
                                                value: (config?.axis as any)?.subTickLine?.length,
                                            },
                                            {
                                                key: 'count',
                                                type: 'number-input',
                                                label: '数量',
                                                value: (config?.axis as any)?.subTickLine?.count,
                                                config: {
                                                    min: 0,
                                                }
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
                type: 'accordion',
                label: '指标文本',
                key: 'statistic',
                children: [
                    {
                        key: 'content',
                        type: 'grid',
                        children: [
                            {
                                key: 'style',
                                children: [
                                    {
                                        key: 'color',
                                        type: 'color-picker',
                                        label: '颜色',
                                        value: ((config?.statistic?.content as StatisticText)?.style as CSSProperties)?.color,
                                        config: {
                                            showText: true,
                                        }
                                    },
                                    {
                                        key: 'fontSize',
                                        type: 'number-input',
                                        label: '字号',
                                        value: parseInt(((config?.statistic?.content as StatisticText)?.style as CSSProperties)?.fontSize as string),
                                        config: {
                                            min: 0,
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                type: 'accordion',
                label: '轴线文本',
                key: 'axis',
                children: [
                    {
                        type: "grid",
                        key: 'label',
                        children: [
                            {
                                key: 'style',
                                children: [
                                    {
                                        type: 'color-picker',
                                        label: '颜色',
                                        key: 'fill',
                                        value: (config?.label as any)?.style?.fill,
                                        config: {
                                            showText: true
                                        }
                                    },
                                    {
                                        type: 'number-input',
                                        label: '字号',
                                        key: 'fontSize',
                                        value: (config?.label as any)?.style?.fontSize,
                                        config: {
                                            min: 0,
                                            max: 100,
                                            step: 1
                                        }
                                    },
                                    {
                                        type: 'select',
                                        label: '对齐',
                                        key: 'textAlign',
                                        value: (config?.label as any)?.style?.textAlign,
                                        config: {
                                            options: [
                                                {value: 'left', label: '左对齐'},
                                                {value: 'center', label: '居中'},
                                                {value: 'right', label: '右对齐'},
                                            ]
                                        }
                                    },
                                    {
                                        type: 'select',
                                        label: '基线',
                                        key: 'textBaseline',
                                        value: (config?.label as any)?.style?.textBaseline,
                                        config: {
                                            options: [
                                                {value: 'top', label: '上对齐'},
                                                {value: 'middle', label: '居中'},
                                                {value: 'bottom', label: '下对齐'},
                                            ]
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataKeyPath} = fieldChangeData;
        let {dataFragment} = fieldChangeData;
        if (id === 'colorConvert') {
            if (Array.isArray(data)) {
                const newData = data.map(color => G2ColorUtil.parseCssToG2Color(color));
                controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            } else {
                const newData = G2ColorUtil.parseCssToG2Color(data as string);
                controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            }
        } else {
            if (id === 'startAngle' || id === 'endAngle')
                dataFragment = DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, Number(data!) / 180 * Math.PI);
            controller.update(dataFragment);
        }
    }

    return <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>;
}
