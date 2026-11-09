/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ConfigType} from "@/designer/right/ConfigContent.tsx";
import {AntdCartesianCoordinateSys} from "@/comps/antd-common/config/AntdFragment.tsx";
import {LineOptions, ShapeStyle} from "@antv/g2plot";
import AntdRadarController from "./AntdRadarController.ts";
import {FieldChangeData, Grid, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import React from "react";
import AntdCommonUtil from "@/comps/antd-common/AntdCommonUtil.ts";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";

export default function AntdRadarStyleConfig(props: ConfigType<AntdRadarController>) {
    const {controller} = props;
    const config = controller.getConfig()?.style;

    const lineCoordinateSysChange = (config: LineOptions) => {
        controller.update({style: config});
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataKeyPath, dataFragment} = fieldChangeData;
        if (id === 'colorConvert') {
            const newData = G2ColorUtil.parseCssToG2Color(data as string);
            controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
        } else
            controller.update(dataFragment);
    }

    const schema: Control = {
        type: 'accordion',
        label: '图形',
        key: 'style',
        config: {
            titleStyle: {height: 49}
        },
        children: [
            {
                type: 'grid',
                children: [
                    {
                        type: 'sub-accordion',
                        label: '基础',
                        children: [
                            {
                                type: 'grid',
                                children: [
                                    {
                                        type: 'number-input',
                                        label: '半径',
                                        key: 'radius',
                                        value: config?.radius,
                                        config: {
                                            min: 0.1,
                                            max: 1,
                                            step: 0.1
                                        }
                                    },
                                    {
                                        type: 'switch',
                                        label: '平滑',
                                        key: 'smooth',
                                        value: config?.smooth
                                    }
                                ],
                            }
                        ]
                    },
                    {
                        type: 'sub-accordion',
                        label: '辅助点',
                        key: 'point',
                        children: [
                            {
                                type: 'grid',
                                children: [
                                    {
                                        type: 'number-input',
                                        label: '大小',
                                        key: 'size',
                                        value: config?.point?.size
                                    },
                                    {
                                        type: 'select',
                                        label: '形状',
                                        key: 'shape',
                                        value: config?.point?.shape,
                                        config: {
                                            options: [
                                                {label: '圆', value: 'circle'},
                                                {label: '钻石', value: 'diamond'},
                                                {label: '三角', value: 'triangle'},
                                            ]
                                        }
                                    },
                                    {
                                        key: 'style',
                                        children: [
                                            {
                                                id: 'colorConvert',
                                                type: 'color-picker',
                                                label: '颜色',
                                                key: 'fill',
                                                value: G2ColorUtil.parseG2ToCssColor((config?.point?.color as ShapeStyle)?.stroke ?? "#fff"),
                                                config: {
                                                    showText: true,
                                                    modes: ['single', 'linear', 'radial']
                                                }
                                            },
                                            {
                                                id: 'colorConvert',
                                                type: 'color-picker',
                                                label: '边框',
                                                key: 'stroke',
                                                value: G2ColorUtil.parseG2ToCssColor((config?.point?.style as any)?.stroke ?? "#fff"),
                                                config: {
                                                    showText: true,
                                                    modes: ['single', 'linear', 'radial']
                                                }
                                            },
                                            {
                                                type: 'number-input',
                                                label: '边框宽度',
                                                key: 'lineWidth',
                                                value: (config?.point?.style as any)?.lineWidth,
                                                config: {
                                                    min: 0,
                                                    max: 10,
                                                    step: 1
                                                }
                                            }
                                        ]
                                    }
                                ],
                            }
                        ]
                    },
                    {
                        type: 'sub-accordion',
                        label: '面积边框',
                        key: 'lineStyle',
                        children: [
                            {
                                type: 'grid',
                                children: [
                                    {
                                        id: 'colorConvert',
                                        type: 'color-picker',
                                        label: '颜色',
                                        key: 'stroke',
                                        value: G2ColorUtil.parseG2ToCssColor((config?.lineStyle as any)?.stroke ?? "#fff"),
                                        config: {
                                            showText: true,
                                            modes: ['single', 'linear', 'radial']
                                        }
                                    },
                                    {
                                        type: 'number-input',
                                        label: '宽度',
                                        key: 'lineWidth',
                                        value: (config?.lineStyle as any)?.lineWidth,
                                        config: {
                                            min: 0,
                                            max: 10,
                                            step: 1
                                        }
                                    },
                                    {
                                        type: 'number-input',
                                        label: '透明度',
                                        key: 'opacity',
                                        value: (config?.lineStyle as any)?.opacity,
                                        config: {
                                            min: 0,
                                            max: 1,
                                            step: 0.1
                                        }
                                    }
                                ],
                            }
                        ]
                    },
                    {
                        type: 'sub-accordion',
                        label: '雷达面',
                        key: 'area',
                        children: [
                            {
                                type: 'grid',
                                key: 'style',
                                children: [
                                    {
                                        id: 'colorConvert',
                                        type: 'color-picker',
                                        label: '颜色',
                                        key: 'fill',
                                        value: G2ColorUtil.parseG2ToCssColor((config?.area?.style as any)?.fill ?? "#fff"),
                                        config: {
                                            showText: true,
                                            modes: ['single', 'linear', 'radial']
                                        }
                                    },
                                    {
                                        type: 'number-input',
                                        label: '透明度',
                                        key: 'fillOpacity',
                                        value: (config?.area?.style as any)?.fillOpacity,
                                        config: {
                                            min: 0,
                                            max: 1,
                                            step: 0.1
                                        }
                                    }
                                ],
                            }
                        ]
                    },
                ]
            }
        ]
    }

    return (
        <Grid gridGap={'15px'}>
            <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
            <AntdCartesianCoordinateSys onChange={lineCoordinateSysChange} config={controller.getConfig()?.style}/>
        </Grid>
    );
}

export const AntdRadarFieldMapping: React.FC<ConfigType<AntdRadarController>> = ({controller}) => {
    const config = controller.getConfig()?.style;
    const options = AntdCommonUtil.getDataFieldOptions(controller);
    const schema: Control = {
        type: 'grid',
        key: 'style',
        children: [
            {
                type: 'select',
                label: 'x轴字段',
                key: 'xField',
                value: config?.xField,
                config: {
                    options,
                }
            },
            {
                type: 'select',
                label: 'y轴字段',
                key: 'yField',
                value: config?.yField,
                config: {
                    options,
                }
            },
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        controller.update(dataFragment);
    }

    return <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
}
