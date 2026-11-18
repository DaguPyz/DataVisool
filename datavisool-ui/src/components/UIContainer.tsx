/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {IconInfo} from './Icon';
import {buildStyle, DataVisoolControlStyleProps, splitControlStyleProps} from './style';

export type UIContainerStatus = 'default' | 'success' | 'warning' | 'error';
export type UIContainerLayout = 'horizontal' | 'vertical';

export interface UIContainerProps extends DataVisoolControlStyleProps {
    id?: string;
    label?: React.ReactNode;
    labelFor?: string;
    tip?: React.ReactNode;
    required?: boolean;
    status?: UIContainerStatus;
    helperText?: React.ReactNode;
    layout?: UIContainerLayout;
    /** @deprecated Use layout="horizontal" instead. */
    inline?: boolean;
    labelExtra?: React.ReactNode;
    className?: string;
    containerStyle?: React.CSSProperties;
    containerClassName?: string;
    labelStyle?: React.CSSProperties;
    labelClassName?: string;
    contentStyle?: React.CSSProperties;
    contentClassName?: string;
    helperTextStyle?: React.CSSProperties;
    helperTextClassName?: string;
    children?: React.ReactNode;
}

export function UIContainer(props: UIContainerProps) {
    const t = useDataVisoolUITranslate();
    const generatedId = React.useId();
    const [styleProps, restProps] = splitControlStyleProps(props as Record<string, unknown>);
    const {
        id,
        label,
        labelFor,
        tip,
        required,
        status = 'default',
        helperText,
        layout,
        inline,
        labelExtra,
        children,
        className,
        containerClassName,
        containerStyle,
        contentClassName,
        contentStyle,
        labelClassName,
        labelStyle,
        helperTextClassName,
        helperTextStyle,
    } = restProps as UIContainerProps;
    const fieldId = id ?? `${generatedId}-field`;
    const helperId = helperText ? `${fieldId}-helper` : undefined;
    const labelId = label ? `${fieldId}-label` : undefined;
    const tipTitle = typeof tip === 'string' || typeof tip === 'number' ? String(tip) : undefined;
    const LabelTag = labelFor ? 'label' : 'div';
    const finalLayout: UIContainerLayout = layout ?? (inline === false ? 'vertical' : 'horizontal');

    return (
        <div
            id={fieldId}
            className={cn(
                'datavisool-field',
                `datavisool-field-${finalLayout}`,
                status !== 'default' && `datavisool-field-status-${status}`,
                containerClassName,
                className,
            )}
            data-status={status !== 'default' ? status : undefined}
            data-required={required ? 'true' : undefined}
            style={buildStyle(styleProps, containerStyle)}
        >
            {label ? (
                <LabelTag
                    id={labelId}
                    htmlFor={labelFor}
                    className={cn('datavisool-field-label', labelClassName)}
                    style={labelStyle}
                >
                    <span className="datavisool-field-label-main">
                        <span className="datavisool-field-label-text" title={typeof label === 'string' ? label : undefined}>{label}</span>
                        {required ? <span className="datavisool-field-required" aria-label={t('必填')}>{t('必填')}</span> : null}
                    </span>
                    {tip ? (
                        <span className="datavisool-field-tip" title={tipTitle} aria-label={tipTitle ?? t('字段说明')} tabIndex={0}>
                            <IconInfo size={14}/>
                            <span className="datavisool-field-tip-content">{tip}</span>
                        </span>
                    ) : null}
                    {labelExtra ? <span className="datavisool-field-label-extra">{labelExtra}</span> : null}
                </LabelTag>
            ) : null}
            <div
                className={cn('datavisool-field-content', contentClassName)}
                aria-labelledby={labelId}
                aria-describedby={helperId}
                style={contentStyle}
            >
                {children}
            </div>
            {helperText ? (
                <div
                    id={helperId}
                    className={cn('datavisool-field-helper', status !== 'default' && `datavisool-field-helper-${status}`, helperTextClassName)}
                    style={helperTextStyle}
                >
                    {helperText}
                </div>
            ) : null}
        </div>
    );
}
