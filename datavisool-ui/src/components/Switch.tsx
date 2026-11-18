/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {useControllable} from './hooks';
import {buildStyle, splitControlStyleProps} from './style';

type SwitchSize = 'sm' | 'md' | 'lg';
type SwitchStatus = 'default' | 'success' | 'warning' | 'error';

export interface SwitchProps extends UIContainerProps {
    onChange?: (data: boolean) => void;
    value?: boolean;
    defaultValue?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    children?: React.ReactNode;
    text?: React.ReactNode;
    helperText?: React.ReactNode;
    checkedText?: React.ReactNode;
    uncheckedText?: React.ReactNode;
    id?: string;
    name?: string;
    required?: boolean;
    switchSize?: SwitchSize;
    status?: SwitchStatus;
    onBlur?: React.FocusEventHandler<HTMLButtonElement>;
    onFocus?: React.FocusEventHandler<HTMLButtonElement>;
}

export function Switch(props: SwitchProps) {
    const generatedId = React.useId();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue,
        disabled,
        readOnly,
        children,
        text,
        helperText,
        checkedText,
        uncheckedText,
        id,
        name,
        required,
        switchSize = 'md',
        status = 'default',
        onBlur,
        onFocus,
        onChange,
        ...containerProps
    } = restProps as SwitchProps;
    const [finalValue, setFinalValue, controlled] = useControllable<boolean>(value, defaultValue);
    const checked = !!finalValue;
    const switchId = id ?? `${generatedId}-switch`;
    const helperId = helperText ? `${switchId}-helper` : undefined;
    const labelContent = children ?? text;
    const stateText = checked ? checkedText : uncheckedText;

    const updateValue = () => {
        if (readOnly)
            return;
        const next = !checked;
        if (!controlled)
            setFinalValue(next);
        onChange?.(next);
    };

    return (
        <UIContainer {...containerProps}>
            <div className="datavisool-switch-field">
                <div className="datavisool-switch-row">
                    <button
                        id={switchId}
                        type="button"
                        role="switch"
                        disabled={disabled}
                        aria-checked={checked}
                        aria-readonly={readOnly || undefined}
                        aria-describedby={helperId}
                        aria-invalid={status === 'error' ? true : undefined}
                        data-checked={checked ? 'true' : undefined}
                        data-disabled={disabled ? 'true' : undefined}
                        data-readonly={readOnly ? 'true' : undefined}
                        className={cn(
                            'datavisool-switch',
                            `datavisool-switch-size-${switchSize}`,
                            status !== 'default' && `datavisool-switch-status-${status}`,
                            checked && 'datavisool-switch-checked',
                            disabled && 'datavisool-switch-disabled',
                            readOnly && 'datavisool-switch-readonly',
                            styleProps.controlClassName,
                        )}
                        style={buildStyle(styleProps, styleProps.controlStyle)}
                        onBlur={onBlur}
                        onFocus={onFocus}
                        onClick={updateValue}
                    >
                        <span className="datavisool-switch-track">
                            {stateText ? <span className="datavisool-switch-state-text">{stateText}</span> : null}
                            <span className="datavisool-switch-thumb" aria-hidden="true"/>
                        </span>
                    </button>
                    {labelContent ? (
                        <span
                            className="datavisool-switch-label"
                            onClick={() => {
                                if (!disabled)
                                    updateValue();
                            }}
                        >
                            {labelContent}
                        </span>
                    ) : null}
                </div>
                {name ? <input type="hidden" name={name} value={checked ? 'true' : 'false'} required={required}/> : null}
                {helperText ? (
                    <div id={helperId} className={cn('datavisool-switch-helper', status !== 'default' && `datavisool-switch-helper-${status}`)}>
                        {helperText}
                    </div>
                ) : null}
            </div>
        </UIContainer>
    );
}
