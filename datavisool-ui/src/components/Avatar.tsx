/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {buildStyle, DataVisoolStyleProps, splitControlStyleProps} from './style';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'square';

export interface AvatarProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style' | 'color'>, DataVisoolStyleProps {
    src?: string | React.ReactNode;
    alt?: string;
    size?: AvatarSize | number;
    shape?: AvatarShape;
    imgProps?: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>;
    onImageError?: React.ReactEventHandler<HTMLImageElement>;
}

const avatarSizeClass: Record<AvatarSize, string> = {
    sm: 'datavisool-avatar-size-sm',
    md: 'datavisool-avatar-size-md',
    lg: 'datavisool-avatar-size-lg',
    xl: 'datavisool-avatar-size-xl',
};

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>((props, ref) => {
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        src,
        alt = '',
        size = 'md',
        shape = 'circle',
        className,
        children,
        imgProps,
        onImageError,
        ...spanProps
    } = restProps as AvatarProps;
    const [imageAvailable, setImageAvailable] = React.useState(true);
    const isCustomSize = typeof size === 'number';
    const imageSrc = typeof src === 'string' ? src : undefined;
    const hasImageSrc = Boolean(imageSrc && imageAvailable);
    const customSizeStyle = isCustomSize
        ? {
            width: size,
            height: size,
            minWidth: size,
            fontSize: Math.max(11, Math.round(size * 0.38)),
        }
        : undefined;

    React.useEffect(() => {
        setImageAvailable(true);
    }, [imageSrc]);

    const imageNode = hasImageSrc ? (
        <img
            {...imgProps}
            src={imageSrc}
            alt={alt}
            draggable={imgProps?.draggable ?? false}
            className={cn('datavisool-avatar-image', imgProps?.className)}
            onError={(event) => {
                setImageAvailable(false);
                onImageError?.(event);
                imgProps?.onError?.(event);
            }}
        />
    ) : src && typeof src !== 'string' ? (
        <span className="datavisool-avatar-custom">{src}</span>
    ) : null;

    return (
        <span
            {...spanProps}
            ref={ref}
            className={cn(
                'datavisool-avatar',
                avatarSizeClass[isCustomSize ? 'md' : size],
                `datavisool-avatar-shape-${shape}`,
                imageNode && 'datavisool-avatar-has-image',
                className,
            )}
            style={buildStyle(styleProps, customSizeStyle)}
        >
            {imageNode ?? <span className="datavisool-avatar-fallback">{children}</span>}
        </span>
    );
});
Avatar.displayName = 'Avatar';
