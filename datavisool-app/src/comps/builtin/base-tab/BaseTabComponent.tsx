/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ForwardedRef, forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {ComponentBaseProps} from "@datavisool/sdk/types";
import './BaseTabComponent.less';

// 选项接口定义
export interface TabOption {
    label: string;
    value: string | number;
    disabled?: boolean;
}

// 组件样式接口定义
export interface TabComponentStyle {
    // 基础字体
    fontFamily?: string;

    // 容器样式
    containerBgColor?: string;
    containerRadius?: number;
    containerBorderWidth?: number;
    containerBorderColor?: string;
    containerPadding?: number; // 内边距
    itemGap?: number; // 间距
    containerShadow?: string;

    // 布局配置
    layout?: 'horizontal' | 'vertical';
    justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
    flexWrap?: boolean;

    // 选项配置
    mode?: 'single' | 'multiple'; // 单选或多选

    // 未选中项样式 (默认)
    itemBgColor?: string;
    itemColor?: string;
    itemRadius?: number;
    itemBorderWidth?: number;
    itemBorderColor?: string;
    itemFontSize?: number;
    itemFontWeight?: number;
    itemHeight?: number;
    itemMinWidth?: number;
    itemPadding?: string; // e.g. "4px 12px"
    itemShadow?: string;

    // 选中项样式
    activeBgColor?: string;
    activeColor?: string;
    activeBorderColor?: string;
    activeFontWeight?: number;
    activeShadow?: string;

    // 悬停样式
    itemHoverBgColor?: string;
    itemHoverColor?: string;
    itemHoverBorderColor?: string;
}

// 组件属性接口定义
export interface TabComponentProps extends ComponentBaseProps {
    style?: TabComponentStyle;
}

// 组件引用接口定义
export interface TabComponentRef {
    updateConfig: (newConfig: TabComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    getOptions: () => TabOption[] | undefined;
    setOptions: (options: TabOption[]) => void;
    changeVisible: (visible: boolean) => void;
}

// 按钮组（选项卡）组件实现
export const BaseTabComponent = forwardRef((
    props: TabComponentProps,
    ref: ForwardedRef<TabComponentRef>
) => {
    const [config, setConfig] = useState<TabComponentProps>({...props});
    const [visible, setVisible] = useState(true);
    const {style, data} = config;
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const containerRef = useRef<HTMLDivElement>(null);

    // 内部状态值管理
    const [options, setOptions] = useState<TabOption[]>(data?.value ?? []);
    const [selected, setSelected] = useState<(string | number)[]>([])

    // 暴露组件方法给外部调用
    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => {
            setConfig({...newConfig});
            updateCustomStyle(newConfig?.style ?? {});
            // 如果配置更新中包含值，也更新内部值
            if (data?.value !== undefined) {
                setOptions(data?.value ?? []);
            }
        },
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        getOptions: () => options,
        setOptions: (newValue) => setOptions(newValue),
        changeVisible: (visible) => setVisible(visible)
    }));

    // 更新自定义 CSS 变量
    const updateCustomStyle = (styleConfig: TabComponentStyle) => {
        if (!containerRef.current) return;

        const setProp = (key: string, value: any) => {
            if (value !== undefined && value !== null) {
                containerRef.current!.style.setProperty(key, value.toString());
            }
        };

        const s = styleConfig;

        // 容器
        setProp('--containerBgColor', s.containerBgColor);
        setProp('--containerRadius', `${s.containerRadius ?? 8}px`);
        setProp('--containerBorderWidth', `${s.containerBorderWidth ?? 0}px`);
        setProp('--containerBorderColor', s.containerBorderColor);
        setProp('--containerPadding', `${s.containerPadding ?? 4}px`);
        setProp('--itemGap', `${s.itemGap ?? 8}px`);
        setProp('--containerShadow', s.containerShadow);
        setProp('--flexDirection', s.layout === 'vertical' ? 'column' : 'row');
        setProp('--justifyContent', s.justifyContent ?? 'flex-start');
        setProp('--flexWrap', s.flexWrap ? 'wrap' : 'nowrap');
        setProp('--fontFamily', s.fontFamily);

        // 默认项
        setProp('--itemBgColor', s.itemBgColor);
        setProp('--itemColor', s.itemColor);
        setProp('--itemRadius', `${s.itemRadius ?? 4}px`);
        setProp('--itemBorderWidth', `${s.itemBorderWidth ?? 1}px`);
        setProp('--itemBorderColor', s.itemBorderColor);
        setProp('--itemFontSize', `${s.itemFontSize ?? 14}px`);
        setProp('--itemFontWeight', s.itemFontWeight);
        setProp('--itemHeight', `${s.itemHeight ?? 32}px`);
        setProp('--itemMinWidth', s.itemMinWidth ? `${s.itemMinWidth}px` : 'auto');
        setProp('--itemPadding', s.itemPadding);
        setProp('--itemShadow', s.itemShadow);

        // 选中项
        setProp('--activeBgColor', s.activeBgColor);
        setProp('--activeColor', s.activeColor);
        setProp('--activeBorderColor', s.activeBorderColor);
        setProp('--activeFontWeight', s.activeFontWeight);
        setProp('--activeShadow', s.activeShadow);

        // 悬停项
        setProp('--itemHoverBgColor', s.itemHoverBgColor);
        setProp('--itemHoverColor', s.itemHoverColor);
        setProp('--itemHoverBorderColor', s.itemHoverBorderColor);
    };

    // 处理值变更逻辑
    const handleValueChange = (newValue: string | number | (string | number)[], triggerEvent = true) => {
        if (triggerEvent) {
            // 触发通用改变事件
            if ('change' in eventHandlerMap.current) {
                eventHandlerMap.current['change']({options, value: newValue});
            }
            // 触发值改变事件
            if ('valueChange' in eventHandlerMap.current) {
                eventHandlerMap.current['valueChange']({options, value: newValue});
            }
        }
    };

    // 处理单个 Tab 点击
    const handleItemClick = (option: TabOption) => {
        if (option.disabled) return;

        const isMultiple = style?.mode === 'multiple';
        const clickedValue = option.value;

        let newSelected: (string | number)[] = [];
        if (isMultiple) {
            newSelected = selected.includes(clickedValue) ? selected.filter(v => v !== clickedValue) : [...selected, clickedValue];
        } else {
            newSelected = selected.includes(clickedValue) ? [] : [clickedValue];
        }

        setSelected(newSelected);
        handleValueChange(isMultiple ? newSelected : clickedValue, true);

        // 触发点击事件
        if ('click' in eventHandlerMap.current) {
            eventHandlerMap.current['click'](option, newSelected);
        }
    };

    // 判断是否选中
    const isActive = (val: string | number) => {
        return selected.includes(val);
    };

    // 初始化样式
    useEffect(() => {
        updateCustomStyle(style ?? {});
    }, []); // 仅挂载时执行一次，后续更新由 updateConfig 接管

    // 生成类名
    const getItemClass = (option: TabOption) => {
        const classes = ['tab-item'];
        if (isActive(option.value)) classes.push('active');
        if (option.disabled) classes.push('disabled');
        return classes.join(' ');
    };

    return visible ? (
            <div className="datavisool-tab-component" ref={containerRef}>
                {((data?.value as TabOption[]) || []).map((option, index) => (
                        <div key={`${option.value}-${index}`}
                             className={getItemClass(option)}
                             onClick={() => handleItemClick(option)}
                             title={option.label}>
                            {option.label}
                        </div>
                    )
                )}
            </div>
        ) :
        null;
});

export default BaseTabComponent;