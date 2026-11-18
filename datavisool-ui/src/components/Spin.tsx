/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {IconLoader} from './Icon';

export interface SpinProps {
    spinning?: boolean;
    size?: 'small' | 'default' | 'large';
    className?: string;
    style?: React.CSSProperties;
}

export function Spin(props: SpinProps) {
    const t = useDataVisoolUITranslate();
    const {
        spinning = true,
        size = 'default',
        className,
        style,
    } = props;

    if (!spinning)
        return null;

    return (
        <span
            className={cn('datavisool-spin', `datavisool-spin-size-${size}`, className)}
            style={style}
            role="status"
            aria-live="polite"
            aria-label={t('加载中')}
        >
            <IconLoader className="datavisool-spin-icon" aria-hidden="true"/>
        </span>
    );
}
