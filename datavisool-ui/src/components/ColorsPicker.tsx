/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {useControllable} from './hooks';
import {ColorPicker, ColorPickerMode} from './ColorPicker';
import {IconPlus, IconX} from './Icon';
import {buildStyle, splitControlStyleProps} from './style';

export interface ColorsPickerProp extends UIContainerProps {
    value?: string[];
    defaultValue?: string[];
    canAdd?: boolean;
    disabled?: boolean;
    showText?: boolean;
    maxCount?: number;
    minCount?: number;
    addColor?: string;
    onChange?: (data: string[]) => void;
    modes?: Array<ColorPickerMode>;
}

const DEFAULT_COLORS = ['#3b82ff'];
const DEFAULT_ADD_COLOR = '#a8b3cf';
const DEFAULT_MAX_COUNT = 5;

export function ColorsPicker(props: ColorsPickerProp) {
    const t = useDataVisoolUITranslate();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue,
        canAdd,
        disabled,
        showText,
        maxCount = DEFAULT_MAX_COUNT,
        minCount = 0,
        addColor = DEFAULT_ADD_COLOR,
        onChange,
        modes,
        ...containerProps
    } = restProps as ColorsPickerProp;
    const [finalValue, setFinalValue, controlled] = useControllable<string[]>(value, defaultValue ?? DEFAULT_COLORS);
    const colors = finalValue ?? [];
    const safeMaxCount = Math.max(1, Math.floor(maxCount));
    const safeMinCount = Math.max(0, Math.min(Math.floor(minCount), safeMaxCount));
    const canAddColor = Boolean(canAdd && !disabled && colors.length < safeMaxCount);
    const canRemoveColor = !disabled && colors.length > safeMinCount;

    const update = (next: string[]) => {
        if (disabled)
            return;
        if (!controlled)
            setFinalValue(next);
        onChange?.(next);
    };

    const updateColor = (index: number, nextColor: string) => {
        update(colors.map((color, colorIndex) => colorIndex === index ? nextColor : color));
    };

    const addNextColor = () => {
        if (!canAddColor)
            return;
        update([...colors, addColor]);
    };

    const removeColor = (index: number) => {
        if (!canRemoveColor)
            return;
        update(colors.filter((_, colorIndex) => colorIndex !== index));
    };

    return (
        <UIContainer {...containerProps}>
            <div
                className={cn('datavisool-colors-picker', disabled && 'datavisool-colors-picker-disabled', styleProps.controlClassName)}
                data-disabled={disabled ? 'true' : undefined}
                style={buildStyle(styleProps, styleProps.controlStyle)}
            >
                <div className="datavisool-colors-picker-preview" aria-hidden="true">
                    {colors.length ? colors.map((color, index) => (
                        <span key={index} className="datavisool-colors-picker-preview-segment" style={{background: color}}/>
                    )) : <span className="datavisool-colors-picker-preview-empty"/>}
                </div>
                <div className="datavisool-colors-picker-list" role="list" aria-label={t('多色选择')}>
                    {colors.map((color, index) => (
                        <div key={index} className="datavisool-colors-picker-item" role="listitem">
                            <span className="datavisool-colors-picker-index">{index + 1}</span>
                            <ColorPicker value={color} modes={modes} showText={showText} disabled={disabled} onChange={(nextColor) => updateColor(index, nextColor)}/>
                            <button
                                type="button"
                                className="datavisool-colors-picker-remove"
                                disabled={!canRemoveColor}
                                aria-label={t('删除颜色 {index}', {index: index + 1})}
                                title={t('删除颜色')}
                                onClick={() => removeColor(index)}
                            >
                                <IconX size={14}/>
                            </button>
                        </div>
                    ))}
                    {canAdd ? (
                        <button
                            type="button"
                            className="datavisool-colors-picker-add"
                            disabled={!canAddColor}
                            aria-label={t('添加颜色')}
                            title={colors.length >= safeMaxCount ? t('最多 {count} 个颜色', {count: safeMaxCount}) : t('添加颜色')}
                            onClick={addNextColor}
                        >
                            <IconPlus size={16}/>
                        </button>
                    ) : null}
                </div>
            </div>
        </UIContainer>
    );
}
