/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {ForwardedRef, forwardRef, useImperativeHandle, useRef, useState} from 'react';
import {ComponentBaseProps} from "@datavisool/sdk/types";
import './BaseSwitchComponent.less';
import {Switch, type SwitchProps} from '@datavisool/ui';
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController.ts";
import {getController} from "../../../util/ControllerUtil.ts";

// 组件样式接口定义
export interface SwitchComponentStyle {
    token?: {
        colorPrimary?: string;
        colorPrimaryHover?: string;
        colorPrimaryBorder?: string;
        colorText?: string;
        colorTextLightSolid?: string;
        fontSize?: number;
    },
    components?: {
        handleSize?: number;
        trackHeight?: number;
        trackMinWidth?: number;
        trackPadding?: number;
        handleBg?: string;
        colorBgContainer?: string;
    },
    props: {
        size?: 'default' | 'small';
        loading?: boolean;
        disabled?: boolean;
        checkedChildren?: string;
        unCheckedChildren?: string;
    },
    label?: {
        // 标签样式
        content?: string;
        position?: 'left' | 'right';
        color?: string;
        fontSize?: number;
        fontWeight?: number;
        fontFamily?: string;
    }
}

// 组件属性接口定义
export interface SwitchComponentProps extends ComponentBaseProps {
    style?: SwitchComponentStyle;
    // 值相关属性
    value?: boolean;
    defaultValue?: boolean;
    controller?: AbstractDesignerController;
}

// 组件引用接口定义
export interface SwitchComponentRef {
    updateConfig: (newConfig: SwitchComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    getValue: () => boolean | undefined;
    setValue: (value: boolean) => void;
    toggle: () => void;
    changeVisible: (visible: boolean) => void;
}

type SwitchControllerHandle = {
    changeData: (value: boolean, emitValueChange?: boolean) => void;
};

const getConfigValue = (config: SwitchComponentProps): boolean => {
    return Boolean(config.data?.value ?? config.value ?? config.defaultValue ?? false);
};

// 开关组件实现
export const SwitchComponent = forwardRef((
    props: SwitchComponentProps,
    ref: ForwardedRef<SwitchComponentRef>
) => {
    const [config, setConfig] = useState<SwitchComponentProps>({...props});
    const [visible, setVisible] = useState(true);
    const {style} = config;
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const currentValueRef = useRef(getConfigValue(props));

    const getCurrentValue = () => {
        return currentValueRef.current;
    };

    const setCurrentValue = (value: boolean) => {
        currentValueRef.current = value;
        setConfig(prev => ({
            ...prev,
            value,
            data: prev.data ? {...prev.data, value} : prev.data,
        }));
    };

    const getOwningController = () =>
        (props.controller ?? getController(props?.base?.id ?? '')) as SwitchControllerHandle | null | undefined;

    const emitValueChange = (value: boolean) => {
        if ('valueChange' in eventHandlerMap.current)
            eventHandlerMap.current['valueChange'](value);
    };

    // 暴露组件方法给外部调用
    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => {
            currentValueRef.current = getConfigValue(newConfig);
            setConfig({...newConfig});
        },
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        getValue: getCurrentValue,
        setValue: (newValue) => {
            setCurrentValue(newValue);
            emitValueChange(newValue);
        },
        toggle: () => {
            const newValue = !getCurrentValue();
            setCurrentValue(newValue);
            getOwningController()?.changeData(newValue, false);
            if ('toggle' in eventHandlerMap.current) {
                eventHandlerMap.current['toggle'](newValue);
            }
            emitValueChange(newValue);
        },
        changeVisible: (visible) => setVisible(visible)
    }));

    // 处理开关状态变化
    const handleChange = (checked: boolean) => {
        if (getCurrentValue() === checked) return;
        setCurrentValue(checked);
        getOwningController()?.changeData(checked, false);

        // Keep valueChange at the controller synchronization point in the existing event order.
        emitValueChange(checked);

        // 触发值改变事件
        if ('change' in eventHandlerMap.current)
            eventHandlerMap.current['change'](checked);

        // 触发点击事件
        if ('click' in eventHandlerMap.current)
            eventHandlerMap.current['click'](checked);

        // 用户通过开关控件改变状态时也触发切换事件。
        if ('toggle' in eventHandlerMap.current)
            eventHandlerMap.current['toggle'](checked);

        // 根据状态触发开/关事件
        if (checked && 'on' in eventHandlerMap.current)
            eventHandlerMap.current['on']();
        if (!checked && 'off' in eventHandlerMap.current)
            eventHandlerMap.current['off']();
    };

    const switchProps: SwitchProps = {
        value: getCurrentValue(),
        onChange: handleChange,
        disabled: style?.props?.disabled,
        switchSize: style?.props?.size === 'small' ? 'sm' : 'md',
        checkedText: style?.props?.checkedChildren,
        uncheckedText: style?.props?.unCheckedChildren,
        controlStyle: {
            background: style?.components?.colorBgContainer,
            color: style?.token?.colorText,
            fontSize: style?.token?.fontSize,
        },
    };

    // 构建自定义样式对象
    const customStyles = {
        // 开关容器样式
        containerStyle: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            height: '100%',
        },
        // 标签样式
        labelStyle: {
            color: style?.label?.color || '#ffffff',
            fontSize: style?.label?.fontSize || 14,
            fontWeight: style?.label?.fontWeight || 400,
            fontFamily: style?.label?.fontFamily || 'inherit',
            cursor: style?.props?.disabled ? 'not-allowed' : 'pointer',
        }
    };
    console.log('重新渲染', props)
    const {label} = (style ?? {});
    return visible ? (
        <div className="switch-component" ref={containerRef}>
            <div style={customStyles.containerStyle}>
                {label?.position !== 'right' && style?.label && (
                    <span style={customStyles.labelStyle}
                          onClick={() => !style?.props?.disabled && handleChange(!getCurrentValue())}>
                            {label?.content}
                        </span>
                )}
                <Switch  {...switchProps} />
                {label?.position === 'right' && style?.label && (
                    <span style={customStyles.labelStyle}
                          onClick={() => !style?.props?.disabled && handleChange(!getCurrentValue())}>
                             {label?.content}
                        </span>
                )}
            </div>
        </div>
    ) : null;
});

export default SwitchComponent;
