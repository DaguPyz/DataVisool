/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Component, useState} from 'react';
import {WritableRoseOptions} from "@/comps/antd-common/types";
import AntdCommonRoseController from "@/comps/antd-common/rose/AntdCommonRoseController";
import {RingProgressOptions, StatisticText} from "@antv/g2plot";
import {FieldChangeData, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import {ShapeAttrs} from "@antv/g-base";
import {ObjectUtil} from "@datavisool/sdk";
import {ConfigType} from "@/designer/right/ConfigContent";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";

export class AntdRingProgressStyleConfig extends Component<ConfigType> {

    ringProgressGraphicsChange = (config: WritableRoseOptions) => {
        const controller = this.props.controller as AntdCommonRoseController;
        controller.update({style: config});
    }


    render() {
        const {controller} = this.props;
        const config: RingProgressOptions = controller.getConfig().style as RingProgressOptions
        return (
            <AntdRingProgressGraphicsConfig config={config}
                                            onChange={this.ringProgressGraphicsChange}/>
        );
    }
}


export interface AntdRingProgressGraphicsConfigProps {
    config: any;
    onChange: (config: any) => void;
}

export const AntdRingProgressGraphicsConfig: React.FC<AntdRingProgressGraphicsConfigProps> = ({config, onChange}) => {

    const [_config, setConfig] = useState(config);

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataKeyPath, dataFragment} = fieldChangeData;
        if (id === "titleSwitch") {
            if (data) {
                const defaultTitleConfig = {
                    statistic: {
                        title: {
                            style: {fontSize: 12, color: '#fff'},
                            content: 'text'
                        }
                    }
                };
                onChange(defaultTitleConfig);
                setConfig({...ObjectUtil.merge(_config, defaultTitleConfig)});
            } else {
                onChange({statistic: {title: false}});
                setConfig({...ObjectUtil.merge(_config, {statistic: {title: false}})});
            }
        } else if (id === "contentSwitch") {
            if (data) {
                const defaultContentConfig = {
                    statistic: {
                        content: {
                            style: {fontSize: 12, color: '#fff'},
                            content: 'content'
                        }
                    }
                };
                onChange(defaultContentConfig);
                setConfig({...ObjectUtil.merge(_config, defaultContentConfig)});
            } else {
                onChange({statistic: {content: false}});
                setConfig({...ObjectUtil.merge(_config, {statistic: {content: false}})});
            }
        } else if (id === 'colorConvert') {
            if (Array.isArray(data)) {
                const newData = data.map(color => G2ColorUtil.parseCssToG2Color(color));
                onChange(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            } else {
                const newData = G2ColorUtil.parseCssToG2Color(data as string);
                onChange(DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, newData));
            }
        } else {
            onChange(dataFragment);
        }
    }

    const schema: Control = {
        children: [
            {
                type: 'accordion',
                label: '图形',
                children: [
                    {
                        type: 'grid',
                        children: [
                            {
                                key: 'radius',
                                type: 'number-input',
                                label: '外径',
                                value: _config?.radius || 0.8,
                                config: {
                                    min: 0,
                                    max: 1,
                                    step: 0.01
                                }
                            },
                            {
                                key: 'innerRadius',
                                type: 'number-input',
                                label: '内径',
                                value: _config?.innerRadius || 0.75,
                                config: {
                                    min: 0,
                                    max: 1,
                                    step: 0.01
                                }
                            },
                            {
                                key: 'progressStyle',
                                children: [
                                    {
                                        key: 'lineWidth',
                                        type: 'number-input',
                                        label: '描边',
                                        value: (_config.progressStyle as ShapeAttrs)?.lineWidth || 1,
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
                                        value: G2ColorUtil.parseG2ToCssColor((_config.progressStyle as ShapeAttrs)?.stroke ?? "#fff"),
                                        config: {
                                            showText: true,
                                            modes: ['single', 'linear', 'radial']
                                        }
                                    },
                                ]
                            },
                            {
                                id: 'colorConvert',
                                type: 'color-mode',
                                key: 'color',
                                label: '颜色',
                                value: Array.isArray(_config?.color) ?
                                    _config?.color?.map((color: string) => G2ColorUtil.parseG2ToCssColor(color)) :
                                    G2ColorUtil.parseG2ToCssColor(_config?.color as string) || '#5B8FF9',
                                config: {
                                    modes: ['single', 'linear', 'radial']
                                }
                            },
                        ]
                    }
                ]
            },
            {
                key: 'statistic',
                type: 'accordion',
                label: '标题',
                children: [
                    {
                        key: 'title',
                        type: 'grid',
                        children: [
                            {
                                id: 'titleSwitch',
                                key: 'titleSwitch',
                                type: 'switch',
                                label: '开启',
                                value: !!_config.statistic?.title,
                            },
                            {
                                rules: "{titleSwitch} === 'true'",
                                children: [
                                    {
                                        key: 'content',
                                        type: 'input',
                                        label: '内容',
                                        value: (_config.statistic?.title as StatisticText)?.content,
                                    },
                                    {
                                        key: 'style',
                                        children: [
                                            {
                                                key: 'fontSize',
                                                type: 'number-input',
                                                label: '字号',
                                                value: ((_config.statistic?.title as StatisticText)?.style as ShapeAttrs)?.fontSize || 12,
                                                config: {
                                                    min: 0,
                                                    max: 100,
                                                }
                                            },
                                            {
                                                key: 'fontWeight',
                                                type: 'number-input',
                                                label: '加粗',
                                                value: ((_config.statistic?.title as StatisticText)?.style as ShapeAttrs)?.fontWeight || 500,
                                                config: {
                                                    min: 100,
                                                    max: 900,
                                                    step: 100
                                                }
                                            },
                                            {
                                                key: 'color',
                                                type: 'color-picker',
                                                label: '颜色',
                                                value: ((_config.statistic?.title as StatisticText)?.style as ShapeAttrs)?.color,
                                                config: {
                                                    showText: true,
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        key: 'offsetX',
                                        type: 'number-input',
                                        label: 'x偏移',
                                        value: (_config.statistic?.title as StatisticText)?.offsetX || 0,
                                    },
                                    {
                                        key: 'offsetY',
                                        type: 'number-input',
                                        label: 'y偏移',
                                        value: (_config.statistic?.title as StatisticText)?.offsetY || 0,
                                    },
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                key: 'statistic',
                type: 'accordion',
                label: '内容',
                children: [
                    {
                        key: 'content',
                        type: 'grid',
                        children: [
                            {
                                id: 'contentSwitch',
                                key: 'contentSwitch',
                                type: 'switch',
                                label: '开启',
                                value: !!_config.statistic?.content,
                            },
                            {
                                rules: "{contentSwitch} === 'true'",
                                children: [
                                    {
                                        key: 'content',
                                        type: 'input',
                                        label: '内容',
                                        value: (_config.statistic?.content as StatisticText)?.content,
                                    },
                                    {
                                        key: 'style',
                                        children: [
                                            {
                                                key: 'fontSize',
                                                type: 'number-input',
                                                label: '字号',
                                                value: ((_config.statistic?.content as StatisticText)?.style as ShapeAttrs)?.fontSize || 12,
                                                config: {
                                                    min: 0,
                                                    max: 100,
                                                }
                                            },
                                            {
                                                key: 'fontWeight',
                                                type: 'number-input',
                                                label: '加粗',
                                                value: ((_config.statistic?.content as StatisticText)?.style as ShapeAttrs)?.fontWeight || 500,
                                                config: {
                                                    min: 100,
                                                    max: 900,
                                                    step: 100
                                                }
                                            },
                                            {
                                                key: 'color',
                                                type: 'color-picker',
                                                label: '颜色',
                                                value: ((_config.statistic?.content as StatisticText)?.style as ShapeAttrs)?.color,
                                                config: {
                                                    showText: true,
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        key: 'offsetX',
                                        type: 'number-input',
                                        label: 'x偏移',
                                        value: (_config.statistic?.content as StatisticText)?.offsetX || 0,
                                    },
                                    {
                                        key: 'offsetY',
                                        type: 'number-input',
                                        label: 'y偏移',
                                        value: (_config.statistic?.content as StatisticText)?.offsetY || 0,
                                    },
                                ]
                            }
                        ]
                    }
                ]
            },
        ]
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    );
}
