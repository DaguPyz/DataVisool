/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {useControllable} from './hooks';
import {buildStyle, splitControlStyleProps} from './style';

type RadioSize = 'sm' | 'md' | 'lg';
type RadioStatus = 'default' | 'success' | 'warning' | 'error';
type RadioDirection = 'horizontal' | 'vertical';

export interface RadioOption {
    label: React.ReactNode;
    value: string;
    disabled?: boolean;
    helperText?: React.ReactNode;
}

export interface RadioProps extends UIContainerProps {
    value?: string;
    defaultValue?: string;
    disabled?: boolean;
    readOnly?: boolean;
    options?: RadioOption[];
    onChange?: (value: string) => void;
    name?: string;
    id?: string;
    required?: boolean;
    radioSize?: RadioSize;
    status?: RadioStatus;
    direction?: RadioDirection;
    helperText?: React.ReactNode;
    optionClassName?: string;
    optionStyle?: React.CSSProperties;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
    onFocus?: React.FocusEventHandler<HTMLInputElement>;
}

export function Radio(props: RadioProps) {
    const generatedId = React.useId();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue,
        disabled,
        readOnly,
        options = [],
        onChange,
        name,
        id,
        required,
        radioSize = 'md',
        status = 'default',
        direction = 'horizontal',
        helperText,
        optionClassName,
        optionStyle,
        onBlur,
        onFocus,
        ...containerProps
    } = restProps as RadioProps;
    const [finalValue, setFinalValue, controlled] = useControllable<string>(value, defaultValue);
    const groupId = id ?? `${generatedId}-radio`;
    const groupName = name ?? groupId;
    const helperId = helperText ? `${groupId}-helper` : undefined;

    const updateValue = (nextValue: string) => {
        if (readOnly || nextValue === finalValue)
            return;
        if (!controlled)
            setFinalValue(nextValue);
        onChange?.(nextValue);
    };

    return (
        <UIContainer {...containerProps}>
            <div className="datavisool-radio-field">
                <div
                    id={groupId}
                    role="radiogroup"
                    aria-describedby={helperId}
                    aria-invalid={status === 'error' ? true : undefined}
                    className={cn('datavisool-radio-group', `datavisool-radio-group-${direction}`)}
                >
                    {options.map((option) => {
                        const optionId = `${groupId}-${option.value}`;
                        const optionHelperId = option.helperText ? `${optionId}-helper` : undefined;
                        const optionDisabled = disabled || option.disabled;
                        const checked = finalValue === option.value;

                        return (
                            <label
                                key={option.value}
                                className={cn(
                                    'datavisool-radio-option',
                                    `datavisool-radio-size-${radioSize}`,
                                    status !== 'default' && `datavisool-radio-status-${status}`,
                                    checked && 'datavisool-radio-checked',
                                    optionDisabled && 'datavisool-radio-disabled',
                                    readOnly && 'datavisool-radio-readonly',
                                    styleProps.controlClassName,
                                    optionClassName,
                                )}
                                data-checked={checked ? 'true' : undefined}
                                data-disabled={optionDisabled ? 'true' : undefined}
                                data-readonly={readOnly ? 'true' : undefined}
                                style={buildStyle(styleProps, {...styleProps.controlStyle, ...optionStyle})}
                            >
                                <input
                                    id={optionId}
                                    name={groupName}
                                    type="radio"
                                    value={option.value}
                                    disabled={optionDisabled}
                                    required={required}
                                    checked={checked}
                                    aria-describedby={optionHelperId}
                                    aria-invalid={status === 'error' ? true : undefined}
                                    className="datavisool-radio-native"
                                    onBlur={onBlur}
                                    onFocus={onFocus}
                                    onClick={(event) => {
                                        if (readOnly)
                                            event.preventDefault();
                                    }}
                                    onChange={(event) => {
                                        if (event.target.checked)
                                            updateValue(option.value);
                                    }}
                                />
                                <span className="datavisool-radio-control" aria-hidden="true"/>
                                <span className="datavisool-radio-content">
                                    <span className="datavisool-radio-label">{option.label}</span>
                                    {option.helperText ? <span id={optionHelperId} className="datavisool-radio-option-helper">{option.helperText}</span> : null}
                                </span>
                            </label>
                        );
                    })}
                </div>
                {helperText ? (
                    <div id={helperId} className={cn('datavisool-radio-helper', status !== 'default' && `datavisool-radio-helper-${status}`)}>
                        {helperText}
                    </div>
                ) : null}
            </div>
        </UIContainer>
    );
}
