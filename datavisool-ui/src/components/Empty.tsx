/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {buildStyle, DataVisoolStyleProps} from './style';

export type EmptySize = 'sm' | 'md' | 'lg';
export type EmptyVariant = 'plain' | 'panel' | 'compact';

export interface EmptyProps extends DataVisoolStyleProps {
    className?: string;
    title?: React.ReactNode;
    description?: React.ReactNode;
    image?: string | React.ReactNode;
    imageAlt?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
    size?: EmptySize;
    variant?: EmptyVariant;
}

const defaultVisual = (
    <span className="datavisool-empty-default-visual" aria-hidden="true">
        <span className="datavisool-empty-default-card datavisool-empty-default-card-back"/>
        <span className="datavisool-empty-default-card datavisool-empty-default-card-front">
            <span/>
            <span/>
            <span/>
        </span>
    </span>
);

export function Empty(props: EmptyProps) {
    const t = useDataVisoolUITranslate();
    const {
        className,
        title = t('暂无数据'),
        description,
        image,
        imageAlt = '',
        icon,
        action,
        children,
        size = 'md',
        variant = 'plain',
        ...styleProps
    } = props;
    const visual = image ? (
        typeof image === 'string' ? (
            <img className="datavisool-empty-image" src={image} alt={imageAlt}/>
        ) : image
    ) : icon ? (
        icon
    ) : defaultVisual;
    const hasAction = action || children;
    const containerStyle = buildStyle({
        minHeight: variant === 'compact' ? 96 : 160,
        ...styleProps,
    });

    return (
        <div
            className={cn(
                'datavisool-empty',
                `datavisool-empty-size-${size}`,
                `datavisool-empty-variant-${variant}`,
                className,
            )}
            style={containerStyle}
        >
            <div className="datavisool-empty-visual" aria-hidden={imageAlt ? undefined : true}>
                {visual}
            </div>
            {title || description ? (
                <div className="datavisool-empty-copy">
                    {title ? <div className="datavisool-empty-title">{title}</div> : null}
                    {description ? <div className="datavisool-empty-description">{description}</div> : null}
                </div>
            ) : null}
            {hasAction ? <div className="datavisool-empty-actions">{action}{children}</div> : null}
        </div>
    );
}
