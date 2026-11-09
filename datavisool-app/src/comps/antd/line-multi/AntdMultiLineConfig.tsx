/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {ShapeAttrs} from "@antv/g-base";
import {ConfigType} from "@/designer/right/ConfigContent.tsx";
import AntdCommonLineController from "@/comps/antd-common/line/AntdCommonLineController.ts";
import {LineOptions, ShapeStyle} from "@antv/g2plot";
import {AntdCartesianCoordinateSys} from "@/comps/antd-common/config/AntdFragment.tsx";
import {AntdLegend} from "@/comps/antd-common/config/legend/AntdLegend.tsx";
import AntdCommonUtil from "@/comps/antd-common/AntdCommonUtil.ts";
import {FieldChangeData, Grid, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";
import {g2plotLabelSetSchema} from "@/comps/common-component/schema-fragment/SchemaFragment.ts";


export default function AntdMultiLineStyleConfig(props: ConfigType<AntdCommonLineController>) {

    const {controller} = props;
    const config = controller.getConfig()!.style!;

    const lineCoordinateSysChange = (config: LineOptions) => {
        controller.update({style: config});
    }

    return (
        <Grid gridGap={'15px'}>
            <AntdMultiLineGraphics controller={controller}/>
            <AntdLegend controller={controller}/>
            <AntdCartesianCoordinateSys onChange={lineCoordinateSysChange} config={config}/>
        </Grid>
    );
}

export const AntdMultiLineGraphics = (props: ConfigType<AntdCommonLineController>) => {

    const {controller} = props;
    const config = controller.getConfig()!.style!;
    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataKeyPath, dataFragment} = fieldChangeData;
        if (id === 'colorConvert') {
            if (Array.isArray(data)) {
                const newData = data.map(color => G2ColorUtil.parseCssToG2Color(color));
                controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            } else {
                const newData = G2ColorUtil.parseCssToG2Color(data as string);
                controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            }
        } else
            controller.update(dataFragment);
    }

    const schema: Control = {
        type: 'accordion',
        label: '图形',
        key: 'style',
        config: {bodyStyle: {marginTop: 10}},
        children: [
            {
                type: 'grid',
                children: [
                    {
                        type: 'sub-accordion',
                        label: '线条',
                        children: [
                            {
                                type: 'grid',
                                children: [
                                    {
                                        key: 'smooth',
                                        type: 'switch',
                                        label: '平滑',
                                        value: config?.smooth,
                                    },
                                    {
                                        key: 'lineStyle',
                                        children: [
                                            {
                                                key: 'lineWidth',
                                                type: 'number-input',
                                                label: '宽度',
                                                value: (config?.lineStyle as ShapeAttrs)?.lineWidth,
                                                config: {
                                                    min: 0,
                                                    max: 10,
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        id: 'colorConvert',
                                        key: 'color',
                                        type: 'color-mode',
                                        label: '颜色',
                                        value: Array.isArray(config?.color) ?
                                            config?.color?.map(color => G2ColorUtil.parseG2ToCssColor(color)) :
                                            G2ColorUtil.parseG2ToCssColor(config?.color as string) || '#1c1c1c',
                                        config: {
                                            modes: ['single', 'linear', 'radial']
                                        }
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: 'sub-accordion',
                        label: '数据点',
                        children: [
                            {
                                key: 'point',
                                type: 'grid',
                                children: [
                                    {
                                        key: 'size',
                                        type: 'number-input',
                                        label: '尺寸',
                                        value: config?.point?.size,
                                        config: {
                                            min: 0,
                                            max: 10,
                                        }
                                    },
                                    {
                                        id: 'colorConvert',
                                        key: 'color',
                                        type: 'color-mode',
                                        label: '颜色',
                                        value: Array.isArray((config?.point as ShapeAttrs)?.color) ?
                                            (config?.point as ShapeAttrs)?.color?.map((color: string) => G2ColorUtil.parseG2ToCssColor(color)) :
                                            G2ColorUtil.parseG2ToCssColor((config?.point as ShapeAttrs)?.color as string) || '#1c1c1c',
                                        config: {
                                            modes: ['single', 'linear', 'radial']
                                        }
                                    },
                                    {
                                        key: 'style',
                                        children: [
                                            {
                                                key: 'lineWidth',
                                                type: 'number-input',
                                                label: '描边宽',
                                                value: (config?.point?.style as ShapeStyle)?.lineWidth,
                                                config: {
                                                    min: 0
                                                }
                                            },
                                            {
                                                id: 'colorConvert',
                                                key: 'stroke',
                                                type: 'color-picker',
                                                label: '描边色',
                                                value: G2ColorUtil.parseG2ToCssColor((config?.point?.style as ShapeStyle)?.stroke ?? "#fff"),
                                                config: {
                                                    showText: true,
                                                    modes: ['single', 'linear', 'radial']
                                                }
                                            },
                                        ]
                                    },
                                    {
                                        key: 'shape',
                                        type: 'select',
                                        label: '形状',
                                        value: config?.point?.shape,
                                        config: {
                                            options: [
                                                {value: 'circle', label: '圈形'},
                                                {value: 'square', label: '方形'},
                                                {value: 'bowtie', label: '领结'},
                                                {value: 'diamond', label: '钻石'},
                                                {value: 'hexagon', label: '六角形'},
                                                {value: 'triangle', label: '三角形'}]
                                        }
                                    },
                                ]
                            }
                        ]
                    },
                    g2plotLabelSetSchema(config?.label ?? {})
                ]
            }
        ]
    }


    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    )
}


export const AntdMultiLineFieldMapping: React.FC<ConfigType<AntdCommonLineController>> = ({controller}) => {
    const options = AntdCommonUtil.getDataFieldOptions(controller);
    const {xField, yField, seriesField} = controller.getConfig()?.style ?? {};
    const schema: Control = {
        type: 'grid',
        key: 'style',
        children: [
            {
                key: 'xField',
                value: xField,
                type: 'select',
                label: 'X字段',
                config: {
                    options,
                }
            },
            {
                value: yField,
                key: 'yField',
                type: 'select',
                label: 'Y字段',
                config: {
                    options,
                }
            },
            {
                value: seriesField,
                key: 'seriesField',
                type: 'select',
                label: '分组字段',
                config: {
                    options,
                }
            }
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {dataFragment} = fieldChangeData;
        controller.update(dataFragment);
    }

    return <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
}
