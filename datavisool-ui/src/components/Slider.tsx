/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

type SliderSize = 'sm' | 'md' | 'lg';
type SliderStatus = 'default' | 'success' | 'warning' | 'error';

export interface SliderProps extends UIContainerProps {
    value?: number;
    defaultValue?: number;
    max?: number;
    min?: number;
    step?: number;
    onChange?: (value: number) => void;
    onChangeComplete?: (value: number) => void;
    disabled?: boolean;
    readOnly?: boolean;
    id?: string;
    name?: string;
    required?: boolean;
    sliderSize?: SliderSize;
    status?: SliderStatus;
    helperText?: React.ReactNode;
    showValue?: boolean;
    valueFormatter?: (value: number) => React.ReactNode;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
    onBlur?: React.FocusEventHandler<HTMLSpanElement>;
    onFocus?: React.FocusEventHandler<HTMLSpanElement>;
}

export function Slider(props: SliderProps) {
    const controlRef = React.useRef<HTMLSpanElement>(null);
    const valueTextRef = React.useRef<HTMLSpanElement>(null);
    const hiddenInputRef = React.useRef<HTMLInputElement>(null);
    const latestValueRef = React.useRef(0);
    const lastEmittedValueRef = React.useRef<number>();
    const pendingChangeValueRef = React.useRef<number>();
    const changeFrameRef = React.useRef<number>();
    const changeTimerRef = React.useRef<number>();
    const renderFrameRef = React.useRef<number>();
    const pendingRenderValueRef = React.useRef<number>();
    const sliderRectRef = React.useRef<DOMRect>();
    const activePointerIdRef = React.useRef<number>();
    const activeOwnerDocumentRef = React.useRef<Document>();
    const activeMoveListenerRef = React.useRef<(event: PointerEvent) => void>();
    const activeEndListenerRef = React.useRef<(event: PointerEvent) => void>();
    const draggingRef = React.useRef(false);
    const isControlledRef = React.useRef(false);
    const onChangeRef = React.useRef<SliderProps['onChange']>();
    const onChangeCompleteRef = React.useRef<SliderProps['onChangeComplete']>();
    const generatedId = React.useId();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue,
        max = 100,
        min = 0,
        step = 1,
        onChange,
        onChangeComplete,
        disabled,
        readOnly,
        id,
        name,
        required,
        sliderSize = 'md',
        status = 'default',
        helperText,
        showValue = false,
        valueFormatter,
        prefix,
        suffix,
        onBlur,
        onFocus,
        ...containerProps
    } = restProps as SliderProps;
    const isControlled = value !== undefined;
    const fallbackValue = defaultValue ?? min;
    const [innerValue, setInnerValue] = React.useState(fallbackValue);
    const currentValue = clamp(isControlled ? value : innerValue, min, max);
    const [visualValue, setVisualValue] = React.useState(() => currentValue);
    const sliderId = id ?? `${generatedId}-slider`;
    const helperId = helperText ? `${sliderId}-helper` : undefined;
    const visualPercent = valueToPercent(visualValue, min, max);
    const displayValue = valueFormatter ? valueFormatter(visualValue) : visualValue;

    isControlledRef.current = isControlled;
    onChangeRef.current = onChange;
    onChangeCompleteRef.current = onChangeComplete;

    const syncControlValue = React.useCallback((nextValue: number) => {
        const percent = valueToPercent(nextValue, min, max);
        const control = controlRef.current;
        if (control) {
            control.style.setProperty('--datavisool-slider-percent', `${percent}%`);
            control.setAttribute('aria-valuenow', String(nextValue));
        }

        if (hiddenInputRef.current)
            hiddenInputRef.current.value = String(nextValue);

        const formattedValue = valueFormatter ? valueFormatter(nextValue) : nextValue;
        if (valueTextRef.current && (typeof formattedValue === 'string' || typeof formattedValue === 'number'))
            valueTextRef.current.textContent = String(formattedValue);
    }, [max, min, valueFormatter]);

    const scheduleRenderValue = React.useCallback((nextValue: number) => {
        pendingRenderValueRef.current = nextValue;

        if (renderFrameRef.current !== undefined)
            return;

        renderFrameRef.current = window.requestAnimationFrame(() => {
            renderFrameRef.current = undefined;
            if (pendingRenderValueRef.current === undefined)
                return;

            setVisualValue(pendingRenderValueRef.current);
            pendingRenderValueRef.current = undefined;
        });
    }, []);

    const flushChange = React.useCallback(() => {
        if (changeFrameRef.current !== undefined) {
            window.cancelAnimationFrame(changeFrameRef.current);
            changeFrameRef.current = undefined;
        }
        if (changeTimerRef.current !== undefined) {
            window.clearTimeout(changeTimerRef.current);
            changeTimerRef.current = undefined;
        }

        const nextValue = pendingChangeValueRef.current;
        pendingChangeValueRef.current = undefined;

        if (nextValue === undefined || nextValue === lastEmittedValueRef.current)
            return;

        lastEmittedValueRef.current = nextValue;
        onChangeRef.current?.(nextValue);
    }, []);

    const scheduleChange = React.useCallback((nextValue: number) => {
        pendingChangeValueRef.current = nextValue;

        if (changeFrameRef.current !== undefined || changeTimerRef.current !== undefined)
            return;

        changeFrameRef.current = window.requestAnimationFrame(() => {
            changeFrameRef.current = undefined;
            changeTimerRef.current = window.setTimeout(() => {
                changeTimerRef.current = undefined;
                flushChange();
            }, 0);
        });
    }, [flushChange]);

    React.useEffect(() => {
        if (draggingRef.current)
            return;

        latestValueRef.current = currentValue;
        lastEmittedValueRef.current = currentValue;
        setVisualValue(currentValue);
        syncControlValue(currentValue);
    }, [currentValue, syncControlValue]);

    React.useEffect(() => {
        return () => {
            if (changeFrameRef.current !== undefined)
                window.cancelAnimationFrame(changeFrameRef.current);
            if (changeTimerRef.current !== undefined)
                window.clearTimeout(changeTimerRef.current);
            if (renderFrameRef.current !== undefined)
                window.cancelAnimationFrame(renderFrameRef.current);
        };
    }, []);

    const updateValue = React.useCallback((nextValue: number, options: {commitState?: boolean; immediateChange?: boolean} = {}) => {
        const normalizedValue = snapValue(clamp(nextValue, min, max), min, max, step);
        const previousValue = latestValueRef.current;
        latestValueRef.current = normalizedValue;
        syncControlValue(normalizedValue);
        scheduleRenderValue(normalizedValue);

        if (options.commitState && !isControlledRef.current)
            setInnerValue(normalizedValue);

        if (normalizedValue !== previousValue)
            scheduleChange(normalizedValue);

        if (options.immediateChange)
            flushChange();
    }, [flushChange, max, min, scheduleChange, scheduleRenderValue, step, syncControlValue]);

    const updateValueFromClientX = React.useCallback((clientX: number, options?: {commitState?: boolean; immediateChange?: boolean}) => {
        if (disabled || readOnly)
            return;

        const rect = sliderRectRef.current ?? controlRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0)
            return;

        const percent = clamp((clientX - rect.left) / rect.width, 0, 1);
        updateValue(min + percent * (max - min), options);
    }, [disabled, max, min, readOnly, updateValue]);

    const stopListening = React.useCallback(() => {
        const doc = activeOwnerDocumentRef.current;
        if (doc && activeMoveListenerRef.current)
            doc.removeEventListener('pointermove', activeMoveListenerRef.current);
        if (doc && activeEndListenerRef.current) {
            doc.removeEventListener('pointerup', activeEndListenerRef.current);
            doc.removeEventListener('pointercancel', activeEndListenerRef.current);
        }

        activeOwnerDocumentRef.current = undefined;
        activeMoveListenerRef.current = undefined;
        activeEndListenerRef.current = undefined;
    }, []);

    const finishPointerInteraction = React.useCallback((event: PointerEvent | React.PointerEvent<HTMLSpanElement>) => {
        if (!draggingRef.current)
            return;

        if ('pointerId' in event && activePointerIdRef.current !== undefined && event.pointerId !== activePointerIdRef.current)
            return;

        updateValueFromClientX(event.clientX, {immediateChange: true});

        draggingRef.current = false;
        activePointerIdRef.current = undefined;
        sliderRectRef.current = undefined;
        controlRef.current?.classList.remove('datavisool-slider-dragging');

        if ('pointerId' in event && controlRef.current?.hasPointerCapture(event.pointerId))
            controlRef.current.releasePointerCapture(event.pointerId);

        stopListening();

        const completedValue = latestValueRef.current;
        setVisualValue(completedValue);
        if (!isControlledRef.current)
            setInnerValue(completedValue);
        onChangeCompleteRef.current?.(completedValue);
    }, [stopListening, updateValueFromClientX]);

    const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLSpanElement>) => {
        if (disabled || readOnly || event.defaultPrevented || event.button !== 0)
            return;

        draggingRef.current = true;
        activePointerIdRef.current = event.pointerId;
        sliderRectRef.current = event.currentTarget.getBoundingClientRect();
        event.preventDefault();
        event.currentTarget.focus();

        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        catch {
            // Document listeners below keep drag tracking reliable if capture is unavailable.
        }

        event.currentTarget.classList.add('datavisool-slider-dragging');
        updateValueFromClientX(event.clientX);

        const doc = event.currentTarget.ownerDocument;
        const handleDocumentPointerMove = (nativeEvent: PointerEvent) => {
            if (activePointerIdRef.current !== undefined && nativeEvent.pointerId !== activePointerIdRef.current)
                return;

            if (nativeEvent.buttons === 0) {
                finishPointerInteraction(nativeEvent);
                return;
            }

            updateValueFromClientX(nativeEvent.clientX);
        };
        const handleDocumentPointerEnd = (nativeEvent: PointerEvent) => {
            finishPointerInteraction(nativeEvent);
        };

        activeOwnerDocumentRef.current = doc;
        activeMoveListenerRef.current = handleDocumentPointerMove;
        activeEndListenerRef.current = handleDocumentPointerEnd;

        doc.addEventListener('pointermove', handleDocumentPointerMove, {passive: true});
        doc.addEventListener('pointerup', handleDocumentPointerEnd);
        doc.addEventListener('pointercancel', handleDocumentPointerEnd);
    }, [disabled, finishPointerInteraction, readOnly, updateValueFromClientX]);

    React.useEffect(() => {
        if (disabled)
            stopListening();
    }, [disabled, stopListening]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLSpanElement>) => {
        if (disabled || readOnly)
            return;

        const keyboardStep = step > 0 ? step : 1;
        const largeStep = keyboardStep * 10;
        let nextValue: number | undefined;

        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
            nextValue = latestValueRef.current - keyboardStep;
        else if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
            nextValue = latestValueRef.current + keyboardStep;
        else if (event.key === 'PageDown')
            nextValue = latestValueRef.current - largeStep;
        else if (event.key === 'PageUp')
            nextValue = latestValueRef.current + largeStep;
        else if (event.key === 'Home')
            nextValue = min;
        else if (event.key === 'End')
            nextValue = max;

        if (nextValue === undefined)
            return;

        event.preventDefault();
        updateValue(nextValue, {commitState: true, immediateChange: true});
    }, [disabled, max, min, readOnly, step, updateValue]);

    return (
        <UIContainer {...containerProps}>
            <div
                className={cn(
                    'datavisool-slider-field',
                    `datavisool-slider-size-${sliderSize}`,
                    status !== 'default' && `datavisool-slider-status-${status}`,
                    disabled && 'datavisool-slider-disabled',
                    readOnly && 'datavisool-slider-readonly',
                    styleProps.controlClassName,
                )}
                data-disabled={disabled ? 'true' : undefined}
                data-readonly={readOnly ? 'true' : undefined}
                style={buildStyle(styleProps, styleProps.controlStyle)}
            >
                <div className="datavisool-slider-main">
                    {prefix ? <span className="datavisool-slider-affix datavisool-slider-prefix">{prefix}</span> : null}
                    <span
                        ref={controlRef}
                        id={sliderId}
                        className="datavisool-slider-control"
                        role="slider"
                        tabIndex={disabled ? -1 : 0}
                        aria-valuemin={min}
                        aria-valuemax={max}
                        aria-valuenow={visualValue}
                        aria-label={typeof containerProps.label === 'string' ? containerProps.label : name}
                        aria-valuetext={typeof displayValue === 'string' || typeof displayValue === 'number' ? String(displayValue) : undefined}
                        aria-readonly={readOnly || undefined}
                        aria-disabled={disabled || undefined}
                        aria-required={required || undefined}
                        aria-invalid={status === 'error' ? true : undefined}
                        aria-describedby={helperId}
                        style={{'--datavisool-slider-percent': `${visualPercent}%`} as React.CSSProperties}
                        onBlur={(event) => {
                            onBlur?.(event);
                            onChangeComplete?.(latestValueRef.current);
                        }}
                        onFocus={onFocus}
                        onKeyDown={handleKeyDown}
                        onKeyUp={() => onChangeComplete?.(latestValueRef.current)}
                        onPointerDown={handlePointerDown}
                        onPointerUp={finishPointerInteraction}
                        onPointerCancel={finishPointerInteraction}
                    >
                        <span className="datavisool-slider-rail"/>
                        <span className="datavisool-slider-fill"/>
                        <span className="datavisool-slider-thumb"/>
                        {name ? <input ref={hiddenInputRef} type="hidden" name={name} value={visualValue} readOnly/> : null}
                    </span>
                    {suffix ? <span className="datavisool-slider-affix datavisool-slider-suffix">{suffix}</span> : null}
                    {showValue ? <span ref={valueTextRef} className="datavisool-slider-value">{displayValue}</span> : null}
                </div>
                {helperText ? (
                    <div id={helperId} className={cn('datavisool-slider-helper', status !== 'default' && `datavisool-slider-helper-${status}`)}>
                        {helperText}
                    </div>
                ) : null}
            </div>
        </UIContainer>
    );
}

function clamp(value: number, min: number, max: number) {
    if (Number.isNaN(value))
        return min;
    return Math.min(Math.max(value, min), max);
}

function valueToPercent(value: number, min: number, max: number) {
    return max === min ? 0 : ((value - min) / (max - min)) * 100;
}

function snapValue(value: number, min: number, max: number, step: number) {
    if (step <= 0)
        return clamp(value, min, max);

    const precision = getPrecision(step);
    const snapped = Math.round((value - min) / step) * step + min;
    return Number(clamp(snapped, min, max).toFixed(precision));
}

function getPrecision(value: number) {
    const valueText = String(value);
    if (!valueText.includes('.'))
        return 0;
    return valueText.length - valueText.indexOf('.') - 1;
}
