/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {buildStyle, DataVisoolStyleProps} from './style';

type FrameLayoutVariant = 'default' | 'surface' | 'plain';
type FrameLayoutDensity = 'compact' | 'comfortable';
type FrameLayoutScrollMode = 'none' | 'auto';

export interface FrameLayoutProps extends DataVisoolStyleProps {
    header?: React.ReactNode;
    footer?: React.ReactNode;
    left?: React.ReactNode;
    right?: React.ReactNode;
    content?: React.ReactNode;
    children?: React.ReactNode;
    variant?: FrameLayoutVariant;
    density?: FrameLayoutDensity;
    headerHeight?: React.CSSProperties['height'];
    footerHeight?: React.CSSProperties['height'];
    leftWidth?: React.CSSProperties['width'];
    rightWidth?: React.CSSProperties['width'];
    leftCollapsed?: boolean;
    rightCollapsed?: boolean;
    contentScroll?: FrameLayoutScrollMode;
    sideScroll?: FrameLayoutScrollMode;
    responsive?: boolean;
    safeArea?: boolean;
    mainRole?: React.AriaRole;
    ariaLabel?: string;
    headerAriaLabel?: string;
    footerAriaLabel?: string;
    leftAriaLabel?: string;
    rightAriaLabel?: string;
    contentAriaLabel?: string;
    headerClassName?: string;
    headerStyle?: React.CSSProperties;
    footerClassName?: string;
    footerStyle?: React.CSSProperties;
    leftClassName?: string;
    leftStyle?: React.CSSProperties;
    rightClassName?: string;
    rightStyle?: React.CSSProperties;
    contentClassName?: string;
    contentStyle?: React.CSSProperties;
    mainClassName?: string;
    mainStyle?: React.CSSProperties;
    bodyClassName?: string;
    bodyStyle?: React.CSSProperties;
    className?: string;
}

export function FrameLayout(props: FrameLayoutProps) {
    const t = useDataVisoolUITranslate();
    const {
        header,
        footer,
        left,
        right,
        content,
        children,
        variant = 'default',
        density = 'comfortable',
        headerHeight,
        footerHeight,
        leftWidth,
        rightWidth,
        leftCollapsed,
        rightCollapsed,
        contentScroll = 'none',
        sideScroll = 'auto',
        responsive = true,
        safeArea,
        mainRole = 'main',
        ariaLabel,
        headerAriaLabel,
        footerAriaLabel,
        leftAriaLabel,
        rightAriaLabel,
        contentAriaLabel,
        headerClassName,
        headerStyle,
        footerClassName,
        footerStyle,
        leftClassName,
        leftStyle,
        rightClassName,
        rightStyle,
        contentClassName,
        contentStyle,
        mainClassName,
        mainStyle,
        bodyClassName,
        bodyStyle,
        className,
    } = props;
    const hasLeft = Boolean(left && !leftCollapsed);
    const hasRight = Boolean(right && !rightCollapsed);
    const contentNode = content ?? children;
    const frameStyle: React.CSSProperties = {
        '--datavisool-frame-header-height': toCssSize(headerHeight),
        '--datavisool-frame-footer-height': toCssSize(footerHeight),
        '--datavisool-frame-left-width': toCssSize(leftWidth),
        '--datavisool-frame-right-width': toCssSize(rightWidth),
        ...buildStyle(props),
    } as React.CSSProperties;

    return (
        <div
            className={cn(
                'datavisool-frame-layout',
                `datavisool-frame-layout-variant-${variant}`,
                `datavisool-frame-layout-density-${density}`,
                responsive && 'datavisool-frame-layout-responsive',
                safeArea && 'datavisool-frame-layout-safe',
                className,
            )}
            aria-label={ariaLabel}
            style={frameStyle}
        >
            {header ? (
                <header className={cn('datavisool-frame-header', headerClassName)} aria-label={headerAriaLabel} style={headerStyle}>
                    {header}
                </header>
            ) : null}
            <div className={cn('datavisool-frame-body', bodyClassName)} style={bodyStyle}>
                {hasLeft ? (
                    <aside
                        className={cn('datavisool-frame-side datavisool-frame-left', sideScroll === 'auto' && 'datavisool-frame-region-scroll', leftClassName)}
                        aria-label={leftAriaLabel ?? t('左侧区域')}
                        style={leftStyle}
                    >
                        {left}
                    </aside>
                ) : null}
                <main className={cn('datavisool-frame-main', mainClassName)} role={mainRole} style={mainStyle}>
                    <div className="datavisool-frame-main-body">
                        <div
                            className={cn('datavisool-frame-content', contentScroll === 'auto' && 'datavisool-frame-region-scroll', contentClassName)}
                            aria-label={contentAriaLabel}
                            style={contentStyle}
                        >
                            {contentNode}
                        </div>
                        {hasRight ? (
                            <aside
                                className={cn('datavisool-frame-side datavisool-frame-right', sideScroll === 'auto' && 'datavisool-frame-region-scroll', rightClassName)}
                                aria-label={rightAriaLabel ?? t('右侧区域')}
                                style={rightStyle}
                            >
                                {right}
                            </aside>
                        ) : null}
                    </div>
                    {footer ? (
                        <footer className={cn('datavisool-frame-footer', footerClassName)} aria-label={footerAriaLabel} style={footerStyle}>
                            {footer}
                        </footer>
                    ) : null}
                </main>
            </div>
        </div>
    );
}

function toCssSize(value: React.CSSProperties['width'] | undefined): string | undefined {
    if (value === undefined || value === null)
        return undefined;
    return typeof value === 'number' ? `${value}px` : String(value);
}
