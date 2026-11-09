/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ForwardedRef, forwardRef, useImperativeHandle, useRef, useState} from 'react';
import {ComponentBaseProps} from "@datavisool/sdk/types";
import './DateTimePickerComponent.less';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isoWeek from 'dayjs/plugin/isoWeek';
import 'dayjs/locale/zh-cn';

dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);
dayjs.locale('zh-cn');

// 组件样式接口定义
export interface DateTimePickerComponentStyle {
    // 日期时间选择器特有样式
    pickerType?: 'date' | 'week' | 'month' | 'quarter' | 'year' | 'datetime' | 'range';
    placeholder?: string;
    showTime?: boolean;
    format?: string;
    allowClear?: boolean;
    disabled?: boolean;
    showNow?: boolean;

    token?: {
        lineWidth: number;
        fontSize: number;
        colorTextHeading: string;
        colorPrimary: string;
        colorSplit: string;
        colorText: string;
        colorBorder: string;
        colorBgContainerDisabled: string;          // 禁用状态的容器背景
        colorTextPlaceholder: string;              // 占位符文字色
        colorIcon: string;                         // 图标颜色
        colorIconHover: string;                    // 图标悬停颜色
        borderRadius: number;                              // 卡片圆角
        lineType: string;
        fontFamily: string;                         // 无衬线字体
        fontWeightStrong: number;
        padding: number;                                  // 次轴间距
        colorBgElevated: string;
    },
    components?: {
        colorBgContainer: string;                     // container 背景
        colorBorder: string;
        colorText: string;
        colorPrimary: string;                         // 主色
        colorTextHeading: string;                     // 和 colorText 一致
        colorSplit: string;
        hoverBorderColor: string;                     // 输入 hover
        activeBorderColor: string;                    // 输入 active
        hoverBg: string;                              // 输入 hover 背景（亮度提升）
        activeBg: string;                             // 输入 active 背景
        activeShadow: string;  // active 阴影
        cellActiveWithRangeBg: string;
        cellHoverBg: string;
        cellHoverWithRangeBg: string;
        cellHeight: number;
        cellWidth: number;
        withoutTimeCellHeight: number;
        textHeight: number;
        timeCellHeight: number;
        timeColumnHeight: number;
        timeColumnWidth: number;
        inputFontSize: number;
        paddingBlock: number;
        paddingInline: number;
    },
}

// 组件属性接口定义
export interface DateTimePickerComponentProps extends ComponentBaseProps {
    style?: DateTimePickerComponentStyle;
}

// 组件引用接口定义
export interface DateTimePickerComponentRef {
    updateConfig: (newConfig: DateTimePickerComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    getValue: () => string | [string, string] | undefined;
    setValue: (value: string | [string, string]) => void;
}

// 日期时间选择器组件实现
const DateTimePickerComponent = forwardRef((
            props: DateTimePickerComponentProps,
            ref: ForwardedRef<DateTimePickerComponentRef>
        ) => {
            const [config, setConfig] = useState<DateTimePickerComponentProps>({...props});
            const {style, data} = config;
            // eslint-disable-next-line @typescript-eslint/ban-types
            const eventHandlerMap = useRef<Record<string, Function>>({});
            const containerRef = useRef<HTMLDivElement>(null);

            const getCurrentValue = () => {
                if (!data || !data?.value)
                    return undefined;

                return data.value;
            };

            // 暴露组件方法给外部调用
            useImperativeHandle(ref, () => ({
                updateConfig: (newConfig) => setConfig({...newConfig}),
                setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
                getValue: () => data?.value,
                setValue: (newValue) => {
                    setConfig(prev => ({
                        ...prev,
                        data: {value: newValue}
                    }));
                    if ('valueChange' in eventHandlerMap.current) {
                        eventHandlerMap.current['valueChange'](newValue);
                    }
                },
            }));

            const emitValue = (formattedValue: string | [string, string]) => {
                setConfig(prev => ({
                    ...prev,
                    data: {value: formattedValue}
                }));

                if ('valueChange' in eventHandlerMap.current) {
                    eventHandlerMap.current['valueChange'](formattedValue);
                }

                if ('confirm' in eventHandlerMap.current) {
                    eventHandlerMap.current['confirm'](formattedValue);
                }
            };

            const pickerType = style?.pickerType || 'date';
            const hasTime = pickerType === 'datetime' ||
                ((pickerType === 'date' || pickerType === 'range') && style?.showTime === true);
            const getInputType = () => {
                if (hasTime)
                    return 'datetime-local';
                if (pickerType === 'week')
                    return 'week';
                if (pickerType === 'month' || pickerType === 'quarter' || pickerType === 'year')
                    return 'month';
                return 'date';
            };

            const defaultFormat = () => {
                if (hasTime)
                    return 'YYYY-MM-DD HH:mm:ss';
                if (pickerType === 'week')
                    return 'YYYY-[W]WW';
                if (pickerType === 'month')
                    return 'YYYY-MM';
                if (pickerType === 'year')
                    return 'YYYY';
                return 'YYYY-MM-DD';
            };

            const toNativeValue = (value?: string) => {
                if (!value)
                    return '';
                if (pickerType === 'week' && /^\d{4}-W\d{2}$/.test(value))
                    return value;
                if (pickerType === 'year' && /^\d{4}$/.test(value))
                    return `${value}-01`;
                const quarter = pickerType === 'quarter' && /^(\d{4})-Q([1-4])$/.exec(value);
                if (quarter)
                    return `${quarter[1]}-${String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, '0')}`;

                const formattedDate = style?.format ? dayjs(value, style.format, true) : null;
                const dateValue = formattedDate?.isValid() ? formattedDate : dayjs(value);
                if (!dateValue.isValid())
                    return value;
                if (hasTime)
                    return dateValue.format('YYYY-MM-DDTHH:mm:ss');
                if (pickerType === 'week')
                    return `${dateValue.isoWeekYear()}-W${String(dateValue.isoWeek()).padStart(2, '0')}`;
                if (pickerType === 'month' || pickerType === 'quarter' || pickerType === 'year')
                    return dateValue.format('YYYY-MM');
                return dateValue.format('YYYY-MM-DD');
            };

            const toFormattedValue = (value: string) => {
                if (!value)
                    return '';
                if (pickerType === 'week')
                    return value;

                const dateValue = dayjs(value);
                if (!dateValue.isValid())
                    return value;
                if (pickerType === 'quarter' && !style?.format) {
                    const quarter = Math.floor(dateValue.month() / 3) + 1;
                    return `${dateValue.format('YYYY')}-Q${quarter}`;
                }
                return dateValue.format(style?.format || defaultFormat());
            };

            // 处理打开事件
            const handleOpenChange = (open: boolean) => {
                if (open && 'open' in eventHandlerMap.current) {
                    eventHandlerMap.current['open']();
                }
                if (!open && 'close' in eventHandlerMap.current) {
                    eventHandlerMap.current['close']();
                }
            };

            const inputStyle = {
                width: '100%',
                height: '100%',
                boxSizing: 'border-box' as const,
                background: style?.components?.colorBgContainer,
                color: style?.token?.colorText,
                borderColor: style?.components?.colorBorder ?? style?.token?.colorBorder,
                borderStyle: style?.token?.lineType,
                borderWidth: style?.token?.lineWidth,
                borderRadius: style?.token?.borderRadius,
                fontFamily: style?.token?.fontFamily,
                fontSize: style?.components?.inputFontSize ?? style?.token?.fontSize,
                padding: `${style?.components?.paddingBlock ?? 4}px ${style?.components?.paddingInline ?? 11}px`,
            };

            const renderPicker = () => {
                if (pickerType === 'range') {
                    const rangeValue = Array.isArray(getCurrentValue()) ? getCurrentValue() as [string, string] : ['', ''];
                    const updateRange = (index: 0 | 1, nextValue: string) => {
                        const nextRange: [string, string] = [...rangeValue] as [string, string];
                        nextRange[index] = toFormattedValue(nextValue);
                        emitValue(nextRange);
                    };

                    return (
                        <div className="date-time-picker-range">
                            <input
                                type={getInputType()}
                                step={hasTime ? 1 : undefined}
                                value={toNativeValue(rangeValue[0])}
                                placeholder={style?.placeholder}
                                disabled={style?.disabled}
                                style={inputStyle}
                                onFocus={() => handleOpenChange(true)}
                                onBlur={() => handleOpenChange(false)}
                                onChange={(event) => updateRange(0, event.target.value)}
                            />
                            <span className="date-time-picker-separator">-</span>
                            <input
                                type={getInputType()}
                                step={hasTime ? 1 : undefined}
                                value={toNativeValue(rangeValue[1])}
                                placeholder={style?.placeholder}
                                disabled={style?.disabled}
                                style={inputStyle}
                                onFocus={() => handleOpenChange(true)}
                                onBlur={() => handleOpenChange(false)}
                                onChange={(event) => updateRange(1, event.target.value)}
                            />
                        </div>
                    );
                }

                const value = typeof getCurrentValue() === 'string' ? getCurrentValue() as string : '';

                return (
                    <div className="date-time-picker-input-wrap">
                        <input
                            type={getInputType()}
                            step={hasTime ? 1 : undefined}
                            value={toNativeValue(value)}
                            placeholder={style?.placeholder}
                            disabled={style?.disabled}
                            style={inputStyle}
                            onFocus={() => handleOpenChange(true)}
                            onBlur={() => handleOpenChange(false)}
                            onChange={(event) => emitValue(toFormattedValue(event.target.value))}
                        />
                        {style?.allowClear && value ? (
                            <button type="button" className="date-time-picker-clear" onClick={() => emitValue('')}>
                                ×
                            </button>
                        ) : null}
                    </div>
                );
            };

            return (
                <div className="date-time-picker-component" ref={containerRef}>
                    {renderPicker()}
                </div>
            );
        }
    )
;

export default DateTimePickerComponent;
