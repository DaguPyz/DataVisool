/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {Accordion, AccordionProps} from './Accordion';

export interface SubAccordionProps extends AccordionProps {
    level?: 1 | 2 | 3;
    inset?: boolean;
    marker?: React.ReactNode;
}

export function SubAccordion(props: SubAccordionProps) {
    const {
        level = 1,
        inset = true,
        marker,
        label,
        accordionSize = 'sm',
        variant = 'surface',
        className,
        titleClassName,
        ...restProps
    } = props;
    const normalizedLevel = Math.max(1, Math.min(3, level)) as 1 | 2 | 3;
    const finalLabel = marker ? (
        <span className="datavisool-sub-accordion-label">
            <span className="datavisool-sub-accordion-marker" aria-hidden="true">{marker}</span>
            <span className="datavisool-sub-accordion-label-text">{label}</span>
        </span>
    ) : label;

    return (
        <Accordion
            {...restProps}
            label={finalLabel}
            accordionSize={accordionSize}
            variant={variant}
            className={cn(
                'datavisool-sub-accordion',
                `datavisool-sub-accordion-level-${normalizedLevel}`,
                inset && 'datavisool-sub-accordion-inset',
                className,
            )}
            titleClassName={cn('datavisool-sub-accordion-title', titleClassName)}
        />
    );
}
