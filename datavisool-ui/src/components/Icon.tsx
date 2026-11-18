/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
    strokeWidth?: number | string;
    title?: string;
}

function IconBase({size = 16, strokeWidth = 2, className, title, children, ...props}: IconProps) {
    const labelled = title ? {'aria-label': title} : {'aria-hidden': true};

    return (
        <svg
            {...props}
            {...labelled}
            className={cn('datavisool-icon', className)}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
        >
            {title ? <title>{title}</title> : null}
            {children}
        </svg>
    );
}

export function IconX(props: IconProps) {
    return <IconBase {...props}><path d="M6 6l12 12M18 6L6 18"/></IconBase>;
}

export function IconPlus(props: IconProps) {
    return <IconBase {...props}><path d="M12 5v14M5 12h14"/></IconBase>;
}

export function IconMinus(props: IconProps) {
    return <IconBase {...props}><path d="M5 12h14"/></IconBase>;
}

export function IconChevronRight(props: IconProps) {
    return <IconBase {...props}><path d="M9 6l6 6-6 6"/></IconBase>;
}

export function IconChevronLeft(props: IconProps) {
    return <IconBase {...props}><path d="M15 6l-6 6 6 6"/></IconBase>;
}

export function IconChevronDown(props: IconProps) {
    return <IconBase {...props}><path d="M6 9l6 6 6-6"/></IconBase>;
}

export function IconInfo(props: IconProps) {
    return (
        <IconBase {...props}>
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 11v5"/>
            <path d="M12 8h.01"/>
        </IconBase>
    );
}

export function IconMaximize(props: IconProps) {
    return (
        <IconBase {...props}>
            <path d="M8 4H4v4"/>
            <path d="M16 4h4v4"/>
            <path d="M20 16v4h-4"/>
            <path d="M8 20H4v-4"/>
        </IconBase>
    );
}

export function IconLoader(props: IconProps) {
    return (
        <IconBase {...props}>
            <path d="M21 12a9 9 0 1 1-5.4-8.24"/>
        </IconBase>
    );
}

export function IconAlertCircle(props: IconProps) {
    return (
        <IconBase {...props}>
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v6"/>
            <path d="M12 17h.01"/>
        </IconBase>
    );
}

export function IconCheckCircle(props: IconProps) {
    return (
        <IconBase {...props}>
            <circle cx="12" cy="12" r="9"/>
            <path d="M8 12.5l2.6 2.6L16 9.8"/>
        </IconBase>
    );
}

export function IconXCircle(props: IconProps) {
    return (
        <IconBase {...props}>
            <circle cx="12" cy="12" r="9"/>
            <path d="M9 9l6 6M15 9l-6 6"/>
        </IconBase>
    );
}

export function IconImagePlus(props: IconProps) {
    return (
        <IconBase {...props}>
            <rect x="4" y="5" width="16" height="14" rx="2"/>
            <circle cx="9" cy="10" r="1.5"/>
            <path d="M7 17l4-4 3 3 2-2 3 3"/>
            <path d="M17 7v4M15 9h4"/>
        </IconBase>
    );
}

export function IconTrash(props: IconProps) {
    return (
        <IconBase {...props}>
            <path d="M5 7h14"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M8 7l1-3h6l1 3"/>
            <path d="M7 7l1 13h8l1-13"/>
        </IconBase>
    );
}
