/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Component} from 'react';
import {AntdCartesianCoordinateSys} from "@/comps/antd-common/config/AntdFragment.tsx";
import {Column, ColumnOptions} from "@antv/g2plot";
import type {AbstractController} from "@datavisool/sdk/core";
import AntdCommonColumnController, {AntdColumnProps} from "./AntdCommonColumnController";
import {WritableColumnOptions} from "@/comps/antd-common/types";
import {FieldChangeData, Grid, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import AntdCommonUtil from "@/comps/antd-common/AntdCommonUtil";
import {AntdLegend} from "@/comps/antd-common/config/legend/AntdLegend.tsx";
import {ConfigType} from "@/designer/right/ConfigContent";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";
import {g2plotLabelSetSchema} from "@/comps/common-component/schema-fragment/SchemaFragment.ts";

class AntdColumnCommonStyleConfig extends Component<ConfigType<AntdCommonColumnController>> {

    barGraphicsChange = (config: ColumnOptions) => {
        const controller: AbstractController<Column, AntdColumnProps> = this.props.controller;
        controller.update({style: config});
    }

    barCoordinateSysChange = (config: ColumnOptions) => {
        const controller: AbstractController<Column, AntdColumnProps> = this.props.controller;
        controller.update({style: config});
    }

    render() {
        const {controller} = this.props;
        const config = controller.getConfig()?.style;
        return (
            <Grid gridGap={'15px'}>
                <AntdColumnGraphics controller={controller}/>
                <AntdLegend controller={controller}/>
                <AntdCartesianCoordinateSys onChange={this.barCoordinateSysChange} config={config}/>
            </Grid>
        );
    }
}

export {AntdColumnCommonStyleConfig};


export interface AntdColumnGraphicsProps {
    config?: WritableColumnOptions;

    onChange(config: WritableColumnOptions): void;
}

export const AntdColumnGraphics: React.FC<ConfigType<AntdCommonColumnController>> = ({controller}) => {

    const config = controller.getConfig()!.style!;

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataFragment, dataKeyPath} = fieldChangeData;
        if (id === 'colorConvert') {
            let color;
            if (Array.isArray(data)) {
                //多色
                color = data.map(color => G2ColorUtil.parseCssToG2Color(color));
            } else {
                //单色
                color = G2ColorUtil.parseCssToG2Color(data as string);
            }
            controller.update(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, color));
        } else {
            controller.update(dataFragment);
        }
    }

    const schema: Control = {
        key: 'style',
        type: 'accordion',
        label: '图形',
        children: [
            {
                type: 'grid',
                children: [
                    {
                        key: 'maxColumnWidth',
                        type: 'number-input',
                        label: '宽度',
                        value: 12,
                        config: {
                            min: 0,
                            max: 100,
                        }
                    },
                    {
                        key: 'columnStyle',
                        children: [
                            {
                                key: 'radius',
                                type: 'number-input',
                                label: '圆角',
                                value: (config?.columnStyle as any)?.radius,
                                config: {
                                    min: 0,
                                    max: 100,
                                }
                            }
                        ]

                    },
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
                    },
                    g2plotLabelSetSchema(config?.label ?? {})
                ]
            },
        ]
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    )

}


export const AntdColumnCommonFieldMapping: React.FC<ConfigType> = (props) => {
    const {controller} = props;
    const {xField, yField, seriesField} = controller.getConfig().style;
    const options = AntdCommonUtil.getDataFieldOptions(controller);
    const schema: Control = {
        key: 'style',
        type: 'grid',
        children: [
            {
                key: 'xField',
                type: 'select',
                label: 'X字段',
                value: xField,
                config: {
                    options,
                }
            },
            {
                key: 'yField',
                type: 'select',
                label: 'Y字段',
                value: yField,
                config: {
                    options,
                }
            },
            {
                key: 'seriesField',
                type: 'select',
                label: '分组字段',
                value: seriesField,
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
