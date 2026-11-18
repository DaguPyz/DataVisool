/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {buildStyle, DataVisoolStyleProps, splitControlStyleProps} from './style';

export type ProgressStatus = 'normal' | 'active' | 'success' | 'exception';

export interface ProgressProps extends DataVisoolStyleProps {
    percent?: number;
    status?: ProgressStatus;
    showInfo?: boolean;
    className?: string;
    format?: (percent: number) => React.ReactNode;
}

function normalizePercent(percent?: number) {
    if (!Number.isFinite(percent))
        return 0;
    return Math.min(Math.max(Math.round(percent ?? 0), 0), 100);
}

export function Progress(props: ProgressProps) {
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        percent,
        status = 'normal',
        showInfo = true,
        className,
        format,
    } = restProps as ProgressProps;
    const normalizedPercent = normalizePercent(percent);

    return (
        <div
            className={cn('datavisool-progress', `datavisool-progress-status-${status}`, className)}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={normalizedPercent}
            style={buildStyle(styleProps)}
        >
            <div className="datavisool-progress-track">
                <div className="datavisool-progress-bar" style={{width: `${normalizedPercent}%`}}/>
            </div>
            {showInfo ? (
                <span className="datavisool-progress-info">
                    {format ? format(normalizedPercent) : `${normalizedPercent}%`}
                </span>
            ) : null}
        </div>
    );
}
