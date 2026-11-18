/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {IconCheckCircle, IconChevronDown, IconLoader} from './Icon';
import {buildStyle, DataVisoolControlStyleProps, splitControlStyleProps} from './style';

type SearchableSelectSize = 'sm' | 'md' | 'lg';
type SearchableSelectStatus = 'default' | 'success' | 'warning' | 'error';

export interface SelectOption {
    label: string;
    value: string | number;
    disabled?: boolean;
    description?: React.ReactNode;
}

export type DataFetcher<T = any> = (keywords?: string) => Promise<T[] | null | undefined>;
export type DataTransformer<T = any> = (item: T) => SelectOption;
export type DataInitializer<T = any> = (values: (string | number)[] | string | number) => Promise<T[] | null | undefined>;

export interface SearchableSelectProps<T = any> extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'color' | 'defaultValue' | 'multiple' | 'onBlur' | 'onChange' | 'onFocus' | 'size' | 'style' | 'value'>, DataVisoolControlStyleProps {
    fetcher: DataFetcher<T>;
    transformer: DataTransformer<T>;
    initializer?: DataInitializer<T>;
    debounceDelay?: number;
    searchingText?: string;
    noDataText?: React.ReactNode;
    loadOnFocus?: boolean;
    value?: string | number;
    defaultValue?: string | number;
    searchPlaceholder?: string;
    selectPlaceholder?: string;
    helperText?: React.ReactNode;
    selectSize?: SearchableSelectSize;
    status?: SearchableSelectStatus;
    block?: boolean;
    onChange?: (value: string) => void;
    onBlur?: React.FocusEventHandler<HTMLElement>;
    onFocus?: React.FocusEventHandler<HTMLElement>;
}

const normalizeValue = (value: string | number | undefined) => value === undefined ? '' : String(value);

function getNextEnabledIndex(options: SelectOption[], currentIndex: number, direction: 1 | -1) {
    if (!options.length)
        return -1;

    for (let offset = 1; offset <= options.length; offset += 1) {
        const nextIndex = (currentIndex + offset * direction + options.length) % options.length;
        if (!options[nextIndex]?.disabled)
            return nextIndex;
    }

    return -1;
}

export function SearchableSelect<T = any>(props: SearchableSelectProps<T>) {
    const t = useDataVisoolUITranslate();
    const generatedId = React.useId();
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const searchInputRef = React.useRef<HTMLInputElement | null>(null);
    const requestSeqRef = React.useRef(0);
    const pendingRequestCountRef = React.useRef(0);
    const lastRequestedQueryRef = React.useRef<string | null>(null);
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        fetcher,
        transformer,
        initializer,
        debounceDelay = 320,
        searchingText = t('搜索中...'),
        noDataText = t('暂无数据'),
        loadOnFocus = true,
        value,
        defaultValue,
        searchPlaceholder = t('Search'),
        selectPlaceholder = t('请选择'),
        helperText,
        selectSize = 'md',
        status = 'default',
        block,
        className,
        disabled,
        required,
        name,
        id,
        autoFocus,
        onChange,
        onBlur,
        onFocus,
        ...nativeSelectProps
    } = restProps as unknown as SearchableSelectProps<T>;
    const {tabIndex, title} = nativeSelectProps;
    const isControlled = value !== undefined;
    const searchableSelectId = id ?? `${generatedId}-searchable-select`;
    const listboxId = `${searchableSelectId}-listbox`;
    const helperId = helperText ? `${searchableSelectId}-helper` : undefined;
    const [innerValue, setInnerValue] = React.useState(normalizeValue(defaultValue));
    const [options, setOptions] = React.useState<SelectOption[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [open, setOpen] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const finalValue = isControlled ? normalizeValue(value) : innerValue;
    const selectedOption = React.useMemo(() => options.find((option) => normalizeValue(option.value) === finalValue), [finalValue, options]);
    const displayText = selectedOption?.label ?? (finalValue || selectPlaceholder);
    const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;
    const activeOptionId = activeOption ? `${searchableSelectId}-option-${activeIndex}` : undefined;
    const searching = open && loading;

    const fetchOptions = React.useCallback((keywords: string) => {
        const requestId = requestSeqRef.current + 1;
        requestSeqRef.current = requestId;
        lastRequestedQueryRef.current = keywords;
        pendingRequestCountRef.current += 1;
        setLoaded(true);
        setLoading(true);

        fetcher(keywords)
            .then((list) => {
                if (requestSeqRef.current !== requestId)
                    return;
                setOptions((list ?? []).map(transformer));
            })
            .catch(() => {
                if (requestSeqRef.current === requestId)
                    setOptions([]);
            })
            .finally(() => {
                pendingRequestCountRef.current = Math.max(0, pendingRequestCountRef.current - 1);
                if (pendingRequestCountRef.current === 0)
                    setLoading(false);
            });
    }, [fetcher, transformer]);

    React.useEffect(() => {
        const initialValue = value ?? defaultValue;
        if (!initializer || initialValue === undefined)
            return;

        let ignore = false;
        initializer(initialValue)
            .then((list) => {
                if (!ignore && list)
                    setOptions(list.map(transformer));
            });

        return () => {
            ignore = true;
        };
    }, [defaultValue, initializer, transformer, value]);

    React.useEffect(() => {
        if (!open || lastRequestedQueryRef.current === search)
            return;

        if (!search && !loaded && loadOnFocus)
            return;

        const timer = window.setTimeout(() => fetchOptions(search), debounceDelay);
        return () => window.clearTimeout(timer);
    }, [debounceDelay, fetchOptions, loadOnFocus, loaded, open, search]);

    React.useEffect(() => {
        if (open)
            return;

        pendingRequestCountRef.current = 0;
        setLoading(false);
        if (search)
            setSearch('');
    }, [open, search]);

    React.useEffect(() => {
        if (!open)
            return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node))
                setOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

    React.useEffect(() => {
        if (!open)
            return;

        const selectedIndex = options.findIndex((option) => normalizeValue(option.value) === finalValue && !option.disabled);
        const firstEnabledIndex = options.findIndex((option) => !option.disabled);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
    }, [finalValue, open, options]);

    React.useEffect(() => {
        if (autoFocus)
            searchInputRef.current?.focus();
    }, [autoFocus]);

    React.useEffect(() => {
        if (searchInputRef.current)
            searchInputRef.current.placeholder = searchPlaceholder;
    }, [searchPlaceholder]);

    const openAndLoad = React.useCallback(() => {
        if (disabled)
            return;

        setOpen(true);
        if (loadOnFocus && !loaded)
            fetchOptions('');
    }, [disabled, fetchOptions, loadOnFocus, loaded]);

    const commitValue = React.useCallback((nextValue: string) => {
        if (!isControlled)
            setInnerValue(nextValue);
        onChange?.(nextValue);
        setLoading(false);
        pendingRequestCountRef.current = 0;
        if (searchInputRef.current)
            searchInputRef.current.placeholder = searchPlaceholder;
        setOpen(false);
        setSearch('');
    }, [isControlled, onChange, searchPlaceholder]);

    const selectOption = React.useCallback((option?: SelectOption) => {
        if (!option || disabled || option.disabled)
            return;
        commitValue(normalizeValue(option.value));
    }, [commitValue, disabled]);

    const moveActive = React.useCallback((direction: 1 | -1) => {
        setActiveIndex((currentIndex) => getNextEnabledIndex(options, currentIndex < 0 ? 0 : currentIndex, direction));
    }, [options]);

    const handleKeyboard = (event: React.KeyboardEvent<HTMLElement>) => {
        if (disabled)
            return;

        if (event.key === 'Escape') {
            setOpen(false);
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
                openAndLoad();
                return;
            }
            moveActive(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }

        if (!open)
            return;

        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const orderedOptions = event.key === 'Home' ? options : [...options].reverse();
            const enabledOption = orderedOptions.find((option) => !option.disabled);
            setActiveIndex(enabledOption ? options.findIndex((option) => option.value === enabledOption.value) : -1);
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            selectOption(activeOption);
        }
    };

    return (
        <div
            className={cn(
                'datavisool-searchable-select-field',
                `datavisool-searchable-select-size-${selectSize}`,
                status !== 'default' && `datavisool-searchable-select-status-${status}`,
                disabled && 'datavisool-searchable-select-disabled',
                block && 'datavisool-searchable-select-block',
                className,
            )}
        >
            <div
                ref={rootRef}
                className={cn(
                    'datavisool-searchable-select',
                    open && 'datavisool-searchable-select-open',
                    styleProps.controlClassName,
                )}
                data-open={open ? 'true' : undefined}
                data-disabled={disabled ? 'true' : undefined}
                style={buildStyle(styleProps, styleProps.controlStyle)}
            >
                <div className="datavisool-searchable-select-search">
                    <input
                        ref={searchInputRef}
                        type="search"
                        value={search}
                        disabled={disabled}
                        tabIndex={tabIndex}
                        title={title}
                        placeholder={searchPlaceholder}
                        aria-controls={listboxId}
                        aria-expanded={open}
                        aria-autocomplete="list"
                        aria-describedby={helperId}
                        className="datavisool-searchable-select-input"
                        onBlur={onBlur}
                        onFocus={(event) => {
                            onFocus?.(event);
                            openAndLoad();
                        }}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setOpen(true);
                        }}
                        onKeyDown={handleKeyboard}
                    />
                </div>
                <button
                    id={searchableSelectId}
                    type="button"
                    role="combobox"
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    aria-activedescendant={activeOptionId}
                    aria-disabled={disabled || undefined}
                    aria-required={required || undefined}
                    aria-invalid={status === 'error' ? true : undefined}
                    aria-describedby={helperId}
                    disabled={disabled}
                    tabIndex={tabIndex}
                    title={title}
                    className="datavisool-searchable-select-trigger"
                    onBlur={onBlur}
                    onFocus={onFocus}
                    onClick={() => {
                        if (open)
                            setOpen(false);
                        else
                            openAndLoad();
                    }}
                    onKeyDown={handleKeyboard}
                >
                    <span className={cn('datavisool-searchable-select-value', !finalValue && 'datavisool-searchable-select-placeholder')} title={typeof displayText === 'string' ? displayText : undefined}>
                        {displayText}
                    </span>
                    <IconChevronDown className="datavisool-searchable-select-chevron" size={16}/>
                </button>

                {open ? (
                    <div className="datavisool-searchable-select-panel">
                        <div id={listboxId} role="listbox" className="datavisool-searchable-select-list">
                            {searching ? (
                                <div className="datavisool-searchable-select-empty">
                                    <IconLoader className="datavisool-searchable-select-loading-icon" size={15}/>
                                    <span>{searchingText}</span>
                                </div>
                            ) : options.length ? (
                                options.map((option, index) => {
                                    const optionValue = normalizeValue(option.value);
                                    const selected = optionValue === finalValue;
                                    const optionDisabled = disabled || option.disabled;

                                    return (
                                        <button
                                            key={`${optionValue}-${index}`}
                                            id={`${searchableSelectId}-option-${index}`}
                                            type="button"
                                            role="option"
                                            aria-selected={selected}
                                            aria-disabled={optionDisabled || undefined}
                                            disabled={optionDisabled}
                                            className={cn(
                                                'datavisool-searchable-select-option',
                                                selected && 'datavisool-searchable-select-option-selected',
                                                activeIndex === index && 'datavisool-searchable-select-option-active',
                                            )}
                                            onMouseEnter={() => {
                                                if (!option.disabled)
                                                    setActiveIndex(index);
                                            }}
                                            onClick={() => selectOption(option)}
                                        >
                                            <span className="datavisool-searchable-select-option-main">
                                                <span className="datavisool-searchable-select-option-label">{option.label}</span>
                                                {option.description ? <span className="datavisool-searchable-select-option-description">{option.description}</span> : null}
                                            </span>
                                            <span className="datavisool-searchable-select-option-check" aria-hidden="true">
                                                {selected ? <IconCheckCircle size={15}/> : null}
                                            </span>
                                        </button>
                                    );
                                })
                            ) : (
                                <div className="datavisool-searchable-select-empty">{noDataText}</div>
                            )}
                        </div>
                    </div>
                ) : null}

                {name ? <input type="hidden" name={name} value={finalValue} required={required} readOnly/> : null}
            </div>

            {helperText ? (
                <div id={helperId} className={cn('datavisool-searchable-select-helper', status !== 'default' && `datavisool-searchable-select-helper-${status}`)}>
                    {helperText}
                </div>
            ) : null}
        </div>
    );
}
