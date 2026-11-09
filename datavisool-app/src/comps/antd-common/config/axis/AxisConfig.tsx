/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Axis} from "@antv/g2plot";
import {cloneDeep, isEqual, merge} from "lodash";
import {FieldChangeData, DatavisoolGUI, DatavisoolGUIUtil, type Control} from "@datavisool/ui";
import {ShapeAttrs} from "@antv/g-base";
import {useEffect, useRef, useState} from "react";
import G2ColorUtil from "@/comps/antd-common/util/G2ColorUtil.ts";


interface AxisConfigProps {
    config?: Axis;
    onChange: (data?: Axis) => void;
    title?: string;
}


export const AxisConfig = (props: AxisConfigProps) => {
    const {config, onChange, title} = props;
    const [axisConfig, setAxisConfig] = useState<Axis | undefined>(() => cloneDeep(config));
    const {grid, line, label, title: _title, tickLine, subTickLine} = axisConfig || {};
    const enableRef = useRef<boolean>(!!(grid || line || label || _title || tickLine || subTickLine));
    const defaultData: Axis = {
        label: {
            style: {
                fill: "#00FFEAFF"
            }
        },
        line: {
            style: {
                stroke: "#00dbffff",
                lineWidth: 1
            }
        },
    }
    const emptyData: Axis = {
        grid: null,
        line: null,
        title: null,
        label: null,
        tickLine: null,
        subTickLine: null,
    }
    const [, setCount] = useState(0);

    useEffect(() => {
        const nextConfig = cloneDeep(config);
        setAxisConfig(nextConfig);
        const {grid, line, label, title, tickLine, subTickLine} = nextConfig || {};
        enableRef.current = !!(grid || line || label || title || tickLine || subTickLine);
    }, [config]);

    const applyAxisChange = (patch: Axis) => {
        setAxisConfig((prev) => merge(cloneDeep(prev ?? {}), cloneDeep(patch)) as Axis);
        onChange(patch);
    }

    const labelData = (axisConfig as any)?.label;
    const titleData = (axisConfig as any)?.title;
    const lineData = (axisConfig as any)?.line;
    const gridLineData = (axisConfig as any)?.grid;
    const tickLineData = (axisConfig as any)?.tickLine;
    const subTickLineData = (axisConfig as any)?.subTickLine;

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {id, data, dataFragment, reRender, dataKeyPath} = fieldChangeData;
        switch (id) {
            case 'showAxis':
                if (data) {
                    const nextData = isEqual(axisConfig, emptyData) ? defaultData : (axisConfig ?? defaultData);
                    setAxisConfig(cloneDeep(nextData));
                    onChange(nextData);
                } else {
                    setAxisConfig(cloneDeep(emptyData));
                    onChange(emptyData);
                }
                enableRef.current = !!data;
                break;
            case 'titleSwitch':
                if (data) applyAxisChange({title: {text: '标题', offset: 0, style: {fill: '#d2d2d2', fontSize: 12}}});
                else applyAxisChange({title: null});
                break;
            case 'lineSwitch':
                if (data) applyAxisChange({line: {style: {stroke: '#595959', lineWidth: 1}}});
                else applyAxisChange({line: null});
                break;
            case 'gridLineSwitch':
                if (data) {
                    const defaultConfig = {
                        alignTick: true,
                        line: {style: {stroke: '#5c5c5c', lineWidth: 1} as ShapeAttrs, type: 'line'}
                    }
                    applyAxisChange({grid: defaultConfig});
                } else {
                    applyAxisChange({grid: null});
                }
                break;
            case 'subTickLineSwitch':
                if (data) {
                    const defaultConfig = {
                        count: 5,
                        length: 1,
                        style: {stroke: '#6e6e6e', lineWidth: 1} as ShapeAttrs
                    };
                    applyAxisChange({subTickLine: defaultConfig});
                } else {
                    applyAxisChange({subTickLine: null});
                }
                break;
            case 'tickLineSwitch':
                if (data) {
                    const defaultConfig = {
                        alignTick: true,
                        length: 1,
                        style: {stroke: '#6e6e6e', lineWidth: 1} as ShapeAttrs
                    };
                    applyAxisChange({tickLine: defaultConfig});
                } else {
                    applyAxisChange({tickLine: null});
                }
                break;
            case 'colorConvert': {
                //颜色转换
                const convertedColor = DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, G2ColorUtil.parseCssToG2Color(data as string));
                applyAxisChange(convertedColor);
                break;
            }
            default:
                applyAxisChange(dataFragment);
        }
        if (reRender)
            setCount((current) => current + 1);
    }


    const schema: Control[] = [
        {
            type: 'accordion',
            label: title,
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
                                            id: 'showAxis',
                                            key: 'showAxis',
                                            type: 'switch',
                                            label: '显示',
                                            reRender: true,
                                            value: enableRef.current,
                                        },
                                        {
                                            rules: "{showAxis} === 'true'",
                                            key: 'position',
                                            type: 'radio',
                                            label: '位置',
                                            value: (axisConfig as any)?.position,
                                            config: {
                                                options: [
                                                    {label: '左', value: 'left'},
                                                    {label: '右', value: 'right'},
                                                    {label: '上', value: 'top'},
                                                    {label: '下', value: 'bottom'},
                                                ]
                                            }
                                        },
                                        {
                                            key: 'tickCount',
                                            label: '分割',
                                            type: 'number-input',
                                            value: (axisConfig as any)?.tickCount || 5,
                                            config: {
                                                min: 1,
                                            }
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            rules: `${enableRef.current}`,
                            children: [
                                {
                                    key: 'label',
                                    type: 'sub-accordion',
                                    label: '文本',
                                    children: [
                                        {
                                            type: 'grid',
                                            children: [
                                                {
                                                    key: 'rotate',
                                                    type: 'number-input',
                                                    label: '角度',
                                                    value: labelData?.rotate || 0,
                                                    config: {
                                                        min: 0,
                                                        step: 0.1,
                                                        max: 360,
                                                    }
                                                },
                                                {
                                                    key: 'offset',
                                                    type: 'number-input',
                                                    label: '偏移',
                                                    value: labelData?.offset || 0,
                                                },
                                                {
                                                    key: 'style',
                                                    children: [
                                                        {
                                                            key: 'fontSize',
                                                            type: 'number-input',
                                                            label: '字号',
                                                            value: (labelData?.style as ShapeAttrs)?.fontSize || 12,
                                                            config: {
                                                                min: 1,
                                                                max: 50,
                                                            }
                                                        },
                                                        {
                                                            key: 'fill',
                                                            type: 'color-picker',
                                                            label: '颜色',
                                                            value: (labelData?.style as ShapeAttrs)?.fill || '#1c1c1c',
                                                            config: {
                                                                showText: true,
                                                            }
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    key: 'title',
                                    type: 'sub-accordion',
                                    label: '标题',
                                    children: [
                                        {
                                            type: 'grid',
                                            children: [
                                                {
                                                    key: 'titleSwitch',
                                                    id: 'titleSwitch',
                                                    type: 'switch',
                                                    label: '开启',
                                                    reRender: true,
                                                    value: !!titleData,
                                                },
                                                {
                                                    rules: "{titleSwitch} === 'true'",
                                                    children: [
                                                        {
                                                            key: 'position',
                                                            type: 'select',
                                                            label: '位置',
                                                            value: titleData?.position || 'center',
                                                            config: {
                                                                options: [
                                                                    {value: 'start', label: '前'},
                                                                    {value: 'center', label: '中'},
                                                                    {value: 'end', label: '后'}]
                                                            }
                                                        },
                                                        {
                                                            key: 'text',
                                                            type: 'input',
                                                            label: '内容',
                                                            value: titleData?.text || '标题',
                                                        },
                                                        {
                                                            key: 'offset',
                                                            type: 'number-input',
                                                            label: '偏移',
                                                            value: titleData?.offset || 0,
                                                        },
                                                        {
                                                            key: 'style',
                                                            children: [
                                                                {
                                                                    key: 'fontSize',
                                                                    type: 'number-input',
                                                                    label: '字号',
                                                                    value: 12,
                                                                    config: {
                                                                        min: 1,
                                                                        max: 50,
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
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    key: 'line',
                                    type: 'sub-accordion',
                                    label: '轴线',
                                    children: [
                                        {
                                            type: 'grid',
                                            children: [
                                                {
                                                    key: 'lineSwitch',
                                                    id: 'lineSwitch',
                                                    type: 'switch',
                                                    label: '开启',
                                                    reRender: true,
                                                    value: !!lineData,
                                                },
                                                {
                                                    key: 'style',
                                                    rules: "{lineSwitch} === 'true'",
                                                    children: [
                                                        {
                                                            key: 'lineWidth',
                                                            type: 'number-input',
                                                            label: '宽度',
                                                            value: lineData?.style?.lineWidth || 1,
                                                            config: {
                                                                min: 0,
                                                                max: 10,
                                                            }
                                                        },
                                                        {
                                                            id: "colorConvert",
                                                            key: 'stroke',
                                                            type: 'color-picker',
                                                            label: '颜色',
                                                            value: lineData?.style?.stroke || '#595959',
                                                            config: {
                                                                showText: true,
                                                                modes: ['single', "radial", "linear"]
                                                            }
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    key: 'grid',
                                    type: 'sub-accordion',
                                    label: '网格线',
                                    children: [
                                        {
                                            type: 'grid',
                                            children: [
                                                {
                                                    key: 'gridLineSwitch',
                                                    id: 'gridLineSwitch',
                                                    type: 'switch',
                                                    label: '开启',
                                                    reRender: true,
                                                    value: !!gridLineData,
                                                },
                                                {
                                                    rules: "{gridLineSwitch} === 'true'",
                                                    key: 'alignTick',
                                                    type: 'switch',
                                                    label: '对齐',
                                                    value: (gridLineData as any)?.alignTick,
                                                },
                                                {
                                                    rules: "{gridLineSwitch} === 'true'",
                                                    key: 'line',
                                                    children: [
                                                        {
                                                            key: 'style',
                                                            children: [
                                                                {
                                                                    key: 'lineWidth',
                                                                    type: 'number-input',
                                                                    label: '宽度',
                                                                    value: (gridLineData?.line?.style as ShapeAttrs)?.lineWidth,
                                                                    config: {
                                                                        min: 0,
                                                                    }
                                                                },
                                                                {
                                                                    id: 'colorConvert',
                                                                    key: 'stroke',
                                                                    type: 'color-picker',
                                                                    label: '颜色',
                                                                    value: (gridLineData?.line?.style as ShapeAttrs)?.stroke,
                                                                    config: {
                                                                        showText: true,
                                                                        modes: ['single', "radial", "linear"]
                                                                    }
                                                                }
                                                            ]
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    key: 'tickLine',
                                    type: 'sub-accordion',
                                    label: '刻度线',
                                    children: [
                                        {
                                            type: 'grid',
                                            children: [
                                                {
                                                    key: 'tickLineSwitch',
                                                    id: 'tickLineSwitch',
                                                    type: 'switch',
                                                    label: '开启',
                                                    reRender: true,
                                                    value: !!tickLineData,
                                                },
                                                {
                                                    key: 'alignTick',
                                                    rules: "{tickLineSwitch}==='true'",
                                                    type: 'switch',
                                                    label: '对齐',
                                                    value: (tickLineData as any)?.alignTick,
                                                },
                                                {
                                                    key: 'length',
                                                    rules: "{tickLineSwitch}==='true'",
                                                    type: 'number-input',
                                                    label: '长度',
                                                    value: (tickLineData as any)?.length,
                                                    config: {
                                                        min: 0,
                                                        max: 10,
                                                    }
                                                },
                                                {
                                                    key: 'style',
                                                    rules: "{tickLineSwitch}==='true'",
                                                    children: [
                                                        {
                                                            key: 'lineWidth',
                                                            type: 'number-input',
                                                            label: '宽度',
                                                            value: (tickLineData?.style as ShapeAttrs)?.lineWidth,
                                                            config: {
                                                                min: 0,
                                                                max: 10,
                                                            }
                                                        },
                                                        {
                                                            id: 'colorConvert',
                                                            key: 'stroke',
                                                            type: 'color-picker',
                                                            label: '颜色',
                                                            value: (tickLineData?.style as ShapeAttrs)?.stroke,
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
                                    key: 'subTickLine',
                                    type: 'sub-accordion',
                                    label: '子刻度',
                                    children: [
                                        {
                                            type: 'grid',
                                            children: [
                                                {
                                                    key: 'subTickLineSwitch',
                                                    id: 'subTickLineSwitch',
                                                    type: 'switch',
                                                    reRender: true,
                                                    label: '开启',
                                                    value: !!subTickLineData,
                                                },
                                                {
                                                    rules: "{subTickLineSwitch}==='true'",
                                                    key: 'count',
                                                    type: 'number-input',
                                                    label: '数量',
                                                    value: subTickLineData?.count,
                                                    config: {
                                                        min: 0,
                                                        max: 100,
                                                    }
                                                },
                                                {
                                                    rules: "{subTickLineSwitch}==='true'",
                                                    key: 'length',
                                                    type: 'number-input',
                                                    label: '长度',
                                                    value: subTickLineData?.length,
                                                    config: {
                                                        min: 0,
                                                        max: 10,
                                                    }
                                                },
                                                {
                                                    rules: "{subTickLineSwitch}==='true'",
                                                    key: 'style',
                                                    children: [
                                                        {
                                                            key: 'lineWidth',
                                                            type: 'number-input',
                                                            label: '宽度',
                                                            value: (subTickLineData?.style as ShapeAttrs)?.lineWidth,
                                                            config: {
                                                                min: 0,
                                                                max: 10,
                                                            }
                                                        },
                                                        {
                                                            id: 'colorConvert',
                                                            key: 'stroke',
                                                            type: 'color-picker',
                                                            label: '颜色',
                                                            value: (subTickLineData?.style as ShapeAttrs)?.stroke,
                                                            config: {
                                                                showText: true,
                                                                modes: ['single', 'linear', 'radial'],
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
                    ]
                }
            ]
        }
    ]

    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    )
}

export default AxisConfig;
