/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

export interface TextOnlyProps extends UIContainerProps {
    defaultValue?: string;
}

export function TextOnly(props: TextOnlyProps) {
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {defaultValue, tip, label, ...rest} = restProps as TextOnlyProps;

    return <UIContainer {...rest} tip={tip} label={label}><div className={cn('datavisool-text-only', styleProps.controlClassName)} style={buildStyle(styleProps, styleProps.controlStyle)}>{defaultValue}</div></UIContainer>;
}
