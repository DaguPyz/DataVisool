/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Component} from 'react';
import {AntdCartesianCoordinateSys} from "@/comps/antd-common/config/AntdFragment.tsx";
import {Area, AreaOptions, ShapeStyle} from "@antv/g2plot";
import type {AbstractController} from "@datavisool/sdk/core";
import AntdCommonAreaController, {AntdAreaProps} from "./AntdCommonAreaController";
import {FieldChangeData, DatavisoolGUI, DatavisoolGUIUtil, type Control, Grid} from "@datavisool/ui";
import AntdCommonUtil from "@/comps/antd-common/AntdCommonUtil";
import {AntdLegend} from "@/comps/antd-common/config/legend/AntdLegend.tsx";
import {ShapeAttrs} from "@antv/g-base";
import {ConfigType} from "@/designer/right/ConfigContent";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";
import {g2plotLabelSetSchema} from "@/comps/common-component/schema-fragment/SchemaFragment.ts";
import {Label} from "@antv/g2plot/src/types/label.ts";

class AntdAreaCommonStyleConfig extends Component<ConfigType<AntdCommonAreaController>> {

    areaCoordinateSysChange = (config: AreaOptions) => {
        const controller: AbstractController<Area, AntdAreaProps> = this.props.controller;
        controller.update({style: config});
    }

    render() {
        const {controller} = this.props;
        const config = controller.getConfig()?.style;
        return (
            <Grid gridGap={'15px'}>
                <AntdCommonAreaGraphics controller={controller}/>
                <AntdLegend controller={controller}/>
                <AntdCartesianCoordinateSys onChange={this.areaCoordinateSysChange} config={config}/>
            </Grid>
        );
    }
}

export {AntdAreaCommonStyleConfig};

export const AntdCommonAreaGraphics = (props: ConfigType<AntdCommonAreaController>) => {
    const {controller} = props;
    const config = controller.getConfig()?.style;

    const _onChange = (fieldChangeData: FieldChangeData) => {
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
        config: {
            bodyStyle: {
                marginTop: 10
            }
        },
        children: [
            {
                type: 'grid',
                children: [
                    {
                        type: 'sub-accordion',
                        label: '数据点',
                        key: 'point',
                        children: [
                            {
                                type: 'grid',
                                children: [
                                    {
                                        key: 'size',
                                        type: 'number-input',
                                        label: '尺寸',
                                        value: config?.point?.size || 0,
                                        config: {
                                            min: 0,
                                            max: 100
                                        }
                                    },
                                    {
                                        key: 'shape',
                                        type: 'select',
                                        label: '形状',
                                        value: config?.point?.shape || 'circle',
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
                                        id: 'colorConvert',
                                        key: 'color',
                                        type: 'color-mode',
                                        label: '颜色',
                                        value: Array.isArray(config?.point?.color) ?
                                            config?.point?.color?.map(color => G2ColorUtil.parseG2ToCssColor(color)) :
                                            G2ColorUtil.parseG2ToCssColor(config?.point?.color as string) || '#1c1c1c',
                                        config: {
                                            modes: ['single', 'linear', 'radial']
                                        }
                                    },
                                ]
                            }
                        ]
                    },
                    {
                        type: 'sub-accordion',
                        label: '数据线',
                        children: [
                            {
                                type: 'grid',
                                children: [
                                    {
                                        key: 'smooth',
                                        type: 'switch',
                                        label: '平滑',
                                        value: config?.smooth || false,
                                    },
                                    {
                                        key: 'line',
                                        children: [
                                            {
                                                key: 'style',
                                                children: [
                                                    {
                                                        key: 'lineWidth',
                                                        type: 'number-input',
                                                        label: '宽度',
                                                        value: (config?.line?.style as ShapeAttrs)?.lineWidth || 0,
                                                        config: {
                                                            min: 0,
                                                            max: 100
                                                        }
                                                    },
                                                ]
                                            },
                                            {
                                                id: 'colorConvert',
                                                key: 'color',
                                                type: 'color-mode',
                                                label: '颜色',
                                                value: Array.isArray(config?.line?.color) ?
                                                    config?.line?.color?.map(color => G2ColorUtil.parseG2ToCssColor(color)) :
                                                    G2ColorUtil.parseG2ToCssColor(config?.line?.color as string) || '#1c1c1c',
                                                config: {
                                                    modes: ['single', 'linear', 'radial']
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: 'sub-accordion',
                        label: '数据面',
                        children: [
                            {
                                type: 'grid',
                                children: [
                                    {
                                        id: 'colorConvert',
                                        type: 'color-mode',
                                        label: '颜色',
                                        key: 'color',
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
                    g2plotLabelSetSchema(config?.label as Label ?? {})
                ]
            }
        ]
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={_onChange}/>
    )
}

export const AntdAreaCommonFieldMapping: React.FC<ConfigType> = (props) => {
    const {controller} = props;
    const config = controller.config.style;
    const options = AntdCommonUtil.getDataFieldOptions(controller);
    const schema: Control = {
        key: 'style',
        type: 'grid',
        children: [
            {
                key: 'xField',
                type: 'select',
                label: 'X字段',
                value: config.xField,
                config: {
                    options,
                }
            },
            {
                key: 'yField',
                type: 'select',
                label: 'Y字段',
                value: config.yField,
                config: {
                    options,
                }
            },
            {
                key: 'seriesField',
                type: 'select',
                label: '分组字段',
                value: config.seriesField,
                config: {
                    options,
                }
            }
        ]
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        controller.update(fieldChangeData.dataFragment);
    }

    return <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/></div>
}
