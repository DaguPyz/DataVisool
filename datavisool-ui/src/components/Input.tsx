/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {IconX} from './Icon';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

export interface InputProps extends UIContainerProps {
    value?: string;
    defaultValue?: string;
    onChange?: (data: string) => void;
    placeholder?: string;
    type?: string;
    disabled?: boolean;
    readOnly?: boolean;
    inputSize?: 'sm' | 'md' | 'lg';
    status?: 'default' | 'success' | 'warning' | 'error';
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
    allowClear?: boolean;
    onClear?: () => void;
    onPressEnter?: React.KeyboardEventHandler<HTMLInputElement>;
    id?: string;
    name?: string;
    autoComplete?: string;
    autoFocus?: boolean;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    required?: boolean;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
    onFocus?: React.FocusEventHandler<HTMLInputElement>;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    onKeyUp?: React.KeyboardEventHandler<HTMLInputElement>;
}

export function Input(props: InputProps) {
    const t = useDataVisoolUITranslate();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue = '',
        onChange,
        placeholder,
        type = 'text',
        disabled,
        readOnly,
        inputSize = 'md',
        status = 'default',
        prefix,
        suffix,
        allowClear,
        onClear,
        onPressEnter,
        id,
        name,
        autoComplete,
        autoFocus,
        inputMode,
        maxLength,
        minLength,
        pattern,
        required,
        onBlur,
        onFocus,
        onKeyDown,
        onKeyUp,
        ...containerProps
    } = restProps as InputProps;
    const isControlled = value !== undefined;
    const [innerValue, setInnerValue] = React.useState(defaultValue);
    const currentValue = isControlled ? value : innerValue;
    const showClear = Boolean(allowClear && currentValue && !disabled && !readOnly);

    const updateValue = (nextValue: string) => {
        if (!isControlled)
            setInnerValue(nextValue);
        onChange?.(nextValue);
    };

    const handleClear = () => {
        updateValue('');
        onClear?.();
    };

    return (
        <UIContainer {...containerProps}>
            <div
                className={cn(
                    'datavisool-control datavisool-input-shell',
                    `datavisool-input-size-${inputSize}`,
                    status !== 'default' && `datavisool-input-status-${status}`,
                    styleProps.controlClassName,
                )}
                data-disabled={disabled ? 'true' : undefined}
                data-readonly={readOnly ? 'true' : undefined}
                style={buildStyle(styleProps, styleProps.controlStyle)}
            >
                {prefix ? <span className="datavisool-input-affix datavisool-input-prefix">{prefix}</span> : null}
                <input
                    id={id}
                    name={name}
                    value={currentValue}
                    placeholder={placeholder}
                    type={type}
                    disabled={disabled}
                    readOnly={readOnly}
                    autoComplete={autoComplete}
                    autoFocus={autoFocus}
                    inputMode={inputMode}
                    maxLength={maxLength}
                    minLength={minLength}
                    pattern={pattern}
                    required={required}
                    className="datavisool-input-native"
                    onBlur={onBlur}
                    onFocus={onFocus}
                    onKeyUp={onKeyUp}
                    onChange={(event) => updateValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter')
                            onPressEnter?.(event);
                        onKeyDown?.(event);
                    }}
                />
                {showClear ? (
                    <button className="datavisool-input-clear" type="button" aria-label={t('清空输入')} onClick={handleClear}>
                        <IconX/>
                    </button>
                ) : null}
                {suffix ? <span className="datavisool-input-affix datavisool-input-suffix">{suffix}</span> : null}
            </div>
        </UIContainer>
    );
}
