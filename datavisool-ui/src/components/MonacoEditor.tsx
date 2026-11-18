/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

export interface MonacoEditorProps extends UIContainerProps {
    value?: string;
    defaultValue?: string;
    onChange?: (value?: string) => void;
    readonly?: boolean;
    language?: 'javascript' | 'json' | 'sql';
    width?: string | number;
    height?: string | number;
    quickSuggestions?: boolean;
}

export function MonacoEditor(props: MonacoEditorProps) {
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {value, defaultValue, onChange, readonly, width = '100%', height = 240, language, ...containerProps} = restProps as MonacoEditorProps;

    return (
        <UIContainer {...containerProps}>
            <textarea
                value={value}
                defaultValue={defaultValue}
                readOnly={readonly}
                spellCheck={false}
                data-language={language}
                className={`datavisool-control ${styleProps.controlClassName ?? ''}`}
                style={buildStyle({...styleProps, width: styleProps.width ?? width, height: styleProps.height ?? height}, styleProps.controlStyle)}
                onChange={(event) => onChange?.(event.target.value)}
            />
        </UIContainer>
    );
}
