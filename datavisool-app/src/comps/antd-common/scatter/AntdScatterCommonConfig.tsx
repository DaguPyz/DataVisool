/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Component} from 'react';
import {AntdCartesianCoordinateSys} from "@/comps/antd-common/config/AntdFragment.tsx";
import {Scatter, ScatterOptions} from "@antv/g2plot";
import type {AbstractController} from "@datavisool/sdk/core";
import AntdCommonScatterController, {AntdScatterProps} from "./AntdCommonScatterController";
import {WritableScatterOptions} from "@/comps/antd-common/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import {FieldChangeData, Grid, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import AntdCommonUtil from "@/comps/antd-common/AntdCommonUtil";
import {AntdLegend} from "@/comps/antd-common/config/legend/AntdLegend.tsx";
import {ShapeAttrs} from "@antv/g-base";
import {ConfigType} from "@/designer/right/ConfigContent";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";

class AntdScatterCommonStyleConfig extends Component<ConfigType> {
    scatterCoordinateSysChange = (config: ScatterOptions) => {
        const controller = this.props.controller as AntdCommonScatterController;
        controller.update({style: config});
    }

    scatterGraphicsChange = (config: ScatterOptions) => {
        const controller: AbstractController<Scatter, AntdScatterProps> = this.props.controller;
        controller.update({style: config});
    }

    render() {
        const {controller} = this.props;
        const config: ScatterOptions = controller.getConfig().style;
        return (
            <Grid gridGap={'15px'}>
                <AntdCommonScatterGraphics config={config} onChange={this.scatterGraphicsChange}/>
                <AntdLegend controller={controller}/>
                <AntdCartesianCoordinateSys onChange={this.scatterCoordinateSysChange} config={config}/>
            </Grid>
        );
    }
}

export {AntdScatterCommonStyleConfig};


export interface AntdCommonScatterGraphicsProps {
    config?: WritableScatterOptions;

    onChange(config: WritableScatterOptions): void;
}

export const AntdCommonScatterGraphics: React.FC<AntdCommonScatterGraphicsProps> = ({config, onChange}) => {

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataKeyPath, dataFragment} = fieldChangeData;
        if (id === 'sizeRangeMin' || id === 'sizeRangeMax') {
            if (!Array.isArray(config?.size)) return;
            const size: [number, number] = [config.size[0], config.size[1]];
            size[id === 'sizeRangeMin' ? 0 : 1] = data as number;
            onChange({size});
        } else if (id === 'colorConvert') {
            if (Array.isArray(data)) {
                const newData = data.map(color => G2ColorUtil.parseCssToG2Color(color));
                onChange(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            } else {
                const newData = G2ColorUtil.parseCssToG2Color(data as string);
                onChange(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            }
        } else
            onChange(dataFragment);
    }

    const schema: Control = {
        type: 'accordion',
        label: '图形',
        children: [
            {
                type: 'grid',
                children: [
                    ...(Array.isArray(config?.size) ? [
                        {id: 'sizeRangeMin', key: 'sizeRangeMin', type: 'number-input' as const, label: '最小尺寸', value: config.size[0], config: {min: 0, max: 100}},
                        {id: 'sizeRangeMax', key: 'sizeRangeMax', type: 'number-input' as const, label: '最大尺寸', value: config.size[1], config: {min: 0, max: 100}},
                    ] : [{
                        key: 'size',
                        type: 'number-input' as const,
                        label: '尺寸',
                        value: config?.size,
                        config: {min: 0, max: 100},
                    }]),
                    {
                        key: 'shape',
                        type: 'select',
                        label: '形状',
                        value: config?.shape,
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
                        key: 'pointStyle',
                        children: [
                            {
                                key: 'lineWidth',
                                type: 'number-input',
                                label: '线宽',
                                value: (config?.pointStyle as ShapeAttrs)?.lineWidth,
                                config: {
                                    min: 0,
                                    max: 10,
                                }
                            },
                            {
                                id: 'colorConvert',
                                key: 'stroke',
                                type: 'color-picker',
                                label: '描边色',
                                value: G2ColorUtil.parseG2ToCssColor((config?.pointStyle as ShapeAttrs)?.stroke ?? "#fff"),
                                config: {
                                    showText: true,
                                    modes: ['single', 'linear', 'radial']
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
                            G2ColorUtil.parseG2ToCssColor((config?.color as string | undefined) || '#1c1c1c') || '#1c1c1c',
                        config: {
                            modes: ['single', 'linear', 'radial']
                        }
                    },
                ]
            }
        ]
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    )
}

export const AntdScatterFieldMapping: React.FC<ConfigType<AntdBaseDesignerController>> = ({controller}) => {

    const config = controller.getConfig()?.style;

    const options = AntdCommonUtil.getDataFieldOptions(controller);
    const schema: Control = {
        type: 'grid',
        key: 'style',
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
                key: 'colorField',
                type: 'select',
                label: '颜色字段',
                value: config?.colorField,
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
            },
            {
                key: 'sizeField',
                type: 'select',
                label: '尺寸字段',
                value: config?.sizeField,
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
