/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useRef} from 'react';
import {cn} from '@/lib/utils';
import {IconMinus, IconPlus} from './Icon';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

export interface NumberInputProps extends UIContainerProps {
    value?: number;
    defaultValue?: number;
    disabled?: boolean;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
    controls?: boolean;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
    placeholder?: string;
    onChange?: (data: number | undefined) => void;
}

export function NumberInput(props: NumberInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue,
        min,
        max,
        step,
        precision,
        controls = true,
        prefix,
        suffix,
        disabled,
        placeholder,
        onChange,
        ...containerProps
    } = restProps as NumberInputProps;
    const stepValue = step ?? 1;

    const clamp = (nextValue: number) => {
        if (typeof min === 'number' && nextValue < min)
            return min;
        if (typeof max === 'number' && nextValue > max)
            return max;
        return nextValue;
    };

    const normalizeValue = (nextValue: number) => {
        const clampedValue = clamp(nextValue);
        return typeof precision === 'number' ? Number(clampedValue.toFixed(precision)) : clampedValue;
    };

    const getCurrentValue = () => {
        if (typeof value === 'number')
            return value;

        const inputValue = inputRef.current?.value;
        if (inputValue) {
            const parsedValue = Number(inputValue);
            if (!Number.isNaN(parsedValue))
                return parsedValue;
        }

        if (typeof defaultValue === 'number')
            return defaultValue;
        if (typeof min === 'number')
            return min;
        return 0;
    };

    const updateByStep = (direction: 1 | -1) => {
        const nextValue = normalizeValue(getCurrentValue() + stepValue * direction);
        if (value === undefined && inputRef.current)
            inputRef.current.value = String(nextValue);
        onChange?.(nextValue);
    };

    const decreaseDisabled = disabled || (typeof value === 'number' && typeof min === 'number' && value <= min);
    const increaseDisabled = disabled || (typeof value === 'number' && typeof max === 'number' && value >= max);

    return (
        <UIContainer {...containerProps}>
            <div
                className={cn('datavisool-control datavisool-number-input', styleProps.controlClassName)}
                data-disabled={disabled ? 'true' : undefined}
                data-controls={controls ? 'true' : 'false'}
                style={buildStyle(styleProps, styleProps.controlStyle)}
            >
                {prefix ? <span className="datavisool-number-input-affix datavisool-number-input-prefix">{prefix}</span> : null}
                {controls ? (
                    <button
                        type="button"
                        aria-label="Decrease value"
                        disabled={decreaseDisabled}
                        className="datavisool-number-input-button"
                        onClick={() => updateByStep(-1)}
                    >
                        <IconMinus size={15} strokeWidth={2.25}/>
                    </button>
                ) : null}
                <input
                    ref={inputRef}
                    value={value}
                    defaultValue={defaultValue}
                    min={min}
                    max={max}
                    step={step}
                    disabled={disabled}
                    placeholder={placeholder}
                    type="number"
                    className="datavisool-number-input-native"
                    onChange={(event) => {
                        if (event.target.value === '') {
                            onChange?.(undefined);
                            return;
                        }
                        const nextValue = normalizeValue(Number(event.target.value));
                        if (!Number.isNaN(nextValue))
                            onChange?.(nextValue);
                    }}
                />
                {controls ? (
                    <button
                        type="button"
                        aria-label="Increase value"
                        disabled={increaseDisabled}
                        className="datavisool-number-input-button"
                        onClick={() => updateByStep(1)}
                    >
                        <IconPlus size={15} strokeWidth={2.25}/>
                    </button>
                ) : null}
                {suffix ? <span className="datavisool-number-input-affix datavisool-number-input-suffix">{suffix}</span> : null}
            </div>
        </UIContainer>
    );
}
