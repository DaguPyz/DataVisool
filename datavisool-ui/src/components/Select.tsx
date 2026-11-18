/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {createPortal} from 'react-dom';
import {cn} from '@/lib/utils';
import {IconCheckCircle, IconChevronDown, IconLoader} from './Icon';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

type SelectSize = 'sm' | 'md' | 'lg';
type SelectStatus = 'default' | 'success' | 'warning' | 'error';
type SelectValue = string | number;
const SELECT_PANEL_MIN_WIDTH = 240;
const SELECT_PANEL_MAX_WIDTH = 560;
const SELECT_PANEL_VIEWPORT_PADDING = 16;
const SELECT_PANEL_GAP = 8;
const SELECT_PANEL_MAX_HEIGHT = 280;

export interface ISelectOption {
    label: string;
    value: string | number;
    disabled?: boolean;
    description?: React.ReactNode;
}

export interface SelectProps extends UIContainerProps {
    value?: SelectValue | SelectValue[];
    defaultValue?: SelectValue | SelectValue[];
    options?: ISelectOption[];
    showSearch?: boolean;
    allowClear?: boolean;
    prefix?: React.ReactNode;
    suffixIcon?: React.ReactNode;
    panelClassName?: string;
    panelMaxWidth?: React.CSSProperties['maxWidth'];
    filterOption?: (input: string, option?: ISelectOption) => boolean;
    handleSearch?: (search: string) => Promise<ISelectOption[]>;
    disabled?: boolean;
    readOnly?: boolean;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: React.ReactNode;
    loadingText?: React.ReactNode;
    helperText?: React.ReactNode;
    multiple?: boolean;
    name?: string;
    id?: string;
    required?: boolean;
    selectSize?: SelectSize;
    status?: SelectStatus;
    block?: boolean;
    onChange?: (value: SelectValue | SelectValue[]) => void;
    onBlur?: React.FocusEventHandler<HTMLButtonElement>;
    onFocus?: React.FocusEventHandler<HTMLButtonElement>;
}

const normalizeOptionValue = (value: string | number) => String(value);

function getSelectedItems(value: SelectValue | SelectValue[] | undefined, multiple?: boolean): SelectValue[] {
    if (multiple)
        return Array.isArray(value) ? value : value !== undefined && value !== '' ? [value] : [];
    return value !== undefined && value !== '' ? [value as SelectValue] : [];
}

function getNextEnabledIndex(options: ISelectOption[], currentIndex: number, direction: 1 | -1) {
    if (!options.length)
        return -1;

    for (let offset = 1; offset <= options.length; offset += 1) {
        const nextIndex = (currentIndex + offset * direction + options.length) % options.length;
        if (!options[nextIndex]?.disabled)
            return nextIndex;
    }

    return -1;
}

// 将面板最大宽度规整为浏览器可识别的值，并额外约束在当前视口内。
function getPanelMaxWidthStyle(panelMaxWidth: React.CSSProperties['maxWidth'] | undefined) {
    const normalizedMaxWidth = panelMaxWidth === undefined
        ? `${SELECT_PANEL_MAX_WIDTH}px`
        : typeof panelMaxWidth === 'number'
            ? `${Math.max(panelMaxWidth, SELECT_PANEL_MIN_WIDTH)}px`
            : panelMaxWidth.trim();
    if (!normalizedMaxWidth)
        return undefined;

    return `min(${normalizedMaxWidth}, calc(100vw - ${SELECT_PANEL_VIEWPORT_PADDING * 2}px))`;
}

export function Select(props: SelectProps) {
    const t = useDataVisoolUITranslate();
    const generatedId = React.useId();
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const shellRef = React.useRef<HTMLDivElement | null>(null);
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const searchInputRef = React.useRef<HTMLInputElement | null>(null);
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue,
        options = [],
        showSearch,
        allowClear,
        prefix,
        suffixIcon,
        panelClassName,
        panelMaxWidth,
        filterOption,
        handleSearch,
        disabled,
        readOnly,
        placeholder = t('请选择'),
        searchPlaceholder,
        emptyText = t('没有可选项'),
        loadingText = t('加载中'),
        helperText,
        multiple,
        name,
        id,
        required,
        selectSize = 'md',
        status = 'default',
        block,
        onChange,
        onBlur,
        onFocus,
        ...containerProps
    } = restProps as SelectProps;
    const isMulti = multiple ?? Array.isArray(value ?? defaultValue);
    const isControlled = value !== undefined;
    const selectId = id ?? `${generatedId}-select`;
    const listboxId = `${selectId}-listbox`;
    const helperId = helperText ? `${selectId}-helper` : undefined;
    const [innerValue, setInnerValue] = React.useState<SelectValue | SelectValue[] | undefined>(defaultValue);
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [remoteOptions, setRemoteOptions] = React.useState<ISelectOption[]>([]);
    const [remoteLoading, setRemoteLoading] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>();
    const finalValue = isControlled ? value : innerValue;
    const selectedItems = React.useMemo(() => getSelectedItems(finalValue, isMulti), [finalValue, isMulti]);
    const selectedValues = React.useMemo(() => selectedItems.map(normalizeOptionValue), [selectedItems]);
    const selectedValue = selectedItems[0] ?? '';
    const finalSearchPlaceholder = searchPlaceholder ?? placeholder;
    const sourceOptions = showSearch && handleSearch ? remoteOptions : options;
    const filteredOptions = React.useMemo(() => {
        if (!showSearch || handleSearch)
            return sourceOptions;

        const keywords = search.trim().toLowerCase();
        if (!keywords)
            return sourceOptions;

        return sourceOptions.filter((option) => (
            filterOption
                ? filterOption(search, option)
                : option.label.toLowerCase().includes(keywords)
        ));
    }, [filterOption, handleSearch, search, showSearch, sourceOptions]);
    const optionCatalog = React.useMemo(() => {
        const catalog = new Map<string, ISelectOption>();
        [...options, ...remoteOptions].forEach((option) => catalog.set(normalizeOptionValue(option.value), option));
        return catalog;
    }, [options, remoteOptions]);
    const selectedOptions = React.useMemo(() => selectedValues
        .map((item) => optionCatalog.get(item))
        .filter((option): option is ISelectOption => Boolean(option)), [optionCatalog, selectedValues]);
    const hasValue = selectedValues.length > 0;
    const displayText = hasValue
        ? isMulti
            ? selectedOptions.map((option) => option.label).join('、') || selectedValues.join('、')
            : selectedOptions[0]?.label ?? selectedValue
        : placeholder;
    const activeOption = activeIndex >= 0 ? filteredOptions[activeIndex] : undefined;
    const activeOptionId = activeOption ? `${selectId}-option-${activeIndex}` : undefined;

    React.useEffect(() => {
        if (!open)
            return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target))
                setOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

    const updatePanelPosition = React.useCallback(() => {
        const shell = shellRef.current;
        if (!shell || typeof window === 'undefined')
            return;

        const rect = shell.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const viewportPadding = SELECT_PANEL_VIEWPORT_PADDING;
        const panelGap = SELECT_PANEL_GAP;
        const availableWidth = Math.max(viewportWidth - viewportPadding * 2, 0);
        const panelMinWidth = Math.min(Math.max(rect.width, SELECT_PANEL_MIN_WIDTH), availableWidth || Math.max(rect.width, SELECT_PANEL_MIN_WIDTH));
        const measuredPanelWidth = panelRef.current
            ? Math.ceil(panelRef.current.getBoundingClientRect().width || panelRef.current.scrollWidth)
            : panelMinWidth;
        const panelWidth = Math.min(Math.max(measuredPanelWidth, panelMinWidth), availableWidth || measuredPanelWidth);
        const left = Math.min(Math.max(rect.left, viewportPadding), Math.max(viewportPadding, viewportWidth - panelWidth - viewportPadding));
        const maxViewportHeight = Math.max(viewportHeight - viewportPadding * 2, 80);
        const minPanelHeight = Math.min(160, maxViewportHeight);
        const spaceBelow = Math.max(viewportHeight - rect.bottom - panelGap - viewportPadding, 0);
        const spaceAbove = Math.max(rect.top - panelGap - viewportPadding, 0);
        const naturalPanelHeight = panelRef.current
            ? Math.ceil(panelRef.current.scrollHeight || panelRef.current.getBoundingClientRect().height)
            : minPanelHeight;
        const preferredPanelHeight = Math.min(Math.max(naturalPanelHeight, 1), SELECT_PANEL_MAX_HEIGHT, maxViewportHeight);
        const openAbove = spaceBelow < preferredPanelHeight && spaceAbove > spaceBelow;
        const availableHeight = openAbove ? spaceAbove : spaceBelow;
        const panelMaxHeight = Math.min(SELECT_PANEL_MAX_HEIGHT, Math.max(availableHeight, Math.min(preferredPanelHeight, minPanelHeight)), maxViewportHeight);
        const positionedPanelHeight = Math.min(preferredPanelHeight, panelMaxHeight);
        const preferredTop = openAbove ? rect.top - panelGap - positionedPanelHeight : rect.bottom + panelGap;
        const top = Math.min(
            Math.max(preferredTop, viewportPadding),
            Math.max(viewportPadding, viewportHeight - positionedPanelHeight - viewportPadding),
        );

        setPanelStyle({
            position: 'fixed',
            top,
            left,
            minWidth: panelMinWidth,
            width: 'max-content',
            maxWidth: getPanelMaxWidthStyle(panelMaxWidth),
            maxHeight: panelMaxHeight,
            zIndex: 2400,
        });
    }, [panelMaxWidth]);

    React.useLayoutEffect(() => {
        if (!open)
            return;

        updatePanelPosition();
        const frame = window.requestAnimationFrame(updatePanelPosition);

        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [filteredOptions, open, remoteLoading, search, showSearch, updatePanelPosition]);

    React.useEffect(() => {
        if (!open)
            return;

        window.addEventListener('resize', updatePanelPosition);
        window.addEventListener('scroll', updatePanelPosition, true);

        return () => {
            window.removeEventListener('resize', updatePanelPosition);
            window.removeEventListener('scroll', updatePanelPosition, true);
        };
    }, [open, updatePanelPosition]);

    React.useEffect(() => {
        if (!open)
            return;

        const selectedIndex = filteredOptions.findIndex((option) => selectedValues.includes(normalizeOptionValue(option.value)) && !option.disabled);
        const firstEnabledIndex = filteredOptions.findIndex((option) => !option.disabled);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
    }, [filteredOptions, open, selectedValues]);

    React.useEffect(() => {
        if (open && showSearch)
            window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }, [open, showSearch]);

    React.useEffect(() => {
        if (!open && search)
            setSearch('');
    }, [open, search]);

    React.useEffect(() => {
        if (!open || !showSearch || !handleSearch)
            return;

        let ignore = false;
        setRemoteLoading(true);
        const timer = window.setTimeout(() => {
            handleSearch(search)
                .then((result) => {
                    if (!ignore)
                        setRemoteOptions(Array.isArray(result) ? result : []);
                })
                .catch(() => {
                    if (!ignore)
                        setRemoteOptions([]);
                })
                .finally(() => {
                    if (!ignore)
                        setRemoteLoading(false);
                });
        }, 220);

        return () => {
            ignore = true;
            window.clearTimeout(timer);
        };
    }, [handleSearch, open, search, showSearch]);

    const commitValue = React.useCallback((nextValue: SelectValue | SelectValue[]) => {
        if (!isControlled)
            setInnerValue(nextValue);
        onChange?.(nextValue);
    }, [isControlled, onChange]);

    const toggleOpen = React.useCallback(() => {
        if (disabled || readOnly)
            return;
        setOpen((current) => !current);
    }, [disabled, readOnly]);

    const selectOption = React.useCallback((option?: ISelectOption) => {
        if (!option || disabled || readOnly || option.disabled)
            return;

        const optionValue = normalizeOptionValue(option.value);

        if (isMulti) {
            const nextValue = selectedValues.includes(optionValue)
                ? selectedItems.filter((item) => normalizeOptionValue(item) !== optionValue)
                : [...selectedItems, option.value];
            commitValue(nextValue);
            return;
        }

        commitValue(option.value);
        setOpen(false);
    }, [commitValue, disabled, isMulti, readOnly, selectedItems, selectedValues]);

    const clearValue = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        if (disabled || readOnly)
            return;
        commitValue(isMulti ? [] : '');
        setOpen(false);
    }, [commitValue, disabled, isMulti, readOnly]);

    const moveActive = React.useCallback((direction: 1 | -1) => {
        setActiveIndex((currentIndex) => getNextEnabledIndex(filteredOptions, currentIndex < 0 ? 0 : currentIndex, direction));
    }, [filteredOptions]);

    const handleKeyboard = (event: React.KeyboardEvent<HTMLElement>) => {
        if (disabled || readOnly)
            return;

        if (event.key === 'Escape') {
            setOpen(false);
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
                setOpen(true);
                return;
            }
            moveActive(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }

        if (!open)
            return;

        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const orderedOptions = event.key === 'Home' ? filteredOptions : [...filteredOptions].reverse();
            const enabledOption = orderedOptions.find((option) => !option.disabled);
            setActiveIndex(enabledOption ? filteredOptions.findIndex((option) => option.value === enabledOption.value) : -1);
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectOption(activeOption);
        }
    };

    const panelNode = open ? (
        <div
            ref={panelRef}
            className={cn('datavisool-select-panel', panelClassName)}
            style={panelStyle}
        >
            {showSearch ? (
                <input
                    ref={searchInputRef}
                    value={search}
                    placeholder={finalSearchPlaceholder}
                    disabled={disabled}
                    className="datavisool-select-search"
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={handleKeyboard}
                />
            ) : null}

            <div
                id={listboxId}
                role="listbox"
                aria-multiselectable={isMulti || undefined}
                className="datavisool-select-list"
            >
                {remoteLoading ? (
                    <div className="datavisool-select-empty">
                        <IconLoader className="datavisool-select-loading-icon" size={15}/>
                        <span>{loadingText}</span>
                    </div>
                ) : filteredOptions.length ? (
                    filteredOptions.map((option, index) => {
                        const optionValue = normalizeOptionValue(option.value);
                        const selected = selectedValues.includes(optionValue);
                        const optionDisabled = disabled || option.disabled;

                        return (
                            <button
                                key={`${optionValue}-${index}`}
                                id={`${selectId}-option-${index}`}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                aria-disabled={optionDisabled || undefined}
                                disabled={optionDisabled}
                                className={cn(
                                    'datavisool-select-option',
                                    selected && 'datavisool-select-option-selected',
                                    activeIndex === index && 'datavisool-select-option-active',
                                )}
                                onMouseEnter={() => {
                                    if (!option.disabled)
                                        setActiveIndex(index);
                                }}
                                onClick={() => selectOption(option)}
                            >
                                <span className="datavisool-select-option-main">
                                    <span className="datavisool-select-option-label">{option.label}</span>
                                    {option.description ? <span className="datavisool-select-option-description">{option.description}</span> : null}
                                </span>
                                <span className="datavisool-select-option-check" aria-hidden="true">
                                    {selected ? <IconCheckCircle size={15}/> : null}
                                </span>
                            </button>
                        );
                    })
                ) : (
                    <div className="datavisool-select-empty">{emptyText}</div>
                )}
            </div>
        </div>
    ) : null;

    return (
        <UIContainer {...containerProps}>
            <div
                ref={rootRef}
                className={cn(
                    'datavisool-select-field',
                    `datavisool-select-size-${selectSize}`,
                    status !== 'default' && `datavisool-select-status-${status}`,
                    disabled && 'datavisool-select-disabled',
                    readOnly && 'datavisool-select-readonly',
                    block && 'datavisool-select-block',
                )}
            >
                <div
                    ref={shellRef}
                    className={cn(
                        'datavisool-select-shell',
                        open && 'datavisool-select-open',
                        styleProps.controlClassName,
                    )}
                    style={buildStyle(styleProps, styleProps.controlStyle)}
                    data-open={open ? 'true' : undefined}
                    data-disabled={disabled ? 'true' : undefined}
                    data-readonly={readOnly ? 'true' : undefined}
                >
                    <button
                        id={selectId}
                        type="button"
                        role="combobox"
                        aria-haspopup="listbox"
                        aria-expanded={open}
                        aria-controls={listboxId}
                        aria-activedescendant={activeOptionId}
                        aria-disabled={disabled || undefined}
                        aria-readonly={readOnly || undefined}
                        aria-required={required || undefined}
                        aria-invalid={status === 'error' ? true : undefined}
                        aria-describedby={helperId}
                        disabled={disabled}
                        className="datavisool-select-trigger"
                        onBlur={onBlur}
                        onFocus={onFocus}
                        onClick={toggleOpen}
                        onKeyDown={handleKeyboard}
                    >
                        {prefix ? <span className="datavisool-select-prefix">{prefix}</span> : null}
                        <span
                            key={`${hasValue ? 'value' : 'placeholder'}-${String(displayText)}`}
                            className={cn('datavisool-select-value', !hasValue && 'datavisool-select-placeholder')}
                            title={typeof displayText === 'string' ? displayText : undefined}
                        >
                            {displayText}
                        </span>
                        {isMulti && selectedValues.length > 0 ? <span className="datavisool-select-count">{selectedValues.length}</span> : null}
                        {allowClear && hasValue && !disabled && !readOnly ? (
                            <span
                                className="datavisool-select-clear"
                                role="button"
                                tabIndex={-1}
                                aria-label={t('清空选择')}
                                onClick={clearValue}
                                onPointerDown={(event) => event.stopPropagation()}
                            >
                                ×
                            </span>
                        ) : null}
                        <span className="datavisool-select-chevron">
                            {suffixIcon ?? <IconChevronDown size={16}/>}
                        </span>
                    </button>

                    {panelNode && typeof document !== 'undefined' ? createPortal(panelNode, document.body) : null}

                    {name ? (
                        isMulti
                            ? selectedItems.length
                                ? selectedItems.map((item) => <input key={normalizeOptionValue(item)} type="hidden" name={name} value={item} required={required} readOnly/>)
                                : <input type="hidden" name={name} value="" required={required} readOnly/>
                            : <input type="hidden" name={name} value={selectedValue} required={required} readOnly/>
                    ) : null}
                </div>

                {helperText ? (
                    <div id={helperId} className={cn('datavisool-select-helper', status !== 'default' && `datavisool-select-helper-${status}`)}>
                        {helperText}
                    </div>
                ) : null}
            </div>
        </UIContainer>
    );
}
