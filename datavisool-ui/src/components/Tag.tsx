/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';

export interface TagProps {
    children?: React.ReactNode;
    color?: string;
    bordered?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

const presetColors = new Set(['blue', 'purple', 'gold', 'green', 'cyan', 'processing', 'success', 'warning', 'default']);

export function Tag(props: TagProps) {
    const {
        children,
        color = 'default',
        bordered = true,
        className,
        style,
    } = props;
    const isPreset = presetColors.has(color);
    const customStyle = isPreset ? style : {
        borderColor: color,
        color,
        ...style,
    };

    return (
        <span
            className={cn(
                'datavisool-tag',
                bordered && 'datavisool-tag-bordered',
                isPreset && `datavisool-tag-color-${color}`,
                className,
            )}
            style={customStyle}
        >
            {children}
        </span>
    );
}
