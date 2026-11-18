/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

type RangeSliderSize = 'sm' | 'md' | 'lg';
type RangeSliderStatus = 'default' | 'success' | 'warning' | 'error';
type RangeValue = [number, number];

export interface RangeSliderProps extends UIContainerProps {
    value?: number[];
    defaultValue?: number[];
    max?: number;
    min?: number;
    step?: number;
    onChange?: (value: number[]) => void;
    onChangeComplete?: (value: number[]) => void;
    disabled?: boolean;
    readOnly?: boolean;
    id?: string;
    name?: string;
    required?: boolean;
    sliderSize?: RangeSliderSize;
    status?: RangeSliderStatus;
    helperText?: React.ReactNode;
    showValue?: boolean;
    valueFormatter?: (value: number[]) => React.ReactNode;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
    onBlur?: React.FocusEventHandler<HTMLSpanElement>;
    onFocus?: React.FocusEventHandler<HTMLSpanElement>;
}

export function RangeSlider(props: RangeSliderProps) {
    const t = useDataVisoolUITranslate();
    const controlRef = React.useRef<HTMLSpanElement>(null);
    const valueTextRef = React.useRef<HTMLSpanElement>(null);
    const hiddenInputRef = React.useRef<HTMLInputElement>(null);
    const thumbRefs = React.useRef<Array<HTMLSpanElement | null>>([]);
    const latestValueRef = React.useRef<RangeValue>([0, 0]);
    const lastEmittedValueRef = React.useRef<RangeValue>();
    const pendingChangeValueRef = React.useRef<RangeValue>();
    const changeFrameRef = React.useRef<number>();
    const changeTimerRef = React.useRef<number>();
    const renderFrameRef = React.useRef<number>();
    const pendingRenderValueRef = React.useRef<RangeValue>();
    const sliderRectRef = React.useRef<DOMRect>();
    const activePointerIdRef = React.useRef<number>();
    const activeThumbIndexRef = React.useRef(0);
    const lastUsedThumbIndexRef = React.useRef(0);
    const activeOwnerDocumentRef = React.useRef<Document>();
    const activeMoveListenerRef = React.useRef<(event: PointerEvent) => void>();
    const activeEndListenerRef = React.useRef<(event: PointerEvent) => void>();
    const draggingRef = React.useRef(false);
    const isControlledRef = React.useRef(false);
    const onChangeRef = React.useRef<RangeSliderProps['onChange']>();
    const onChangeCompleteRef = React.useRef<RangeSliderProps['onChangeComplete']>();
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
    } = restProps as RangeSliderProps;
    const isControlled = value !== undefined;
    const fallbackValue = defaultValue ?? [min, max];
    const [innerValue, setInnerValue] = React.useState<RangeValue>(() => normalizeRange(fallbackValue, min, max, step));
    const currentValue = React.useMemo(
        () => normalizeRange(isControlled ? value : innerValue, min, max, step),
        [innerValue, isControlled, max, min, step, value],
    );
    const [visualValue, setVisualValue] = React.useState<RangeValue>(() => currentValue);
    const sliderId = id ?? `${generatedId}-range-slider`;
    const helperId = helperText ? `${sliderId}-helper` : undefined;
    const startPercent = valueToPercent(visualValue[0], min, max);
    const endPercent = valueToPercent(visualValue[1], min, max);
    const displayValue = valueFormatter ? valueFormatter(visualValue) : `${visualValue[0]} - ${visualValue[1]}`;

    isControlledRef.current = isControlled;
    onChangeRef.current = onChange;
    onChangeCompleteRef.current = onChangeComplete;

    const syncControlValue = React.useCallback((nextValue: RangeValue) => {
        const start = valueToPercent(nextValue[0], min, max);
        const end = valueToPercent(nextValue[1], min, max);
        const control = controlRef.current;

        if (control) {
            control.style.setProperty('--datavisool-range-slider-start', `${start}%`);
            control.style.setProperty('--datavisool-range-slider-end', `${end}%`);
        }

        thumbRefs.current[0]?.setAttribute('aria-valuenow', String(nextValue[0]));
        thumbRefs.current[0]?.setAttribute('aria-valuemax', String(nextValue[1]));
        thumbRefs.current[1]?.setAttribute('aria-valuenow', String(nextValue[1]));
        thumbRefs.current[1]?.setAttribute('aria-valuemin', String(nextValue[0]));

        if (hiddenInputRef.current)
            hiddenInputRef.current.value = nextValue.join(',');

        const formattedValue = valueFormatter ? valueFormatter(nextValue) : `${nextValue[0]} - ${nextValue[1]}`;
        if (valueTextRef.current && (typeof formattedValue === 'string' || typeof formattedValue === 'number'))
            valueTextRef.current.textContent = String(formattedValue);
    }, [max, min, valueFormatter]);

    const scheduleRenderValue = React.useCallback((nextValue: RangeValue) => {
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

        if (!nextValue || rangesEqual(nextValue, lastEmittedValueRef.current))
            return;

        lastEmittedValueRef.current = nextValue;
        onChangeRef.current?.([...nextValue]);
    }, []);

    const scheduleChange = React.useCallback((nextValue: RangeValue) => {
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

    const updateValue = React.useCallback((thumbIndex: number, nextThumbValue: number, options: {commitState?: boolean; immediateChange?: boolean} = {}) => {
        const previousValue = latestValueRef.current;
        const nextValue = setRangeIndex(previousValue, thumbIndex, nextThumbValue, min, max, step);
        latestValueRef.current = nextValue;
        syncControlValue(nextValue);
        scheduleRenderValue(nextValue);

        if (options.commitState && !isControlledRef.current)
            setInnerValue(nextValue);

        if (!rangesEqual(nextValue, previousValue))
            scheduleChange(nextValue);

        if (options.immediateChange)
            flushChange();
    }, [flushChange, max, min, scheduleChange, scheduleRenderValue, step, syncControlValue]);

    const getValueFromClientX = React.useCallback((clientX: number) => {
        const rect = sliderRectRef.current ?? controlRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0)
            return undefined;

        const percent = clamp((clientX - rect.left) / rect.width, 0, 1);
        return min + percent * (max - min);
    }, [max, min]);

    const updateValueFromClientX = React.useCallback((clientX: number, options?: {commitState?: boolean; immediateChange?: boolean}) => {
        if (disabled || readOnly)
            return;

        const nextValue = getValueFromClientX(clientX);
        if (nextValue === undefined)
            return;

        updateValue(activeThumbIndexRef.current, nextValue, options);
    }, [disabled, getValueFromClientX, readOnly, updateValue]);

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
        controlRef.current?.classList.remove('datavisool-range-slider-dragging');

        if ('pointerId' in event && controlRef.current?.hasPointerCapture(event.pointerId))
            controlRef.current.releasePointerCapture(event.pointerId);

        stopListening();

        const completedValue = latestValueRef.current;
        setVisualValue(completedValue);
        if (!isControlledRef.current)
            setInnerValue(completedValue);
        onChangeCompleteRef.current?.([...completedValue]);
    }, [stopListening, updateValueFromClientX]);

    const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLSpanElement>) => {
        if (disabled || readOnly || event.defaultPrevented || event.button !== 0)
            return;

        const targetThumb = (event.target as HTMLElement).closest('[data-range-thumb-index]');
        const pointerValue = getValueFromClientX(event.clientX);
        if (pointerValue === undefined)
            return;

        activeThumbIndexRef.current = targetThumb ? Number(targetThumb.getAttribute('data-range-thumb-index')) : findClosestThumb(latestValueRef.current, pointerValue, lastUsedThumbIndexRef.current);
        lastUsedThumbIndexRef.current = activeThumbIndexRef.current;
        draggingRef.current = true;
        activePointerIdRef.current = event.pointerId;
        sliderRectRef.current = event.currentTarget.getBoundingClientRect();
        event.preventDefault();
        thumbRefs.current[activeThumbIndexRef.current]?.focus();

        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        catch {
            // Document listeners below keep drag tracking reliable if capture is unavailable.
        }

        event.currentTarget.classList.add('datavisool-range-slider-dragging');
        updateValue(activeThumbIndexRef.current, pointerValue);

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
    }, [disabled, finishPointerInteraction, getValueFromClientX, readOnly, updateValue, updateValueFromClientX]);

    React.useEffect(() => {
        if (disabled)
            stopListening();
    }, [disabled, stopListening]);

    React.useEffect(() => {
        return () => {
            stopListening();
            controlRef.current?.classList.remove('datavisool-range-slider-dragging');
        };
    }, [stopListening]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLSpanElement>, thumbIndex: number) => {
        if (disabled || readOnly)
            return;

        const keyboardStep = step > 0 ? step : 1;
        const largeStep = keyboardStep * 10;
        let nextValue: number | undefined;

        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
            nextValue = latestValueRef.current[thumbIndex] - keyboardStep;
        else if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
            nextValue = latestValueRef.current[thumbIndex] + keyboardStep;
        else if (event.key === 'PageDown')
            nextValue = latestValueRef.current[thumbIndex] - largeStep;
        else if (event.key === 'PageUp')
            nextValue = latestValueRef.current[thumbIndex] + largeStep;
        else if (event.key === 'Home')
            nextValue = thumbIndex === 0 ? min : latestValueRef.current[0];
        else if (event.key === 'End')
            nextValue = thumbIndex === 0 ? latestValueRef.current[1] : max;

        if (nextValue === undefined)
            return;

        event.preventDefault();
        activeThumbIndexRef.current = thumbIndex;
        lastUsedThumbIndexRef.current = thumbIndex;
        updateValue(thumbIndex, nextValue, {commitState: true, immediateChange: true});
    }, [disabled, max, min, readOnly, step, updateValue]);

    return (
        <UIContainer {...containerProps}>
            <div
                className={cn(
                    'datavisool-range-slider-field',
                    `datavisool-range-slider-size-${sliderSize}`,
                    status !== 'default' && `datavisool-range-slider-status-${status}`,
                    disabled && 'datavisool-range-slider-disabled',
                    readOnly && 'datavisool-range-slider-readonly',
                    styleProps.controlClassName,
                )}
                data-disabled={disabled ? 'true' : undefined}
                data-readonly={readOnly ? 'true' : undefined}
                style={buildStyle(styleProps, styleProps.controlStyle)}
            >
                <div className="datavisool-range-slider-main">
                    {prefix ? <span className="datavisool-range-slider-affix datavisool-range-slider-prefix">{prefix}</span> : null}
                    <span
                        ref={controlRef}
                        id={sliderId}
                        className="datavisool-range-slider-control"
                        style={{
                            '--datavisool-range-slider-start': `${startPercent}%`,
                            '--datavisool-range-slider-end': `${endPercent}%`,
                        } as React.CSSProperties}
                        onPointerDown={handlePointerDown}
                        onPointerUp={finishPointerInteraction}
                        onPointerCancel={finishPointerInteraction}
                    >
                        <span className="datavisool-range-slider-rail"/>
                        <span className="datavisool-range-slider-track"/>
                        {[0, 1].map((thumbIndex) => {
                            const label = typeof containerProps.label === 'string'
                                ? t(thumbIndex === 0 ? '{label} 最小值' : '{label} 最大值', {label: containerProps.label})
                                : undefined;
                            return (
                                <span
                                    key={thumbIndex}
                                    ref={(node) => {
                                        thumbRefs.current[thumbIndex] = node;
                                    }}
                                    className={cn('datavisool-range-slider-thumb', `datavisool-range-slider-thumb-${thumbIndex === 0 ? 'start' : 'end'}`)}
                                    role="slider"
                                    tabIndex={disabled ? -1 : 0}
                                    data-range-thumb-index={thumbIndex}
                                    aria-label={label}
                                    aria-valuemin={thumbIndex === 0 ? min : visualValue[0]}
                                    aria-valuemax={thumbIndex === 0 ? visualValue[1] : max}
                                    aria-valuenow={visualValue[thumbIndex]}
                                    aria-valuetext={String(visualValue[thumbIndex])}
                                    aria-readonly={readOnly || undefined}
                                    aria-disabled={disabled || undefined}
                                    aria-required={required || undefined}
                                    aria-invalid={status === 'error' ? true : undefined}
                                    aria-describedby={helperId}
                                    onFocus={onFocus}
                                    onBlur={(event) => {
                                        onBlur?.(event);
                                        onChangeComplete?.([...latestValueRef.current]);
                                    }}
                                    onKeyDown={(event) => handleKeyDown(event, thumbIndex)}
                                    onKeyUp={() => onChangeComplete?.([...latestValueRef.current])}
                                />
                            );
                        })}
                        {name ? <input ref={hiddenInputRef} type="hidden" name={name} value={visualValue.join(',')} readOnly/> : null}
                    </span>
                    {suffix ? <span className="datavisool-range-slider-affix datavisool-range-slider-suffix">{suffix}</span> : null}
                    {showValue ? <span ref={valueTextRef} className="datavisool-range-slider-value">{displayValue}</span> : null}
                </div>
                {helperText ? (
                    <div id={helperId} className={cn('datavisool-range-slider-helper', status !== 'default' && `datavisool-range-slider-helper-${status}`)}>
                        {helperText}
                    </div>
                ) : null}
            </div>
        </UIContainer>
    );
}

function normalizeRange(value: number[] | undefined, min: number, max: number, step: number): RangeValue {
    const start = value?.[0] ?? min;
    const end = value?.[1] ?? max;
    const normalizedStart = snapValue(clamp(start, min, max), min, max, step);
    const normalizedEnd = snapValue(clamp(end, min, max), min, max, step);
    return normalizedStart <= normalizedEnd ? [normalizedStart, normalizedEnd] : [normalizedEnd, normalizedStart];
}

function setRangeIndex(value: RangeValue, index: number, nextValue: number, min: number, max: number, step: number): RangeValue {
    const normalizedValue = snapValue(clamp(nextValue, min, max), min, max, step);
    if (index === 0)
        return [Math.min(normalizedValue, value[1]), value[1]];
    return [value[0], Math.max(normalizedValue, value[0])];
}

function findClosestThumb(value: RangeValue, nextValue: number, preferredIndex: number) {
    const startDistance = Math.abs(value[0] - nextValue);
    const endDistance = Math.abs(value[1] - nextValue);

    if (startDistance === endDistance)
        return preferredIndex;
    return startDistance < endDistance ? 0 : 1;
}

function rangesEqual(left?: RangeValue, right?: RangeValue) {
    return Boolean(left && right && left[0] === right[0] && left[1] === right[1]);
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
