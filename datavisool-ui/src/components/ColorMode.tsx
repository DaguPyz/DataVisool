/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {useControllable} from './hooks';
import {ColorPicker, ColorPickerMode} from './ColorPicker';
import {ColorsPicker} from './ColorsPicker';
import {buildStyle, splitControlStyleProps} from './style';

export type ColorModeType = 'single' | 'multi';

export interface ColorModeProps extends UIContainerProps {
    value?: string | string[];
    defaultValue?: string | string[];
    modes?: Array<ColorPickerMode>;
    disabled?: boolean;
    showText?: boolean;
    maxCount?: number;
    minCount?: number;
    addColor?: string;
    onChange?: (value: string | string[]) => void;
}

const DEFAULT_SINGLE_COLOR = '#3b82ff';
const DEFAULT_MULTI_COLORS = ['#3b82ff', '#ec4899'];

const colorModeOptions: Array<{label: string; value: ColorModeType; description: string}> = [
    {label: '单色', value: 'single', description: '单一颜色或渐变'},
    {label: '多色', value: 'multi', description: '多个颜色序列'},
];

export function ColorMode(props: ColorModeProps) {
    const t = useDataVisoolUITranslate();
    const generatedId = React.useId();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue,
        modes,
        disabled,
        showText = true,
        maxCount,
        minCount,
        addColor,
        onChange,
        ...containerProps
    } = restProps as ColorModeProps;
    const [finalValue, setFinalValue, controlled] = useControllable<string | string[]>(value, defaultValue ?? DEFAULT_SINGLE_COLOR);
    const [mode, setMode] = React.useState<ColorModeType>(getModeFromValue(finalValue));

    React.useEffect(() => {
        setMode(getModeFromValue(finalValue));
    }, [finalValue]);

    const update = (next: string | string[]) => {
        if (disabled)
            return;
        if (!controlled)
            setFinalValue(next);
        onChange?.(next);
    };

    const changeMode = (nextMode: ColorModeType) => {
        if (disabled || nextMode === mode)
            return;

        const nextValue = nextMode === 'single' ? toSingleValue(finalValue) : toMultiValue(finalValue);
        setMode(nextMode);
        update(nextValue);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentMode: ColorModeType) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
            return;

        event.preventDefault();
        changeMode(currentMode === 'single' ? 'multi' : 'single');
    };

    const singleValue = toSingleValue(finalValue);
    const multiValue = toMultiValue(finalValue);
    const summary = mode === 'single' ? t('当前使用单色配置') : t('当前使用 {count} 个颜色', {count: multiValue.length});

    return (
        <UIContainer {...containerProps}>
            <div
                className={cn('datavisool-color-mode', disabled && 'datavisool-color-mode-disabled', styleProps.controlClassName)}
                data-disabled={disabled ? 'true' : undefined}
                style={buildStyle(styleProps, styleProps.controlStyle)}
            >
                <div className="datavisool-color-mode-header">
                    <div
                        id={`${generatedId}-mode`}
                        role="radiogroup"
                        aria-label={t('颜色配置模式')}
                        aria-disabled={disabled || undefined}
                        className="datavisool-color-mode-tabs"
                    >
                        {colorModeOptions.map((option) => {
                            const selected = mode === option.value;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    title={t(option.description)}
                                    disabled={disabled}
                                    className={cn('datavisool-color-mode-tab', selected && 'datavisool-color-mode-tab-active')}
                                    onClick={() => changeMode(option.value)}
                                    onKeyDown={(event) => handleKeyDown(event, option.value)}
                                >
                                    <span className={cn('datavisool-color-mode-tab-icon', `datavisool-color-mode-tab-icon-${option.value}`)} aria-hidden="true">
                                        <span/>
                                        <span/>
                                    </span>
                                    <span className="datavisool-color-mode-tab-text">{t(option.label)}</span>
                                </button>
                            );
                        })}
                    </div>
                    <span className="datavisool-color-mode-summary">{summary}</span>
                </div>
                {mode === 'single' ? (
                    <ColorPicker value={singleValue} modes={modes} showText={showText} disabled={disabled} onChange={update}/>
                ) : (
                    <ColorsPicker
                        value={multiValue}
                        modes={modes}
                        canAdd
                        disabled={disabled}
                        showText={showText}
                        maxCount={maxCount}
                        minCount={minCount}
                        addColor={addColor}
                        onChange={update}
                    />
                )}
            </div>
        </UIContainer>
    );
}

function getModeFromValue(value?: string | string[]): ColorModeType {
    return Array.isArray(value) ? 'multi' : 'single';
}

function toSingleValue(value?: string | string[]) {
    if (Array.isArray(value))
        return value[0] ?? DEFAULT_SINGLE_COLOR;
    return value || DEFAULT_SINGLE_COLOR;
}

function toMultiValue(value?: string | string[]) {
    if (Array.isArray(value))
        return value.length ? value : [...DEFAULT_MULTI_COLORS];
    return [value || DEFAULT_MULTI_COLORS[0], DEFAULT_MULTI_COLORS[1]];
}
