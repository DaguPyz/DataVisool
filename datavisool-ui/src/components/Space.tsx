/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';

export type SpaceSize = 'small' | 'middle' | 'large' | number | [number, number];

export interface SpaceProps {
    children?: React.ReactNode;
    direction?: 'horizontal' | 'vertical';
    size?: SpaceSize;
    wrap?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

const presetSizeMap = {
    small: 8,
    middle: 16,
    large: 24,
};

function resolveGap(size: SpaceSize = 'small') {
    if (Array.isArray(size))
        return `${size[1]}px ${size[0]}px`;
    if (typeof size === 'number')
        return size;
    return presetSizeMap[size];
}

export function Space(props: SpaceProps) {
    const {
        children,
        direction = 'horizontal',
        size = 'small',
        wrap,
        className,
        style,
    } = props;

    return (
        <div
            className={cn(
                'datavisool-space',
                `datavisool-space-${direction}`,
                wrap && 'datavisool-space-wrap',
                className,
            )}
            style={{gap: resolveGap(size), ...style}}
        >
            {children}
        </div>
    );
}
