/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

type TextAreaSize = 'sm' | 'md' | 'lg';
type TextAreaStatus = 'default' | 'success' | 'warning' | 'error';
type TextAreaAutoSize = boolean | {minRows?: number; maxRows?: number};

export interface TextAreaProps extends UIContainerProps {
    value?: string;
    defaultValue?: string;
    onChange?: (data: string) => void;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    textAreaSize?: TextAreaSize;
    status?: TextAreaStatus;
    helperText?: React.ReactNode;
    showCount?: boolean;
    autoSize?: TextAreaAutoSize;
    rows?: number;
    minRows?: number;
    maxRows?: number;
    maxLength?: number;
    minLength?: number;
    id?: string;
    name?: string;
    autoFocus?: boolean;
    required?: boolean;
    spellCheck?: boolean;
    wrap?: React.TextareaHTMLAttributes<HTMLTextAreaElement>['wrap'];
    onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
    onFocus?: React.FocusEventHandler<HTMLTextAreaElement>;
    onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
    onKeyUp?: React.KeyboardEventHandler<HTMLTextAreaElement>;
}

export function TextArea(props: TextAreaProps) {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const generatedId = React.useId();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue = '',
        onChange,
        placeholder,
        disabled,
        readOnly,
        textAreaSize = 'md',
        status = 'default',
        helperText,
        showCount,
        autoSize,
        rows,
        minRows,
        maxRows,
        maxLength,
        minLength,
        id,
        name,
        autoFocus,
        required,
        spellCheck,
        wrap,
        onBlur,
        onFocus,
        onKeyDown,
        onKeyUp,
        ...containerProps
    } = restProps as TextAreaProps;
    const isControlled = value !== undefined;
    const [innerValue, setInnerValue] = React.useState(defaultValue);
    const currentValue = isControlled ? value : innerValue;
    const textareaId = id ?? `${generatedId}-textarea`;
    const helperId = helperText ? `${textareaId}-helper` : undefined;
    const countId = showCount ? `${textareaId}-count` : undefined;
    const describedBy = [helperId, countId].filter(Boolean).join(' ') || undefined;
    const count = currentValue.length;
    const overLimit = typeof maxLength === 'number' && count > maxLength;
    const resolvedMinRows = typeof autoSize === 'object' ? autoSize.minRows : minRows;
    const resolvedMaxRows = typeof autoSize === 'object' ? autoSize.maxRows : maxRows;

    const resizeTextarea = React.useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea || !autoSize)
            return;

        textarea.style.height = 'auto';
        const computedStyle = window.getComputedStyle(textarea);
        const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 21;
        const borderHeight = textarea.offsetHeight - textarea.clientHeight;
        const minHeight = resolvedMinRows ? (lineHeight * resolvedMinRows) + borderHeight : 0;
        const maxHeight = resolvedMaxRows ? (lineHeight * resolvedMaxRows) + borderHeight : Number.POSITIVE_INFINITY;
        const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);

        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [autoSize, resolvedMaxRows, resolvedMinRows]);

    React.useEffect(() => {
        resizeTextarea();
    }, [currentValue, resizeTextarea]);

    const updateValue = (nextValue: string) => {
        if (!isControlled)
            setInnerValue(nextValue);
        onChange?.(nextValue);
    };

    return (
        <UIContainer {...containerProps}>
            <div className="datavisool-textarea-field">
                <textarea
                    ref={textareaRef}
                    id={textareaId}
                    name={name}
                    value={currentValue}
                    placeholder={placeholder}
                    disabled={disabled}
                    readOnly={readOnly}
                    rows={rows}
                    maxLength={maxLength}
                    minLength={minLength}
                    autoFocus={autoFocus}
                    required={required}
                    spellCheck={spellCheck}
                    wrap={wrap}
                    aria-invalid={status === 'error' || overLimit ? true : undefined}
                    aria-describedby={describedBy}
                    className={cn(
                        'datavisool-control datavisool-textarea',
                        `datavisool-textarea-size-${textAreaSize}`,
                        status !== 'default' && `datavisool-textarea-status-${status}`,
                        styleProps.controlClassName,
                    )}
                    data-disabled={disabled ? 'true' : undefined}
                    data-readonly={readOnly ? 'true' : undefined}
                    style={buildStyle(styleProps, styleProps.controlStyle)}
                    onBlur={onBlur}
                    onFocus={onFocus}
                    onKeyDown={onKeyDown}
                    onKeyUp={onKeyUp}
                    onChange={(event) => updateValue(event.target.value)}
                />
                {(helperText || showCount) ? (
                    <div className="datavisool-textarea-footer">
                        {helperText ? (
                            <div id={helperId} className={cn('datavisool-textarea-helper', status !== 'default' && `datavisool-textarea-helper-${status}`)}>
                                {helperText}
                            </div>
                        ) : <span/>}
                        {showCount ? (
                            <div id={countId} className={cn('datavisool-textarea-count', overLimit && 'datavisool-textarea-count-over')}>
                                {typeof maxLength === 'number' ? `${count}/${maxLength}` : count}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </UIContainer>
    );
}
