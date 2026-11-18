/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {useControllable} from './hooks';
import {buildStyle, splitControlStyleProps} from './style';

type CheckBoxSize = 'sm' | 'md' | 'lg';
type CheckBoxStatus = 'default' | 'success' | 'warning' | 'error';

export interface CheckBoxProps extends UIContainerProps {
    value?: boolean;
    defaultValue?: boolean;
    onChange?: (value: boolean) => void;
    children?: React.ReactNode;
    text?: React.ReactNode;
    helperText?: React.ReactNode;
    disabled?: boolean;
    readOnly?: boolean;
    indeterminate?: boolean;
    required?: boolean;
    name?: string;
    id?: string;
    checkboxSize?: CheckBoxSize;
    status?: CheckBoxStatus;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
    onFocus?: React.FocusEventHandler<HTMLInputElement>;
}

export function CheckBox(props: CheckBoxProps) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const generatedId = React.useId();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue,
        onChange,
        children,
        text,
        helperText,
        disabled,
        readOnly,
        indeterminate,
        required,
        name,
        id,
        checkboxSize = 'md',
        status = 'default',
        onBlur,
        onFocus,
        ...containerProps
    } = restProps as CheckBoxProps;
    const [finalValue, setFinalValue, controlled] = useControllable<boolean>(value, defaultValue);
    const inputId = id ?? `${generatedId}-checkbox`;
    const helperId = helperText ? `${inputId}-helper` : undefined;
    const labelContent = children ?? text;
    const checked = !!finalValue;

    React.useEffect(() => {
        if (inputRef.current)
            inputRef.current.indeterminate = !!indeterminate;
    }, [indeterminate]);

    const updateValue = (nextValue: boolean) => {
        if (readOnly)
            return;
        if (!controlled)
            setFinalValue(nextValue);
        onChange?.(nextValue);
    };

    return (
        <UIContainer {...containerProps}>
            <div className="datavisool-checkbox-field">
                <label
                    className={cn(
                        'datavisool-checkbox',
                        `datavisool-checkbox-size-${checkboxSize}`,
                        status !== 'default' && `datavisool-checkbox-status-${status}`,
                        checked && 'datavisool-checkbox-checked',
                        indeterminate && 'datavisool-checkbox-indeterminate',
                        disabled && 'datavisool-checkbox-disabled',
                        readOnly && 'datavisool-checkbox-readonly',
                        styleProps.controlClassName,
                    )}
                    data-checked={checked ? 'true' : undefined}
                    data-indeterminate={indeterminate ? 'true' : undefined}
                    data-disabled={disabled ? 'true' : undefined}
                    data-readonly={readOnly ? 'true' : undefined}
                    style={buildStyle(styleProps, styleProps.controlStyle)}
                >
                    <input
                        ref={inputRef}
                        id={inputId}
                        name={name}
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        required={required}
                        aria-describedby={helperId}
                        aria-invalid={status === 'error' ? true : undefined}
                        className="datavisool-checkbox-native"
                        onBlur={onBlur}
                        onFocus={onFocus}
                        onChange={(event) => updateValue(event.target.checked)}
                        onClick={(event) => {
                            if (readOnly)
                                event.preventDefault();
                        }}
                    />
                    <span className="datavisool-checkbox-control" aria-hidden="true"/>
                    {labelContent ? <span className="datavisool-checkbox-label">{labelContent}</span> : null}
                </label>
                {helperText ? (
                    <div id={helperId} className={cn('datavisool-checkbox-helper', status !== 'default' && `datavisool-checkbox-helper-${status}`)}>
                        {helperText}
                    </div>
                ) : null}
            </div>
        </UIContainer>
    );
}
