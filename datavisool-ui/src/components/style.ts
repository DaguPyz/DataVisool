/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {CSSProperties} from 'react';

export interface DataVisoolStyleProps {
    style?: CSSProperties;
    width?: CSSProperties['width'];
    height?: CSSProperties['height'];
    minWidth?: CSSProperties['minWidth'];
    maxWidth?: CSSProperties['maxWidth'];
    minHeight?: CSSProperties['minHeight'];
    maxHeight?: CSSProperties['maxHeight'];
    background?: CSSProperties['background'];
    backgroundColor?: CSSProperties['backgroundColor'];
    border?: CSSProperties['border'];
    borderColor?: CSSProperties['borderColor'];
    borderRadius?: CSSProperties['borderRadius'];
    borderStyle?: CSSProperties['borderStyle'];
    borderWidth?: CSSProperties['borderWidth'];
    boxShadow?: CSSProperties['boxShadow'];
    color?: CSSProperties['color'];
    fontFamily?: CSSProperties['fontFamily'];
    fontSize?: CSSProperties['fontSize'];
    fontWeight?: CSSProperties['fontWeight'];
    letterSpacing?: CSSProperties['letterSpacing'];
    lineHeight?: CSSProperties['lineHeight'];
    margin?: CSSProperties['margin'];
    padding?: CSSProperties['padding'];
    opacity?: CSSProperties['opacity'];
}

export interface DataVisoolControlStyleProps extends DataVisoolStyleProps {
    controlClassName?: string;
    controlStyle?: CSSProperties;
}

const styleKeys = new Set([
    'style',
    'width',
    'height',
    'minWidth',
    'maxWidth',
    'minHeight',
    'maxHeight',
    'background',
    'backgroundColor',
    'border',
    'borderColor',
    'borderRadius',
    'borderStyle',
    'borderWidth',
    'boxShadow',
    'color',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'margin',
    'padding',
    'opacity',
    'controlClassName',
    'controlStyle',
]);

export function buildStyle(props: DataVisoolStyleProps = {}, extra?: CSSProperties): CSSProperties | undefined {
    const style: CSSProperties = {
        width: props.width,
        height: props.height,
        minWidth: props.minWidth,
        maxWidth: props.maxWidth,
        minHeight: props.minHeight,
        maxHeight: props.maxHeight,
        background: props.background,
        backgroundColor: props.backgroundColor,
        border: props.border,
        borderColor: props.borderColor,
        borderRadius: props.borderRadius,
        borderStyle: props.borderStyle,
        borderWidth: props.borderWidth,
        boxShadow: props.boxShadow,
        color: props.color,
        fontFamily: props.fontFamily,
        fontSize: props.fontSize,
        fontWeight: props.fontWeight,
        letterSpacing: props.letterSpacing,
        lineHeight: props.lineHeight,
        margin: props.margin,
        padding: props.padding,
        opacity: props.opacity,
        ...props.style,
        ...extra,
    };
    Object.keys(style).forEach((key) => {
        if (style[key as keyof CSSProperties] === undefined)
            delete style[key as keyof CSSProperties];
    });
    return Object.keys(style).length > 0 ? style : undefined;
}

export function splitControlStyleProps<T extends Record<string, unknown>>(props: T) {
    const styleProps: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};

    Object.entries(props).forEach(([key, value]) => {
        if (styleKeys.has(key))
            styleProps[key] = value;
        else
            rest[key] = value;
    });

    return [styleProps as DataVisoolControlStyleProps, rest as Omit<T, keyof DataVisoolControlStyleProps>] as const;
}
