/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {createPortal} from 'react-dom';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/css/css';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/markdown/markdown';
import 'codemirror/mode/sql/sql';
import 'codemirror/addon/display/placeholder';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/comment-fold';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/markdown-fold';
import 'codemirror/addon/fold/xml-fold';
import 'codemirror/addon/hint/anyword-hint';
import 'codemirror/addon/hint/css-hint';
import 'codemirror/addon/hint/html-hint';
import 'codemirror/addon/hint/javascript-hint';
import 'codemirror/addon/hint/show-hint';
import 'codemirror/addon/hint/sql-hint';
import 'codemirror/addon/selection/active-line';
import {cn} from '@/lib/utils';
import {BaseButton} from './Button';
import {IconMaximize, IconX} from './Icon';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

export type CodeEditorLanguage =
    | 'javascript'
    | 'typescript'
    | 'jsx'
    | 'tsx'
    | 'json'
    | 'css'
    | 'html'
    | 'markdown'
    | 'sql'
    | string;

type CodeMirrorInstance = CodeMirror.Editor;
const CODE_EDITOR_HINT_THEME_TOKENS = [
    '--datavisool-ui-panel-border',
    '--datavisool-ui-popover',
    '--datavisool-ui-panel-shadow',
    '--datavisool-ui-popover-foreground',
    '--datavisool-ui-foreground',
];
type CodeMirrorMode = string | {
    name: string;
    json?: boolean;
    jsx?: boolean;
    typescript?: boolean;
};

export const normalizeEditorValue = (value?: unknown): string | undefined => {
    if (value == null)
        return undefined;
    if (typeof value === 'string')
        return value;
    if (typeof value === 'function') {
        try {
            return value.toString();
        } catch {
            return String(value);
        }
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

export interface CodeEditorProps extends UIContainerProps {
    value?: string;
    defaultValue?: string;
    onChange?: (value?: string) => void;
    readonly?: boolean;
    readOnly?: boolean;
    disabled?: boolean;
    language?: CodeEditorLanguage;
    width?: string | number;
    height?: string | number;
    minHeight?: string | number;
    maxHeight?: string | number;
    placeholder?: string;
    autoFocus?: boolean;
    fullScreen?: boolean;
    lineNumbers?: boolean;
    foldGutter?: boolean;
    lineWrapping?: boolean;
    quickSuggestions?: boolean;
    basicSetup?: boolean;
    extensions?: unknown[];
    editorClassName?: string;
    editorStyle?: React.CSSProperties;
    showStatusBar?: boolean;
}

interface CodeMirrorSurfaceProps {
    value: string;
    onChange: (value: string) => void;
    language?: CodeEditorLanguage;
    readOnly?: boolean;
    disabled?: boolean;
    placeholder?: string;
    autoFocus?: boolean;
    lineNumbers?: boolean;
    foldGutter?: boolean;
    lineWrapping?: boolean;
    quickSuggestions?: boolean;
    basicSetup?: boolean;
    extensions?: unknown[];
    className?: string;
    style?: React.CSSProperties;
    ariaLabel?: string;
}

function getLanguageMode(language?: CodeEditorLanguage): CodeMirrorMode | undefined {
    const normalized = String(language ?? '').trim().toLowerCase();

    if (!normalized)
        return undefined;
    if (normalized === 'ts' || normalized === 'typescript')
        return {name: 'javascript', typescript: true};
    if (normalized === 'tsx')
        return {name: 'javascript', typescript: true, jsx: true};
    if (normalized === 'jsx' || normalized === 'react')
        return {name: 'javascript', jsx: true};
    if (normalized === 'js' || normalized === 'javascript')
        return 'javascript';
    if (normalized === 'json' || normalized.includes('json'))
        return {name: 'javascript', json: true};
    if (normalized === 'css' || normalized === 'scss' || normalized === 'less' || normalized.includes('css'))
        return 'css';
    if (normalized === 'html' || normalized === 'xml' || normalized.includes('html'))
        return 'htmlmixed';
    if (normalized === 'md' || normalized === 'markdown' || normalized.includes('markdown') || normalized.includes('md'))
        return 'markdown';
    if (normalized === 'sql' || normalized.includes('sql'))
        return 'sql';

    return undefined;
}

function getLanguageLabel(language?: CodeEditorLanguage) {
    if (!language)
        return 'Plain text';

    const normalized = String(language).trim();
    return normalized ? normalized.toUpperCase() : 'Plain text';
}

function getLineCount(value: string) {
    if (!value)
        return 1;
    return value.split('\n').length;
}

function getGutters(lineNumbers: boolean, foldGutter: boolean) {
    const gutters: string[] = [];
    if (lineNumbers)
        gutters.push('CodeMirror-linenumbers');
    if (foldGutter)
        gutters.push('CodeMirror-foldgutter');
    return gutters;
}

function applyEditorInputAttributes(editor: CodeMirrorInstance, ariaLabel?: string) {
    const wrapper = editor.getWrapperElement();
    if (ariaLabel)
        wrapper.setAttribute('aria-label', ariaLabel);
    else
        wrapper.removeAttribute('aria-label');

    const textarea = wrapper.querySelector('textarea');
    if (!textarea)
        return;

    textarea.spellcheck = false;
    textarea.autocomplete = 'off';
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('autocapitalize', 'off');
    textarea.setAttribute('translate', 'no');
}

function setEditorSize(editor: CodeMirrorInstance) {
    editor.setSize('100%', '100%');
}

function copyCompletionTheme(source: HTMLElement, target: HTMLElement) {
    const view = source.ownerDocument.defaultView;
    if (!view)
        return;
    const computed = view.getComputedStyle(source);
    for (const token of CODE_EDITOR_HINT_THEME_TOKENS) {
        const value = computed.getPropertyValue(token).trim();
        if (value)
            target.style.setProperty(token, value);
        else
            target.style.removeProperty(token);
    }

    const bodyRect = source.ownerDocument.body.getBoundingClientRect();
    target.style.setProperty('--datavisool-code-editor-hint-offset-x', `${-(bodyRect.left + view.scrollX)}px`);
    target.style.setProperty('--datavisool-code-editor-hint-offset-y', `${-(bodyRect.top + view.scrollY)}px`);
}

function CodeMirrorSurface(props: CodeMirrorSurfaceProps) {
    const {
        value,
        onChange,
        language,
        readOnly,
        disabled,
        placeholder,
        autoFocus,
        lineNumbers = true,
        foldGutter = true,
        lineWrapping = true,
        quickSuggestions = true,
        basicSetup = true,
        className,
        style,
        ariaLabel,
    } = props;
    const hostRef = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<CodeMirrorInstance | null>(null);
    const changeRef = React.useRef(onChange);
    const syncingRef = React.useRef(false);
    const isReadonly = Boolean(readOnly || disabled);

    React.useEffect(() => {
        changeRef.current = onChange;
    }, [onChange]);

    React.useEffect(() => {
        const host = hostRef.current;
        if (!host)
            return;

        const hintHost = host.ownerDocument.createElement('div');
        hintHost.className = 'datavisool-code-editor-hints';

        const editor = CodeMirror(host, {
            value,
            mode: getLanguageMode(language),
            theme: 'datavisool-dark',
            lineNumbers,
            lineWrapping,
            foldGutter,
            gutters: getGutters(lineNumbers, foldGutter),
            readOnly: disabled ? 'nocursor' : isReadonly,
            inputStyle: 'textarea',
            viewportMargin: Infinity,
            indentUnit: 2,
            tabSize: 2,
            matchBrackets: basicSetup,
            autoCloseBrackets: basicSetup,
            styleActiveLine: basicSetup,
            extraKeys: quickSuggestions ? {'Ctrl-Space': 'autocomplete'} : undefined,
            hintOptions: {container: hintHost},
            placeholder,
        } as CodeMirror.EditorConfiguration);
        host.ownerDocument.body.appendChild(hintHost);

        const ownerDocument = host.ownerDocument;
        const view = ownerDocument.defaultView;
        let outerScrollHandler: ((event: Event) => void) | undefined;
        const removeOuterScrollHandler = () => {
            if (!outerScrollHandler)
                return;
            ownerDocument.removeEventListener('scroll', outerScrollHandler, true);
            view?.removeEventListener('scroll', outerScrollHandler, true);
            outerScrollHandler = undefined;
        };

        editor.on('startCompletion', () => {
            copyCompletionTheme(host, hintHost);
            outerScrollHandler = (event) => {
                const target = event.target;
                if (view && target instanceof view.Node && hintHost.contains(target))
                    return;
                // show-hint's scroll updates do not account for a fixed custom container.
                (editor as CodeMirrorInstance & {closeHint?: () => void}).closeHint?.();
            };
            ownerDocument.addEventListener('scroll', outerScrollHandler, true);
            view?.addEventListener('scroll', outerScrollHandler, true);
        });
        editor.on('endCompletion', () => {
            removeOuterScrollHandler();
            for (const token of CODE_EDITOR_HINT_THEME_TOKENS)
                hintHost.style.removeProperty(token);
            hintHost.style.removeProperty('--datavisool-code-editor-hint-offset-x');
            hintHost.style.removeProperty('--datavisool-code-editor-hint-offset-y');
        });

        editor.on('change', (instance) => {
            if (!syncingRef.current)
                changeRef.current(instance.getValue());
        });
        editorRef.current = editor;
        setEditorSize(editor);
        applyEditorInputAttributes(editor, ariaLabel);

        const frame = window.requestAnimationFrame(() => {
            editor.refresh();
            if (autoFocus)
                editor.focus();
        });

        return () => {
            window.cancelAnimationFrame(frame);
            (editor as CodeMirrorInstance & {closeHint?: () => void}).closeHint?.();
            removeOuterScrollHandler();
            hintHost.remove();
            editor.getWrapperElement().remove();
            if (editorRef.current === editor)
                editorRef.current = null;
        };
    }, []);

    React.useEffect(() => {
        const editor = editorRef.current;
        if (!editor)
            return;

        const currentValue = editor.getValue();
        if (currentValue === value)
            return;

        const cursor = editor.getCursor();
        const scroll = editor.getScrollInfo();
        syncingRef.current = true;
        editor.setValue(value);
        syncingRef.current = false;
        editor.setCursor({
            line: Math.min(cursor.line, editor.lineCount() - 1),
            ch: cursor.ch,
        });
        editor.scrollTo(scroll.left, scroll.top);
    }, [value]);

    React.useEffect(() => {
        const editor = editorRef.current;
        if (!editor)
            return;

        editor.setOption('mode', getLanguageMode(language));
        editor.setOption('readOnly', disabled ? 'nocursor' : isReadonly);
        editor.setOption('lineNumbers', lineNumbers);
        editor.setOption('lineWrapping', lineWrapping);
        editor.setOption('foldGutter', foldGutter);
        editor.setOption('gutters', getGutters(lineNumbers, foldGutter));
        editor.setOption('matchBrackets', basicSetup);
        editor.setOption('autoCloseBrackets', basicSetup);
        editor.setOption('styleActiveLine', basicSetup);
        editor.setOption('extraKeys', quickSuggestions ? {'Ctrl-Space': 'autocomplete'} : undefined);
        editor.setOption('placeholder', placeholder);
        applyEditorInputAttributes(editor, ariaLabel);
        setEditorSize(editor);
        const frame = window.requestAnimationFrame(() => editor.refresh());
        return () => window.cancelAnimationFrame(frame);
    }, [ariaLabel, basicSetup, disabled, foldGutter, isReadonly, language, lineNumbers, lineWrapping, placeholder, quickSuggestions]);

    React.useEffect(() => {
        const editor = editorRef.current;
        if (!editor)
            return;
        setEditorSize(editor);
        const frame = window.requestAnimationFrame(() => editor.refresh());
        return () => window.cancelAnimationFrame(frame);
    }, [style]);

    return (
        <div
            className={cn('datavisool-code-editor-surface', className)}
            data-readonly={readOnly ? 'true' : undefined}
            data-disabled={disabled ? 'true' : undefined}
            style={style}
        >
            <div ref={hostRef} className="datavisool-code-editor-cm"/>
        </div>
    );
}

export function CodeEditor(props: CodeEditorProps) {
    const t = useDataVisoolUITranslate();
    const generatedId = React.useId();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        fullScreen,
        value,
        defaultValue = '',
        onChange,
        readonly,
        readOnly,
        disabled,
        language,
        placeholder,
        autoFocus,
        lineNumbers = true,
        foldGutter = true,
        lineWrapping = true,
        quickSuggestions = true,
        basicSetup = true,
        extensions,
        editorClassName,
        editorStyle,
        showStatusBar = true,
        label,
        id,
        className,
        ...containerProps
    } = restProps as CodeEditorProps;
    const editorId = id ?? `${generatedId}-code-editor`;
    const isControlled = value !== undefined;
    const isReadonly = Boolean(readOnly ?? readonly ?? disabled);
    const [draft, setDraft] = React.useState(value ?? defaultValue);
    const [open, setOpen] = React.useState(false);
    const [fullScreenDraft, setFullScreenDraft] = React.useState(value ?? defaultValue);
    const currentValue = isControlled ? value ?? '' : draft;
    const rawLanguageLabel = getLanguageLabel(language);
    const languageLabel = rawLanguageLabel === 'Plain text' ? t(rawLanguageLabel) : rawLanguageLabel;
    const lineCount = getLineCount(currentValue);
    const editorSurfaceStyle = buildStyle(styleProps, {
        height: styleProps.height ?? 240,
        minHeight: styleProps.minHeight,
        maxHeight: styleProps.maxHeight,
        ...styleProps.controlStyle,
        ...editorStyle,
    });
    const ariaLabel = typeof label === 'string' ? label : t('代码编辑器');

    React.useEffect(() => {
        if (isControlled)
            setDraft(value ?? '');
    }, [isControlled, value]);

    const commitChange = React.useCallback((nextValue: string) => {
        if (!isControlled)
            setDraft(nextValue);
        onChange?.(nextValue);
    }, [isControlled, onChange]);

    const openFullEditor = () => {
        setFullScreenDraft(currentValue);
        setOpen(true);
    };

    const closeFullEditor = () => {
        setOpen(false);
    };

    const saveFullEditor = () => {
        commitChange(fullScreenDraft);
        setOpen(false);
    };

    const fullEditorDialog = open ? (
        <div className="datavisool-code-editor-dialog" role="dialog" aria-modal="true" aria-label={t('全屏代码编辑器')}>
            <div className="datavisool-code-editor-backdrop" onClick={closeFullEditor}/>
            <section className="datavisool-code-editor-modal">
                <header className="datavisool-code-editor-modal-header">
                    <div className="datavisool-code-editor-modal-heading">
                        <h2>{typeof label === 'string' ? label : t('代码编辑')}</h2>
                        <span>{languageLabel}</span>
                    </div>
                    <button type="button" className="datavisool-code-editor-action" aria-label={t('关闭全屏代码编辑器')}
                            title={t('关闭')} onClick={closeFullEditor}>
                        <IconX size={18}/>
                    </button>
                </header>
                <CodeMirrorSurface
                    value={fullScreenDraft}
                    onChange={setFullScreenDraft}
                    language={language}
                    readOnly={isReadonly}
                    disabled={disabled}
                    placeholder={placeholder}
                    autoFocus
                    lineNumbers={lineNumbers}
                    foldGutter={foldGutter}
                    lineWrapping={lineWrapping}
                    quickSuggestions={quickSuggestions}
                    basicSetup={basicSetup}
                    extensions={extensions}
                    className="datavisool-code-editor-surface-full"
                    ariaLabel={t('全屏代码编辑区')}
                />
                <footer className="datavisool-code-editor-modal-footer">
                    <div className="datavisool-code-editor-status">
                        <span>{t('{count} 行', {count: getLineCount(fullScreenDraft)})}</span>
                        <span>{t('{count} 字符', {count: fullScreenDraft.length})}</span>
                    </div>
                    <div className="datavisool-code-editor-modal-actions">
                        <BaseButton type="button" variant="outline" onClick={closeFullEditor}>{t('取消')}</BaseButton>
                        <BaseButton type="button" disabled={isReadonly} onClick={saveFullEditor}>{t('保存')}</BaseButton>
                    </div>
                </footer>
            </section>
        </div>
    ) : null;

    return (
        <UIContainer {...containerProps} id={editorId} label={label} className={cn('datavisool-code-editor-field', className)}>
            <div className={cn('datavisool-code-editor', styleProps.controlClassName)}
                 data-disabled={disabled ? 'true' : undefined} data-readonly={isReadonly ? 'true' : undefined}>
                <div className="datavisool-code-editor-toolbar">
                    <div className="datavisool-code-editor-meta">
                        <span className="datavisool-code-editor-lang">{languageLabel}</span>
                        {isReadonly ? <span className="datavisool-code-editor-chip">{t('只读')}</span> : null}
                    </div>
                    {fullScreen ? (
                        <button
                            type="button"
                            className="datavisool-code-editor-action"
                            aria-label={t('全屏编辑代码')}
                            title={t('全屏编辑')}
                            disabled={disabled}
                            onClick={openFullEditor}
                        >
                            <IconMaximize size={16}/>
                        </button>
                    ) : null}
                </div>
                <CodeMirrorSurface
                    value={currentValue}
                    onChange={commitChange}
                    language={language}
                    readOnly={isReadonly}
                    disabled={disabled}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    lineNumbers={lineNumbers}
                    foldGutter={foldGutter}
                    lineWrapping={lineWrapping}
                    quickSuggestions={quickSuggestions}
                    basicSetup={basicSetup}
                    extensions={extensions}
                    className={editorClassName}
                    style={editorSurfaceStyle}
                    ariaLabel={ariaLabel}
                />
                {showStatusBar ? (
                    <div className="datavisool-code-editor-status" aria-live="polite">
                        <span>{t('{count} 行', {count: lineCount})}</span>
                        <span>{t('{count} 字符', {count: currentValue.length})}</span>
                    </div>
                ) : null}
            </div>
            {fullEditorDialog && typeof document !== 'undefined' ? createPortal(fullEditorDialog, document.body) : null}
        </UIContainer>
    );
}
