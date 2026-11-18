/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {BaseButton} from './Button';
import {CodeEditor, CodeEditorProps} from './CodeEditor';
import {IconX} from './Icon';

export interface FullEditorProps extends Omit<CodeEditorProps, 'fullScreen'> {
    onClose?: () => void;
    title?: React.ReactNode;
    description?: React.ReactNode;
    cancelText?: React.ReactNode;
    saveText?: React.ReactNode;
    closeOnBackdrop?: boolean;
    showFooterMeta?: boolean;
}

function getLineCount(value: string) {
    if (!value)
        return 1;
    return value.split('\n').length;
}

export function FullEditor(props: FullEditorProps) {
    const t = useDataVisoolUITranslate();
    const {
        onClose,
        onChange,
        value,
        defaultValue = '',
        readonly,
        readOnly,
        disabled,
        language,
        label,
        title,
        description,
        cancelText = t('取消'),
        saveText = t('保存'),
        closeOnBackdrop = true,
        showFooterMeta = true,
        className,
        containerClassName,
        ...editorProps
    } = props;
    const isControlled = value !== undefined;
    const [draft, setDraft] = React.useState(value ?? defaultValue);
    const isReadonly = Boolean(readOnly ?? readonly ?? disabled);
    const resolvedTitle = title ?? label ?? t('代码编辑');
    const languageLabel = language ? String(language).toUpperCase() : t('Plain text');

    React.useEffect(() => {
        if (isControlled)
            setDraft(value ?? '');
    }, [isControlled, value]);

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                onClose?.();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleSave = () => {
        if (isReadonly)
            return;
        onChange?.(draft);
        onClose?.();
    };

    return (
        <div className={cn('datavisool-code-editor-dialog datavisool-full-editor', className)} role="dialog" aria-modal="true" aria-label={typeof resolvedTitle === 'string' ? resolvedTitle : t('全屏代码编辑器')}>
            <div
                className="datavisool-code-editor-backdrop datavisool-full-editor-backdrop"
                onClick={closeOnBackdrop ? onClose : undefined}
            />
            <section className={cn('datavisool-code-editor-modal datavisool-full-editor-modal', containerClassName)}>
                <header className="datavisool-code-editor-modal-header datavisool-full-editor-header">
                    <div className="datavisool-code-editor-modal-heading datavisool-full-editor-heading">
                        <h2>{resolvedTitle}</h2>
                        <span>{description ?? languageLabel}</span>
                    </div>
                    <button type="button" className="datavisool-code-editor-action" aria-label={t('关闭全屏代码编辑器')} title={t('关闭')} onClick={onClose}>
                        <IconX size={18}/>
                    </button>
                </header>
                <div className="datavisool-full-editor-body">
                    <CodeEditor
                        {...editorProps}
                        label={undefined}
                        value={draft}
                        onChange={(next) => setDraft(next ?? '')}
                        readonly={readonly}
                        readOnly={readOnly}
                        disabled={disabled}
                        language={language}
                        height="100%"
                        showStatusBar={false}
                    />
                </div>
                <footer className="datavisool-code-editor-modal-footer datavisool-full-editor-footer">
                    {showFooterMeta ? (
                        <div className="datavisool-code-editor-status datavisool-full-editor-status" aria-live="polite">
                            <span>{t('{count} 行', {count: getLineCount(draft)})}</span>
                            <span>{t('{count} 字符', {count: draft.length})}</span>
                            {isReadonly ? <span>{t('只读')}</span> : null}
                        </div>
                    ) : <span/>}
                    <div className="datavisool-code-editor-modal-actions datavisool-full-editor-actions">
                        <BaseButton type="button" variant="outline" onClick={onClose}>{cancelText}</BaseButton>
                        <BaseButton type="button" disabled={isReadonly} onClick={handleSave}>{saveText}</BaseButton>
                    </div>
                </footer>
            </section>
        </div>
    );
}
