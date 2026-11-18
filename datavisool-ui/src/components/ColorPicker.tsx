/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {createPortal} from 'react-dom';
import {cn} from '@/lib/utils';
import {IconPlus, IconTrash} from './Icon';
import {UIContainer, UIContainerProps} from './UIContainer';
import {useControllable} from './hooks';
import {buildStyle, splitControlStyleProps} from './style';

export type ColorPickerMode = 'single' | 'linear' | 'mirror' | 'radial';

type ActiveColorPickerMode = 'single' | 'linear' | 'radial';

interface ColorStop {
    color: string;
    position: number;
}

interface ParsedColorValue {
    mode: ActiveColorPickerMode;
    angle: number;
    stops: ColorStop[];
}

interface ParsedCssColor {
    hex: string;
    alpha: number;
}

export interface ColorPickerProps extends UIContainerProps {
    value?: string;
    defaultValue?: string;
    modes?: Array<ColorPickerMode>;
    showText?: boolean;
    disabled?: boolean;
    onChange?: (color: string) => void;
}

const DEFAULT_START_COLOR = '#3b82ff';
const DEFAULT_END_COLOR = '#ec4899';
const DEFAULT_ANGLE = 90;
const DEFAULT_MODES: ActiveColorPickerMode[] = ['single', 'linear', 'radial'];
const MIN_GRADIENT_STOPS = 2;
const TRANSPARENCY_GRID = [
    'linear-gradient(45deg, rgba(168, 179, 207, 0.22) 25%, transparent 25%)',
    'linear-gradient(-45deg, rgba(168, 179, 207, 0.22) 25%, transparent 25%)',
    'linear-gradient(45deg, transparent 75%, rgba(168, 179, 207, 0.22) 75%)',
    'linear-gradient(-45deg, transparent 75%, rgba(168, 179, 207, 0.22) 75%)',
].join(', ');

const colorModeOptions: Array<{label: string; value: ActiveColorPickerMode}> = [
    {label: '单色', value: 'single'},
    {label: '渐变', value: 'linear'},
    {label: '径向', value: 'radial'},
];

export function ColorPicker(props: ColorPickerProps) {
    const t = useDataVisoolUITranslate();
    const rootRef = React.useRef<HTMLDivElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const railRef = React.useRef<HTMLDivElement>(null);
    const [open, setOpen] = React.useState(false);
    const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>();
    const [selectedStopIndex, setSelectedStopIndex] = React.useState(0);
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {value, defaultValue, modes, showText, disabled, onChange, ...containerProps} = restProps as ColorPickerProps;
    const [finalValue, setFinalValue, controlled] = useControllable<string>(value, defaultValue ?? DEFAULT_START_COLOR);
    const parsedValue = parseColorValue(finalValue ?? DEFAULT_START_COLOR);
    const enabledModes = getEnabledModes(modes);
    const activeMode = enabledModes.includes(parsedValue.mode) ? parsedValue.mode : enabledModes[0];
    const activeStops = normalizeStops(parsedValue.stops, activeMode);
    const activeConfig = {...parsedValue, mode: activeMode, stops: activeStops};
    const displayValue = buildColorValue(activeConfig);
    const selectedIndex = clamp(selectedStopIndex, 0, activeStops.length - 1);
    const selectedStop = activeStops[selectedIndex] ?? activeStops[0];
    const canEditStops = activeMode !== 'single';

    React.useEffect(() => {
        if (!open)
            return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target))
                setOpen(false);
        };

        window.document.addEventListener('pointerdown', handlePointerDown);
        return () => window.document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

    const updatePanelPosition = React.useCallback(() => {
        const root = rootRef.current;
        const panel = panelRef.current;
        if (!root || !panel || typeof window === 'undefined')
            return;

        const rect = root.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const viewportPadding = 16;
        const panelGap = 8;
        const availableWidth = Math.max(viewportWidth - viewportPadding * 2, 0);
        const panelWidth = Math.min(360, availableWidth || 360);
        const panelHeight = Math.min(panel.getBoundingClientRect().height || 0, Math.max(viewportHeight - viewportPadding * 2, 80));
        const left = Math.min(Math.max(rect.left, viewportPadding), Math.max(viewportPadding, viewportWidth - panelWidth - viewportPadding));
        const spaceBelow = Math.max(viewportHeight - rect.bottom - panelGap - viewportPadding, 0);
        const spaceAbove = Math.max(rect.top - panelGap - viewportPadding, 0);
        const openAbove = panelHeight > spaceBelow && spaceAbove > spaceBelow;
        const preferredTop = openAbove ? rect.top - panelGap - panelHeight : rect.bottom + panelGap;
        const top = Math.min(
            Math.max(preferredTop, viewportPadding),
            Math.max(viewportPadding, viewportHeight - panelHeight - viewportPadding),
        );

        setPanelStyle({
            position: 'fixed',
            top,
            left,
            width: panelWidth,
            maxHeight: Math.max(viewportHeight - viewportPadding * 2, 80),
            overflowY: 'auto',
            zIndex: 2400,
            visibility: 'visible',
        });
    }, []);

    React.useLayoutEffect(() => {
        if (!open)
            return;

        setPanelStyle((currentStyle) => ({...currentStyle, visibility: 'hidden'}));
        updatePanelPosition();
        const frame = window.requestAnimationFrame(updatePanelPosition);
        window.addEventListener('resize', updatePanelPosition);
        window.addEventListener('scroll', updatePanelPosition, true);

        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', updatePanelPosition);
            window.removeEventListener('scroll', updatePanelPosition, true);
        };
    }, [open, updatePanelPosition]);

    React.useEffect(() => {
        if (disabled)
            setOpen(false);
    }, [disabled]);

    React.useEffect(() => {
        setSelectedStopIndex((currentIndex) => clamp(currentIndex, 0, activeStops.length - 1));
    }, [activeStops.length]);

    const updateValue = (nextValue: string) => {
        if (!controlled)
            setFinalValue(nextValue);
        onChange?.(nextValue);
    };

    const updateConfig = (nextConfig: ParsedColorValue, nextSelectedIndex = selectedIndex) => {
        const nextStops = normalizeStops(nextConfig.stops, nextConfig.mode);
        setSelectedStopIndex(clamp(nextSelectedIndex, 0, nextStops.length - 1));
        updateValue(buildColorValue({...nextConfig, stops: nextStops}));
    };

    const changeMode = (nextMode: ActiveColorPickerMode) => {
        if (nextMode === activeMode)
            return;
        updateConfig({...activeConfig, mode: nextMode, stops: normalizeStops(activeStops, nextMode)});
    };

    const changeSelectedColor = (nextColor: string) => {
        const nextStops = activeStops.map((stop, index) => index === selectedIndex ? {...stop, color: mergeColorAlpha(nextColor, getColorAlpha(stop.color))} : stop);
        updateConfig({...activeConfig, stops: nextStops});
    };

    const changeSelectedAlpha = (nextAlpha: number) => {
        const nextStops = activeStops.map((stop, index) => index === selectedIndex ? {...stop, color: mergeColorAlpha(stop.color, nextAlpha)} : stop);
        updateConfig({...activeConfig, stops: nextStops});
    };

    const changeAngle = (nextAngle: string) => {
        updateConfig({...activeConfig, angle: normalizeAngle(Number(nextAngle))});
    };

    const changeSelectedPosition = (nextPosition: string) => {
        updateStopPosition(selectedIndex, Number(nextPosition));
    };

    const addStop = (position = 50) => {
        if (!canEditStops || disabled)
            return;

        const nextStop = {
            color: selectedStop?.color ?? DEFAULT_END_COLOR,
            position: normalizePosition(position),
        };
        const nextStops = sortStops([...activeStops, nextStop]);
        updateConfig({...activeConfig, stops: nextStops}, nextStops.indexOf(nextStop));
    };

    const removeSelectedStop = () => {
        if (!canEditStops || activeStops.length <= MIN_GRADIENT_STOPS)
            return;

        const nextStops = activeStops.filter((_, index) => index !== selectedIndex);
        updateConfig({...activeConfig, stops: nextStops}, Math.min(selectedIndex, nextStops.length - 1));
    };

    const updateStopPosition = (stopIndex: number, nextPosition: number) => {
        if (!canEditStops || disabled)
            return;

        const targetStop = activeStops[stopIndex];
        if (!targetStop)
            return;

        const nextStop = {...targetStop, position: normalizePosition(nextPosition)};
        const nextStops = sortStops(activeStops.map((stop, index) => index === stopIndex ? nextStop : stop));
        updateConfig({...activeConfig, stops: nextStops}, nextStops.indexOf(nextStop));
    };

    const addStopFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest('.datavisool-color-picker-stop'))
            return;
        addStop(getPositionFromClientX(event.clientX, railRef.current));
    };

    const panelNode = open ? (
        <div ref={panelRef} className="datavisool-color-picker-panel" style={panelStyle} role="dialog" aria-label={t('颜色选择器')}>
            <div className="datavisool-color-picker-preview" style={getColorPreviewStyle(displayValue)}/>
            {enabledModes.length > 1 ? (
                <div className="datavisool-color-picker-tabs" role="tablist" aria-label={t('颜色模式')}>
                    {colorModeOptions.filter((option) => enabledModes.includes(option.value)).map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            role="tab"
                            aria-selected={activeMode === option.value}
                            className={cn('datavisool-color-picker-tab', activeMode === option.value && 'datavisool-color-picker-tab-active')}
                            onClick={() => changeMode(option.value)}
                        >
                            {t(option.label)}
                        </button>
                    ))}
                </div>
            ) : null}
            {canEditStops ? (
                <div className="datavisool-color-picker-gradient-editor">
                    <div
                        ref={railRef}
                        className="datavisool-color-picker-stop-rail"
                        style={getColorPreviewStyle(getStopRailBackground(activeStops))}
                        onPointerDown={addStopFromPointer}
                    >
                        {activeStops.map((stop, index) => (
                            <button
                                key={index}
                                type="button"
                                aria-label={t('选择色标 {index}', {index: index + 1})}
                                aria-pressed={index === selectedIndex}
                                className={cn('datavisool-color-picker-stop', index === selectedIndex && 'datavisool-color-picker-stop-active')}
                                style={{left: `${stop.position}%`, ...getColorPreviewStyle(stop.color)}}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedStopIndex(index);
                                }}
                                onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    if (activeStops.length > MIN_GRADIENT_STOPS)
                                        updateConfig({...activeConfig, stops: activeStops.filter((_, stopIndex) => stopIndex !== index)}, Math.max(0, index - 1));
                                }}
                                onPointerDown={(event) => {
                                    event.stopPropagation();
                                    setSelectedStopIndex(index);
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                }}
                                onPointerMove={(event) => {
                                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                                        updateStopPosition(index, getPositionFromClientX(event.clientX, railRef.current));
                                }}
                                onPointerUp={(event) => {
                                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                                        event.currentTarget.releasePointerCapture(event.pointerId);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Backspace' || event.key === 'Delete') {
                                        event.preventDefault();
                                        removeSelectedStop();
                                    }
                                }}
                            />
                        ))}
                    </div>
                </div>
            ) : null}
            <div className="datavisool-color-picker-controls">
                <ColorWell
                    label={canEditStops ? t('色标 {index}', {index: selectedIndex + 1}) : t('颜色')}
                    value={selectedStop.color}
                    disabled={disabled}
                    onChange={changeSelectedColor}
                />
                <AlphaControl
                    value={getColorAlpha(selectedStop.color)}
                    disabled={disabled}
                    onChange={changeSelectedAlpha}
                />
                {canEditStops ? (
                    <>
                        <label className="datavisool-color-picker-position">
                            <span className="datavisool-color-picker-label">{t('位置')}</span>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={selectedStop.position}
                                disabled={disabled}
                                className="datavisool-color-picker-number-input"
                                onChange={(event) => changeSelectedPosition(event.target.value)}
                            />
                        </label>
                        {activeMode === 'linear' ? (
                            <label className="datavisool-color-picker-angle">
                                <span className="datavisool-color-picker-label">{t('角度')}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={360}
                                    step={15}
                                    value={activeConfig.angle}
                                    disabled={disabled}
                                    className="datavisool-color-picker-number-input"
                                    onChange={(event) => changeAngle(event.target.value)}
                                />
                            </label>
                        ) : null}
                        <div className="datavisool-color-picker-stop-actions">
                            <button
                                type="button"
                                className="datavisool-color-picker-icon-button"
                                disabled={disabled}
                                aria-label={t('添加色标')}
                                title={t('添加色标')}
                                onClick={() => addStop(selectedStop.position)}
                            >
                                <IconPlus size={14}/>
                            </button>
                            <button
                                type="button"
                                className="datavisool-color-picker-icon-button"
                                disabled={disabled || activeStops.length <= MIN_GRADIENT_STOPS}
                                aria-label={t('删除色标')}
                                title={t('删除色标')}
                                onClick={removeSelectedStop}
                            >
                                <IconTrash size={14}/>
                            </button>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    ) : null;

    return (
        <UIContainer {...containerProps}>
            <div ref={rootRef} className={cn('datavisool-color-picker', disabled && 'datavisool-color-picker-disabled')}>
                <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn('datavisool-control datavisool-color-picker-trigger', styleProps.controlClassName)}
                    style={buildStyle(styleProps, styleProps.controlStyle)}
                    onClick={() => setOpen((nextOpen) => !nextOpen)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape')
                            setOpen(false);
                    }}
                >
                    <span className="datavisool-color-picker-swatch" style={getColorPreviewStyle(displayValue)} aria-hidden="true"/>
                    {showText ? <span className="datavisool-color-picker-value" title={displayValue}>{displayValue}</span> : null}
                    <span className="datavisool-color-picker-mode-badge">{t(colorModeOptions.find((option) => option.value === activeMode)?.label ?? '')}</span>
                </button>
                {panelNode && typeof document !== 'undefined' ? createPortal(panelNode, document.body) : null}
            </div>
        </UIContainer>
    );
}

function ColorWell(props: {label: string; value: string; disabled?: boolean; onChange: (value: string) => void}) {
    const t = useDataVisoolUITranslate();
    const parsedColor = parseCssColor(props.value);

    return (
        <label className="datavisool-color-picker-well">
            <span className="datavisool-color-picker-label">{props.label}</span>
            <span className="datavisool-color-picker-well-control">
                <span className="datavisool-color-picker-well-swatch" style={getColorPreviewStyle(props.value)} aria-hidden="true"/>
                <input
                    type="color"
                    disabled={props.disabled}
                    value={parsedColor.hex}
                    className="datavisool-color-picker-native"
                    aria-label={t('选择{label}颜色', {label: props.label})}
                    onChange={(event) => props.onChange(event.target.value)}
                />
                <span className="datavisool-color-picker-hex">{parsedColor.hex.toUpperCase()}</span>
            </span>
        </label>
    );
}

function AlphaControl(props: {value: number; disabled?: boolean; onChange: (value: number) => void}) {
    const t = useDataVisoolUITranslate();
    const alphaPercent = Math.round(props.value * 100);

    const updateAlpha = (value: string) => {
        props.onChange(clamp(Number(value) / 100, 0, 1));
    };

    return (
        <label className="datavisool-color-picker-alpha">
            <span className="datavisool-color-picker-label">{t('透明度')}</span>
            <span className="datavisool-color-picker-alpha-control">
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={alphaPercent}
                    disabled={props.disabled}
                    className="datavisool-color-picker-alpha-range"
                    aria-label={t('设置颜色透明度')}
                    onChange={(event) => updateAlpha(event.target.value)}
                />
                <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={alphaPercent}
                    disabled={props.disabled}
                    className="datavisool-color-picker-alpha-input"
                    aria-label={t('颜色透明度百分比')}
                    onChange={(event) => updateAlpha(event.target.value)}
                />
            </span>
        </label>
    );
}

function getEnabledModes(modes?: ColorPickerMode[]): ActiveColorPickerMode[] {
    const sourceModes = modes?.length ? modes : DEFAULT_MODES;
    const nextModes = sourceModes.reduce<ActiveColorPickerMode[]>((result, mode) => {
        const normalizedMode = normalizeMode(mode);
        if (!result.includes(normalizedMode))
            result.push(normalizedMode);
        return result;
    }, []);

    return nextModes.length ? nextModes : ['single'];
}

function normalizeMode(mode: ColorPickerMode): ActiveColorPickerMode {
    return mode === 'mirror' ? 'radial' : mode;
}

function parseColorValue(value: string): ParsedColorValue {
    const rawValue = String(value ?? '').trim();
    const fallbackColor = normalizeColorInput(rawValue);
    const stops = parseGradientStops(rawValue);
    const angle = extractGradientAngle(rawValue);

    if (rawValue.toLowerCase().startsWith('linear-gradient')) {
        return {
            mode: 'linear',
            angle,
            stops: stops.length ? stops : getDefaultStops(fallbackColor),
        };
    }

    if (rawValue.toLowerCase().startsWith('radial-gradient')) {
        return {
            mode: 'radial',
            angle: DEFAULT_ANGLE,
            stops: stops.length ? stops : getDefaultStops(fallbackColor),
        };
    }

    return {
        mode: 'single',
        angle: DEFAULT_ANGLE,
        stops: [{color: fallbackColor, position: 0}],
    };
}

function buildColorValue(config: ParsedColorValue): string {
    const stops = normalizeStops(config.stops, config.mode);

    if (config.mode === 'single')
        return stops[0]?.color ?? DEFAULT_START_COLOR;

    const stopText = stops.map((stop) => `${stop.color} ${stop.position}%`).join(', ');

    if (config.mode === 'radial')
        return `radial-gradient(circle, ${stopText})`;

    return `linear-gradient(${config.angle}deg, ${stopText})`;
}

function parseGradientStops(value: string): ColorStop[] {
    const gradientArgs = getGradientArgs(value);
    if (!gradientArgs.length)
        return [];

    const stopArgs = gradientArgs.filter((arg, index) => {
        if (index !== 0)
            return true;
        return !isGradientPrefix(arg);
    });

    const stops = stopArgs.map((arg, index) => parseGradientStop(arg, index, stopArgs.length)).filter((stop): stop is ColorStop => Boolean(stop));
    return sortStops(stops);
}

function getStopRailBackground(stops: ColorStop[]): string {
    return `linear-gradient(90deg, ${normalizeStops(stops, 'linear').map((stop) => `${stop.color} ${stop.position}%`).join(', ')})`;
}

function getDefaultStops(startColor = DEFAULT_START_COLOR): ColorStop[] {
    return [
        {color: startColor, position: 0},
        {color: DEFAULT_END_COLOR, position: 100},
    ];
}

function normalizeStops(stops: ColorStop[], mode: ActiveColorPickerMode): ColorStop[] {
    const normalizedStops = sortStops(stops.map((stop) => ({
        color: normalizeColorInput(stop.color),
        position: normalizePosition(stop.position),
    })));

    if (mode === 'single')
        return normalizedStops.length ? [normalizedStops[0]] : [{color: DEFAULT_START_COLOR, position: 0}];

    if (normalizedStops.length >= MIN_GRADIENT_STOPS)
        return normalizedStops;

    return getDefaultStops(normalizedStops[0]?.color ?? DEFAULT_START_COLOR);
}

function sortStops(stops: ColorStop[]): ColorStop[] {
    return [...stops].sort((first, second) => first.position - second.position);
}

function getPositionFromClientX(clientX: number, rail: HTMLDivElement | null): number {
    const rect = rail?.getBoundingClientRect();
    if (!rect || rect.width <= 0)
        return 50;

    return normalizePosition(((clientX - rect.left) / rect.width) * 100);
}

function inferStopPosition(index: number, count: number): number {
    if (count <= 1)
        return 0;
    return Math.round((index / (count - 1)) * 100);
}

function extractGradientAngle(value: string): number {
    const angleMatch = value.match(/linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg/i);
    return normalizeAngle(Number(angleMatch?.[1] ?? DEFAULT_ANGLE));
}

function normalizeColorInput(value: string): string {
    const parsedColor = parseCssColor(value);
    return formatCssColor(parsedColor.hex, parsedColor.alpha);
}

function parseCssColor(value: string): ParsedCssColor {
    const normalizedValue = String(value ?? '').trim();
    const shortHex = normalizedValue.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i);
    if (shortHex) {
        const alpha = shortHex[4] ? parseInt(`${shortHex[4]}${shortHex[4]}`, 16) / 255 : 1;
        return {
            hex: `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase(),
            alpha: normalizeAlpha(alpha),
        };
    }

    const longHex = normalizedValue.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (longHex) {
        const alpha = longHex[2] ? parseInt(longHex[2], 16) / 255 : 1;
        return {hex: `#${longHex[1]}`.toLowerCase(), alpha: normalizeAlpha(alpha)};
    }

    const rgb = normalizedValue.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) {
        const channels = rgb[1].split(/[\s,\/]+/).filter(Boolean);
        const red = normalizeColorChannel(channels[0]);
        const green = normalizeColorChannel(channels[1]);
        const blue = normalizeColorChannel(channels[2]);
        const alpha = channels[3] === undefined ? 1 : normalizeAlphaValue(channels[3]);

        return {
            hex: rgbToHex(red, green, blue),
            alpha,
        };
    }

    return {hex: DEFAULT_START_COLOR, alpha: 1};
}

function mergeColorAlpha(value: string, alpha: number): string {
    const parsedColor = parseCssColor(value);
    return formatCssColor(parsedColor.hex, alpha);
}

function getColorAlpha(value: string): number {
    return parseCssColor(value).alpha;
}

function formatCssColor(hex: string, alpha: number): string {
    const normalizedAlpha = normalizeAlpha(alpha);
    if (normalizedAlpha >= 1)
        return hex.toLowerCase();

    const {red, green, blue} = hexToRgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${formatAlpha(normalizedAlpha)})`;
}

function getColorPreviewStyle(value: string): React.CSSProperties {
    const normalizedValue = String(value ?? '').trim() || DEFAULT_START_COLOR;
    const colorLayer = normalizedValue.includes('gradient(') ? normalizedValue : `linear-gradient(${normalizedValue}, ${normalizedValue})`;

    return {
        backgroundImage: `${colorLayer}, ${TRANSPARENCY_GRID}`,
        backgroundPosition: '0 0, 0 0, 0 6px, 6px -6px, -6px 0',
        backgroundSize: 'auto, 12px 12px, 12px 12px, 12px 12px, 12px 12px',
    };
}

function getGradientArgs(value: string): string[] {
    const startIndex = value.indexOf('(');
    const endIndex = value.lastIndexOf(')');
    if (startIndex < 0 || endIndex <= startIndex)
        return [];

    return splitTopLevelCommas(value.slice(startIndex + 1, endIndex)).map((arg) => arg.trim()).filter(Boolean);
}

function splitTopLevelCommas(value: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let current = '';

    Array.from(value).forEach((char) => {
        if (char === '(')
            depth += 1;
        else if (char === ')')
            depth = Math.max(0, depth - 1);

        if (char === ',' && depth === 0) {
            result.push(current);
            current = '';
            return;
        }

        current += char;
    });

    result.push(current);
    return result;
}

function isGradientPrefix(value: string): boolean {
    const normalizedValue = value.trim().toLowerCase();
    return normalizedValue.includes('deg') || normalizedValue.includes('circle') || normalizedValue.includes('ellipse') || normalizedValue.startsWith('to ');
}

function parseGradientStop(value: string, index: number, count: number): ColorStop | undefined {
    const normalizedValue = value.trim();
    const colorMatch = normalizedValue.match(/^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]*\))/i);
    if (!colorMatch)
        return undefined;

    const positionMatch = normalizedValue.slice(colorMatch[0].length).trim().match(/^(-?\d+(?:\.\d+)?)%/);
    return {
        color: normalizeColorInput(colorMatch[0]),
        position: normalizePosition(Number(positionMatch?.[1] ?? inferStopPosition(index, count))),
    };
}

function hexToRgb(hex: string): {red: number; green: number; blue: number} {
    const normalizedHex = parseCssColor(hex).hex.slice(1);
    return {
        red: parseInt(normalizedHex.slice(0, 2), 16),
        green: parseInt(normalizedHex.slice(2, 4), 16),
        blue: parseInt(normalizedHex.slice(4, 6), 16),
    };
}

function rgbToHex(red: number, green: number, blue: number): string {
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeColorChannel(value?: string): number {
    const numericValue = Number(String(value ?? '0').replace('%', ''));
    if (!Number.isFinite(numericValue))
        return 0;
    if (String(value).includes('%'))
        return clamp(Math.round((numericValue / 100) * 255), 0, 255);
    return clamp(Math.round(numericValue), 0, 255);
}

function normalizeAlphaValue(value: string): number {
    const numericValue = Number(value.replace('%', ''));
    if (!Number.isFinite(numericValue))
        return 1;
    if (value.includes('%'))
        return normalizeAlpha(numericValue / 100);
    return normalizeAlpha(numericValue);
}

function normalizeAlpha(value: number): number {
    if (!Number.isFinite(value))
        return 1;
    return clamp(value, 0, 1);
}

function formatAlpha(value: number): string {
    return String(Number(value.toFixed(2)));
}

function normalizeAngle(value: number): number {
    if (!Number.isFinite(value))
        return DEFAULT_ANGLE;
    return clamp(Math.round(value), 0, 360);
}

function normalizePosition(value: number): number {
    if (!Number.isFinite(value))
        return 0;
    return clamp(Math.round(value), 0, 100);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
