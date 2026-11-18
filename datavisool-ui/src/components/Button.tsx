/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {IconLoader} from './Icon';
import {buildStyle, DataVisoolStyleProps, splitControlStyleProps} from './style';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonVariantOptions {
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    className?: string;
}

const buttonVariantClass: Record<ButtonVariant, string> = {
    default: 'datavisool-button-variant-default',
    destructive: 'datavisool-button-variant-destructive',
    outline: 'datavisool-button-variant-outline',
    secondary: 'datavisool-button-variant-secondary',
    ghost: 'datavisool-button-variant-ghost',
    link: 'datavisool-button-variant-link',
};

const buttonSizeClass: Record<ButtonSize, string> = {
    default: 'datavisool-button-size-default',
    sm: 'datavisool-button-size-sm',
    lg: 'datavisool-button-size-lg',
    icon: 'datavisool-button-size-icon',
};

export function buttonVariants(options: ButtonVariantOptions | string = {}) {
    const normalized = typeof options === 'string' ? {className: options} : options;

    return cn(
        'datavisool-button',
        buttonVariantClass[normalized.variant ?? 'default'],
        buttonSizeClass[normalized.size ?? 'default'],
        normalized.block && 'datavisool-button-block',
        normalized.className,
    );
}

export interface BaseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantOptions {}

export const BaseButton = React.forwardRef<HTMLButtonElement, BaseButtonProps>(
    ({className, variant, size, block, ...props}, ref) => {
        return (
            <button
                className={cn(buttonVariants({variant, size, block, className}))}
                ref={ref}
                {...props}
            />
        );
    },
);
BaseButton.displayName = 'BaseButton';

export interface ButtonProps extends Omit<BaseButtonProps, 'type' | 'onChange' | 'style' | 'color'>, DataVisoolStyleProps {
    onChange?: () => void;
    type?: 'default' | 'primary' | 'dashed' | 'link' | 'text';
    htmlType?: React.ButtonHTMLAttributes<HTMLButtonElement>['type'];
    loading?: boolean;
    icon?: React.ReactNode;
    iconPosition?: 'start' | 'end';
}

export function Button(props: ButtonProps) {
    const [styleProps, buttonProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        onChange,
        onClick,
        type = 'primary',
        htmlType = 'button',
        variant,
        children,
        disabled,
        loading,
        icon,
        iconPosition = 'start',
        className,
        ...rest
    } = buttonProps as ButtonProps;
    const mappedVariant = variant ?? (
        type === 'primary'
            ? 'default'
            : type === 'link'
                ? 'link'
                : type === 'text'
                    ? 'ghost'
                    : 'outline'
    );
    const startIcon = loading ? <IconLoader className="datavisool-button-spinner" aria-hidden="true"/> : icon;

    return (
        <BaseButton
            {...rest}
            type={htmlType}
            variant={mappedVariant}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(type === 'dashed' && 'datavisool-button-dashed', className)}
            style={buildStyle(styleProps)}
            onClick={(event) => {
                if (loading || disabled)
                    return;
                onChange?.();
                onClick?.(event);
            }}
        >
            {iconPosition === 'start' ? startIcon : null}
            {children}
            {iconPosition === 'end' ? startIcon : null}
        </BaseButton>
    );
}
