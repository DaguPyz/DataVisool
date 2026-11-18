/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {IconLoader} from './Icon';
import {buildStyle, DataVisoolStyleProps} from './style';

export type LoadingSize = 'sm' | 'md' | 'lg';
export type LoadingVariant = 'plain' | 'panel' | 'overlay' | 'screen';

export interface LoadingProps extends DataVisoolStyleProps {
    className?: string;
    indicatorClassName?: string;
    indicatorStyle?: React.CSSProperties;
    children?: React.ReactNode;
    tip?: React.ReactNode;
    description?: React.ReactNode;
    size?: LoadingSize;
    variant?: LoadingVariant;
    spinning?: boolean;
    fullscreen?: boolean;
    blur?: boolean;
}

export function Loading(props: LoadingProps) {
    const t = useDataVisoolUITranslate();
    const {
        className,
        indicatorClassName,
        indicatorStyle,
        children,
        tip = t('加载中'),
        description,
        size = 'md',
        variant = children ? 'overlay' : 'panel',
        spinning = true,
        fullscreen,
        blur = true,
        ...styleProps
    } = props;
    const resolvedVariant: LoadingVariant = fullscreen ? 'screen' : variant;
    const hasChildren = children !== undefined;
    const containerStyle = buildStyle({width: '100%', minHeight: hasChildren ? undefined : 96, ...styleProps});

    const indicator = spinning ? (
        <div
            className={cn('datavisool-loading-indicator', `datavisool-loading-size-${size}`, indicatorClassName)}
            style={indicatorStyle}
            role="status"
            aria-live="polite"
        >
            <span className="datavisool-loading-orbit" aria-hidden="true">
                <IconLoader className="datavisool-loading-spinner"/>
            </span>
            <span className="datavisool-loading-copy">
                {tip ? <span className="datavisool-loading-tip">{tip}</span> : null}
                {description ? <span className="datavisool-loading-description">{description}</span> : null}
            </span>
        </div>
    ) : null;

    if (hasChildren) {
        return (
            <div
                className={cn('datavisool-loading-host', spinning && 'datavisool-loading-host-active', className)}
                style={containerStyle}
                aria-busy={spinning ? true : undefined}
            >
                <div className="datavisool-loading-content">{children}</div>
                {spinning ? (
                    <div className={cn('datavisool-loading-layer', `datavisool-loading-variant-${resolvedVariant}`, blur && 'datavisool-loading-blur')}>
                        {indicator}
                    </div>
                ) : null}
            </div>
        );
    }

    if (!spinning)
        return null;

    return (
        <div
            className={cn('datavisool-loading', `datavisool-loading-variant-${resolvedVariant}`, className)}
            style={containerStyle}
            aria-busy="true"
        >
            {indicator}
        </div>
    );
}
