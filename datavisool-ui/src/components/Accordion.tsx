/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {useControllable} from './hooks';
import {IconChevronDown, IconInfo} from './Icon';
import {buildStyle, DataVisoolStyleProps} from './style';

type AccordionSize = 'sm' | 'md' | 'lg';
type AccordionVariant = 'default' | 'surface' | 'plain';
type AccordionStatus = 'default' | 'active' | 'success' | 'warning' | 'error';

export interface AccordionProps extends DataVisoolStyleProps {
    label?: React.ReactNode;
    tip?: React.ReactNode;
    description?: React.ReactNode;
    extra?: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
    value?: boolean;
    defaultValue?: boolean;
    defaultActive?: boolean;
    disabled?: boolean;
    keepMounted?: boolean;
    accordionSize?: AccordionSize;
    variant?: AccordionVariant;
    status?: AccordionStatus;
    containerStyle?: React.CSSProperties;
    headerStyle?: React.CSSProperties;
    headerClassName?: string;
    contentStyle?: React.CSSProperties;
    contentClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
    extraClassName?: string;
    className?: string;
    id?: string;
    ariaLabel?: string;
    children?: React.ReactNode;
}

export function Accordion(props: AccordionProps) {
    const t = useDataVisoolUITranslate();
    const generatedId = React.useId();
    const {
        label,
        tip,
        description,
        extra,
        value,
        defaultValue,
        defaultActive,
        onOpenChange,
        disabled,
        keepMounted,
        accordionSize = 'md',
        variant = 'default',
        status = 'default',
        containerStyle,
        headerStyle,
        headerClassName,
        contentStyle,
        contentClassName,
        titleClassName,
        descriptionClassName,
        extraClassName,
        className,
        id,
        ariaLabel,
        children,
    } = props;
    const [open, setOpen, controlled] = useControllable<boolean>(value, defaultValue ?? defaultActive);
    const active = !!open;
    const accordionId = id ?? `${generatedId}-accordion`;
    const triggerId = `${accordionId}-trigger`;
    const contentId = `${accordionId}-content`;
    const titleId = `${accordionId}-title`;
    const tipTitle = typeof tip === 'string' || typeof tip === 'number' ? String(tip) : undefined;

    const updateOpen = () => {
        if (disabled)
            return;

        const nextOpen = !active;
        if (!controlled)
            setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    return (
        <section
            id={accordionId}
            className={cn(
                'datavisool-panel datavisool-accordion',
                `datavisool-accordion-size-${accordionSize}`,
                `datavisool-accordion-variant-${variant}`,
                status !== 'default' && `datavisool-accordion-status-${status}`,
                active && 'datavisool-accordion-open',
                disabled && 'datavisool-accordion-disabled',
                className,
            )}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : titleId}
            data-open={active ? 'true' : undefined}
            data-disabled={disabled ? 'true' : undefined}
            data-status={status !== 'default' ? status : undefined}
            style={buildStyle(props, containerStyle)}
        >
            <div className="datavisool-accordion-header">
                <button
                    id={triggerId}
                    type="button"
                    className={cn('datavisool-accordion-trigger', headerClassName)}
                    style={headerStyle}
                    aria-expanded={active}
                    aria-controls={contentId}
                    disabled={disabled}
                    onClick={updateOpen}
                >
                    <span className="datavisool-accordion-heading">
                        <span className="datavisool-accordion-title-row">
                            <span id={titleId} className={cn('datavisool-accordion-title', titleClassName)}>{label}</span>
                        </span>
                        {description ? <span className={cn('datavisool-accordion-description', descriptionClassName)}>{description}</span> : null}
                    </span>
                    <span className="datavisool-accordion-indicator" aria-hidden="true">
                        <IconChevronDown size={16}/>
                    </span>
                </button>
                {tip ? (
                    <span className="datavisool-accordion-tip" title={tipTitle} aria-label={tipTitle ?? t('折叠面板说明')} tabIndex={0}>
                        <IconInfo size={14}/>
                        <span className="datavisool-accordion-tip-content">{tip}</span>
                    </span>
                ) : null}
                {extra ? <div className={cn('datavisool-accordion-extra', extraClassName)}>{extra}</div> : null}
            </div>
            {(active || keepMounted) ? (
                <div
                    id={contentId}
                    role="region"
                    aria-labelledby={triggerId}
                    className={cn('datavisool-accordion-content', contentClassName)}
                    style={contentStyle}
                    hidden={!active}
                >
                    {children}
                </div>
            ) : null}
        </section>
    );
}
