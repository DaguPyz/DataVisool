/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Component} from 'react';
import {AntdCartesianCoordinateSys} from "@/comps/antd-common/config/AntdFragment.tsx";
import {BarOptions} from "@antv/g2plot";
import AntdCommonBarController from "./AntdCommonBarController";
import {FieldChangeData, Grid, ISelectOption, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import {AntdLegend} from "@/comps/antd-common/config/legend/AntdLegend.tsx";
import {ConfigType} from "@/designer/right/ConfigContent";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";
import {g2plotLabelSetSchema} from "@/comps/common-component/schema-fragment/SchemaFragment.ts";

class AntdBarCommonStyleConfig extends Component<ConfigType<AntdCommonBarController>> {

    barCoordinateSysChange = (config: BarOptions) => {
        const controller = this.props.controller as AntdCommonBarController;
        controller.update({style: config});
    }

    render() {
        const {controller} = this.props;
        const config = controller.getConfig()!.style!;
        return (
            <Grid gridGap={'15px'}>
                <AntdBarGraphics controller={controller}/>
                <AntdLegend controller={controller}/>
                <AntdCartesianCoordinateSys onChange={this.barCoordinateSysChange} config={config}/>
            </Grid>
        );
    }
}

export {AntdBarCommonStyleConfig};


export const AntdBarGraphics: React.FC<ConfigType<AntdCommonBarController>> = ({controller}) => {

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
                        key: 'maxBarWidth',
                        type: 'number-input',
                        label: '宽度',
                        value: config?.maxBarWidth,
                        config: {
                            min: 1,
                            max: 100,
                        }
                    },
                    {
                        key: 'barStyle',
                        children: [
                            {
                                key: 'radius',
                                type: 'number-input',
                                label: '圆角',
                                value: (config?.barStyle as any)?.radius,
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
                        key: 'color',
                        label: '颜色',
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
        ],
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    )
}


export const AntdBarFieldMapping: React.FC<ConfigType<AntdCommonBarController>> = ({controller}) => {
    const config = controller.getConfig()!.style;
    const {data, xField, yField, seriesField} = config!;
    const options: ISelectOption[] = [];
    if (data && data.length >= 1) {
        const dataObj = data[0];
        Object.keys(dataObj).forEach(key => options.push({label: key, value: key}))
    }

    const fieldChange = (fieldChangeData: FieldChangeData) => {
        controller.update(fieldChangeData.dataFragment);
    }

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

    return (
        <div style={{padding: 10}}><DatavisoolGUI schema={schema} onFieldChange={fieldChange}/></div>
    )
}
