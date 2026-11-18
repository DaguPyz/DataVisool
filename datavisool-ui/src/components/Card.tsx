/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {buildStyle, DataVisoolStyleProps} from './style';

export interface CardProps extends DataVisoolStyleProps {
    title?: React.ReactNode;
    extra?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    headerClassName?: string;
    bodyClassName?: string;
    bodyStyle?: React.CSSProperties;
    bordered?: boolean;
}

export function Card(props: CardProps) {
    const {
        title,
        extra,
        children,
        className,
        headerClassName,
        bodyClassName,
        bodyStyle,
        bordered = true,
        ...styleProps
    } = props;
    const hasHeader = title || extra;

    return (
        <section
            className={cn('datavisool-card', bordered && 'datavisool-card-bordered', className)}
            style={buildStyle(styleProps)}
        >
            {hasHeader ? (
                <header className={cn('datavisool-card-head', headerClassName)}>
                    <div className="datavisool-card-head-title">{title}</div>
                    {extra ? <div className="datavisool-card-extra">{extra}</div> : null}
                </header>
            ) : null}
            <div className={cn('datavisool-card-body', bodyClassName)} style={bodyStyle}>
                {children}
            </div>
        </section>
    );
}
