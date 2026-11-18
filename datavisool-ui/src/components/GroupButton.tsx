/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

type GroupButtonSize = 'sm' | 'md' | 'lg';
type GroupButtonStatus = 'default' | 'success' | 'warning' | 'error';
type GroupButtonDirection = 'horizontal' | 'vertical';

export interface BtnItemType {
    value: string;
    content: React.ReactNode | string;
    disabled?: boolean;
    title?: string;
    ariaLabel?: string;
}

export interface GroupButtonProps extends UIContainerProps {
    items: Array<BtnItemType>;
    onChange?: (value: string) => void;
    value?: string;
    defaultValue?: string;
    disabled?: boolean;
    readOnly?: boolean;
    name?: string;
    id?: string;
    required?: boolean;
    groupSize?: GroupButtonSize;
    status?: GroupButtonStatus;
    direction?: GroupButtonDirection;
    helperText?: React.ReactNode;
    block?: boolean;
    equalWidth?: boolean;
    itemClassName?: string;
    itemStyle?: React.CSSProperties;
    onBlur?: React.FocusEventHandler<HTMLButtonElement>;
    onFocus?: React.FocusEventHandler<HTMLButtonElement>;
}

export function GroupButton(props: GroupButtonProps) {
    const generatedId = React.useId();
    const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        items = [],
        onChange,
        value,
        defaultValue,
        disabled,
        readOnly,
        name,
        id,
        required,
        groupSize = 'md',
        status = 'default',
        direction = 'horizontal',
        helperText,
        block,
        equalWidth,
        itemClassName,
        itemStyle,
        onBlur,
        onFocus,
        ...containerProps
    } = restProps as unknown as GroupButtonProps;
    const isControlled = value !== undefined;
    const [innerValue, setInnerValue] = React.useState(defaultValue);
    const finalValue = isControlled ? value : innerValue;
    const groupId = id ?? `${generatedId}-group-button`;
    const helperId = helperText ? `${groupId}-helper` : undefined;
    const enabledItems = items.filter((item) => !item.disabled);
    const selectedIndex = items.findIndex((item) => item.value === finalValue);
    const focusableIndex = selectedIndex >= 0 && !items[selectedIndex]?.disabled ? selectedIndex : items.findIndex((item) => !item.disabled);

    const updateValue = React.useCallback((nextValue: string, itemDisabled?: boolean) => {
        if (disabled || readOnly || itemDisabled || nextValue === finalValue)
            return;

        if (!isControlled)
            setInnerValue(nextValue);
        onChange?.(nextValue);
    }, [disabled, finalValue, isControlled, onChange, readOnly]);

    const focusItem = React.useCallback((index: number) => {
        itemRefs.current[index]?.focus();
    }, []);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (!enabledItems.length)
            return;

        const currentEnabledIndex = enabledItems.findIndex((item) => item.value === items[index]?.value);
        let nextEnabledIndex: number | undefined;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
            nextEnabledIndex = (currentEnabledIndex + 1 + enabledItems.length) % enabledItems.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
            nextEnabledIndex = (currentEnabledIndex - 1 + enabledItems.length) % enabledItems.length;
        else if (event.key === 'Home')
            nextEnabledIndex = 0;
        else if (event.key === 'End')
            nextEnabledIndex = enabledItems.length - 1;

        if (nextEnabledIndex === undefined)
            return;

        event.preventDefault();
        const nextItem = enabledItems[nextEnabledIndex];
        const nextIndex = items.findIndex((item) => item.value === nextItem.value);
        focusItem(nextIndex);
        updateValue(nextItem.value, nextItem.disabled);
    };

    return (
        <UIContainer {...containerProps}>
            <div className="datavisool-group-button-field">
                <div
                    id={groupId}
                    role="radiogroup"
                    aria-disabled={disabled || undefined}
                    aria-readonly={readOnly || undefined}
                    aria-required={required || undefined}
                    aria-invalid={status === 'error' ? true : undefined}
                    aria-describedby={helperId}
                    className={cn(
                        'datavisool-group-button',
                        `datavisool-group-button-size-${groupSize}`,
                        `datavisool-group-button-${direction}`,
                        status !== 'default' && `datavisool-group-button-status-${status}`,
                        disabled && 'datavisool-group-button-disabled',
                        readOnly && 'datavisool-group-button-readonly',
                        block && 'datavisool-group-button-block',
                        equalWidth && 'datavisool-group-button-equal',
                        styleProps.controlClassName,
                    )}
                    data-disabled={disabled ? 'true' : undefined}
                    data-readonly={readOnly ? 'true' : undefined}
                    style={buildStyle(styleProps, styleProps.controlStyle)}
                >
                    {items.map((item, index) => {
                        const selected = finalValue === item.value;
                        const itemDisabled = disabled || item.disabled;
                        const tabIndex = itemDisabled ? -1 : index === focusableIndex ? 0 : -1;

                        return (
                            <button
                                key={item.value}
                                ref={(node) => {
                                    itemRefs.current[index] = node;
                                }}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                aria-disabled={itemDisabled || undefined}
                                aria-label={item.ariaLabel}
                                title={item.title}
                                disabled={itemDisabled}
                                tabIndex={tabIndex}
                                className={cn(
                                    'datavisool-group-button-item',
                                    selected && 'datavisool-group-button-item-selected',
                                    itemDisabled && 'datavisool-group-button-item-disabled',
                                    itemClassName,
                                )}
                                data-value={item.value}
                                data-selected={selected ? 'true' : undefined}
                                style={itemStyle}
                                onBlur={onBlur}
                                onFocus={onFocus}
                                onKeyDown={(event) => handleKeyDown(event, index)}
                                onClick={() => updateValue(item.value, item.disabled)}
                            >
                                <span className="datavisool-group-button-item-content">{item.content}</span>
                            </button>
                        );
                    })}
                    {name ? <input type="hidden" name={name} value={finalValue ?? ''} required={required} readOnly/> : null}
                </div>
                {helperText ? (
                    <div id={helperId} className={cn('datavisool-group-button-helper', status !== 'default' && `datavisool-group-button-helper-${status}`)}>
                        {helperText}
                    </div>
                ) : null}
            </div>
        </UIContainer>
    );
}
