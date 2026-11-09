/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Component} from 'react';
import {AreaOptions, ShapeStyle} from "@antv/g2plot";
import AntdCommonAreaController from "@/comps/antd-common/area/AntdCommonAreaController";
import {AntdCartesianCoordinateSys} from "@/comps/antd-common/config/AntdFragment";
import {MappingOptions} from "@antv/g2plot/lib/adaptor/geometries/base";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";

import AntdCommonUtil from "@/comps/antd-common/AntdCommonUtil";
import {ConfigType} from "@/designer/right/ConfigContent";
import {FieldChangeData, DatavisoolGUI, DatavisoolGUIUtil, type Control, Grid} from "@datavisool/ui";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";
import {g2plotLabelSetSchema} from "@/comps/common-component/schema-fragment/SchemaFragment.ts";
import {Label} from "@antv/g2plot/src/types/label.ts";

class AntdBaseAreaStyleConfig extends Component<ConfigType> {

    AreaCoordinateSysChange = (config: AreaOptions) => {
        const controller = this.props.controller as AntdCommonAreaController;
        controller.update({style: config});
    }

    render() {
        const {controller} = this.props;
        const config: AreaOptions = controller.getConfig().style;
        return (
            <Grid gridGap={'15px'}>
                <AntdBaseAreaGraphics controller={controller}/>
                <AntdCartesianCoordinateSys onChange={this.AreaCoordinateSysChange} config={config}/>
            </Grid>
        );
    }
}

export {AntdBaseAreaStyleConfig};

export const AntdBaseAreaGraphics: React.FC<ConfigType> = ({controller}) => {

    const config: AreaOptions = controller.getConfig().style;

    const _onChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataKeyPath} = fieldChangeData;
        let {dataFragment} = fieldChangeData;
        if (id === 'areaColor') {
            const g2Color = G2ColorUtil.parseCssToG2Color(data as string);
            dataFragment = DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, g2Color);
        }
        if (id === 'colorConvert')
            dataFragment = DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, G2ColorUtil.parseCssToG2Color(data as string));
        controller.update(dataFragment);
    }

    const schema: Control = {
        key: 'style',
        type: 'accordion',
        label: '图形',
        children: [
            {
                type:'grid',
                children:[
                    {
                        type: 'sub-accordion',
                        label: '基础',
                        children: [
                            {
                                label: '基准填充',
                                type: 'switch',
                                key: 'startOnZero',
                                value: !!config?.startOnZero,
                            },
                        ]
                    },
                    {
                        label: '数据点',
                        type: 'sub-accordion',
                        children: [
                            {
                                type: 'grid',
                                children: [
                                    {
                                        key: 'point',
                                        children: [
                                            {
                                                label: '尺寸',
                                                type: 'number-input',
                                                key: 'size',
                                                value: (config?.point as MappingOptions)?.size as number || 0,
                                                config: {
                                                    min: 0,
                                                    max: 10,
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
                                                        key: 'fill',
                                                        type: 'color-picker',
                                                        label: '颜色',
                                                        value: G2ColorUtil.parseG2ToCssColor((config?.point?.style as ShapeStyle)?.fill ?? "#fff"),
                                                        config: {
                                                            showText: true,
                                                            modes: ['single', "radial", "linear"]
                                                        }
                                                    },
                                                    {
                                                        id: 'colorConvert',
                                                        key: 'stroke',
                                                        type: 'color-picker',
                                                        label: '描边色',
                                                        value: G2ColorUtil.parseG2ToCssColor((config?.point?.style as ShapeStyle)?.stroke ?? '#fff'),
                                                        config: {
                                                            showText: true,
                                                            modes: ['single', "radial", "linear"]
                                                        }
                                                    },
                                                ]
                                            },
                                            {
                                                key: 'shape',
                                                type: 'select',
                                                label: '形状',
                                                value: (config?.point as MappingOptions)?.shape as string || 'circle',
                                                config: {
                                                    options: [
                                                        {value: 'circle', label: '圈形'},
                                                        {value: 'square', label: '方形'},
                                                        {value: 'bowtie', label: '领结'},
                                                        {value: 'diamond', label: '钻石'},
                                                        {value: 'hexagon', label: '六角形'},
                                                        {value: 'triangle', label: '三角形'}]
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ],
                    },
                    {
                        label: '数据线',
                        type: 'sub-accordion',
                        children: [
                            {
                                type: 'grid',
                                config: {
                                    gridGap: '15px'
                                },
                                children: [
                                    {
                                        label: '平滑',
                                        type: 'switch',
                                        key: 'smooth',
                                        value: !!config?.smooth,
                                    },
                                    {
                                        key: 'line',
                                        children: [
                                            {
                                                key: 'size',
                                                type: 'number-input',
                                                label: '宽度',
                                                value: config?.line?.size as number || 0,
                                                config: {
                                                    min: 0,
                                                    max: 10,
                                                }
                                            },
                                            {
                                                key: 'color',
                                                id: 'areaColor',
                                                type: 'color-picker',
                                                label: '颜色',
                                                value: G2ColorUtil.parseG2ToCssColor(config?.line?.color as string || '#fff'),
                                                config: {
                                                    showText: true,
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
                        label: '数据面',
                        type: 'sub-accordion',
                        key: 'areaStyle',
                        children: [
                            {
                                type: 'grid',
                                children: [{
                                    key: 'fill',
                                    id: 'areaColor',
                                    type: 'color-picker',
                                    label: '颜色',
                                    value: G2ColorUtil.parseG2ToCssColor((config?.areaStyle as ShapeStyle)?.fill || '#fff'),
                                    config: {
                                        showText: true,
                                        modes: ['single', 'linear', 'radial']
                                    }
                                }]
                            }
                        ]
                    },
                    g2plotLabelSetSchema(config?.label as Label)
                ]
            }
        ],
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={_onChange}/>
    )
}

export const AntdBaseAreaFieldMapping: React.FC<ConfigType<AntdBaseDesignerController>> = (props) => {
    const {controller} = props;
    const config = controller?.config?.style;
    const options = AntdCommonUtil.getDataFieldOptions(controller);
    const schema: Control = {
        key: 'style',
        type: 'grid',
        children: [
            {
                key: 'xField',
                type: 'select',
                label: 'X字段',
                value: config?.xField,
                config: {
                    options,
                }
            },
            {
                key: 'yField',
                type: 'select',
                label: 'Y字段',
                value: config?.yField,
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
