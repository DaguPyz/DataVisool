/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {IconChevronLeft, IconChevronRight} from './Icon';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

export type PaginationSize = 'sm' | 'md' | 'lg';

type PaginationItem = number | 'start-ellipsis' | 'end-ellipsis';

export interface PaginationProps extends UIContainerProps {
    current?: number;
    defaultCurrent?: number;
    total?: number;
    pageSize?: number;
    defaultPageSize?: number;
    pageCount?: number;
    disabled?: boolean;
    readOnly?: boolean;
    size?: PaginationSize;
    siblingCount?: number;
    boundaryCount?: number;
    showTotal?: boolean | ((total: number, range: [number, number]) => React.ReactNode);
    showQuickJumper?: boolean;
    showSizeChanger?: boolean;
    pageSizeOptions?: number[];
    simple?: boolean;
    hideOnSinglePage?: boolean;
    prevAriaLabel?: string;
    nextAriaLabel?: string;
    onChange?: (page: number, pageSize: number) => void;
    onPageSizeChange?: (pageSize: number, page: number) => void;
}

const defaultPageSizeOptions = [10, 20, 50, 100];

function clampPage(page: number, totalPages: number) {
    if (!Number.isFinite(page))
        return 1;
    return Math.min(Math.max(Math.trunc(page), 1), totalPages);
}

function range(start: number, end: number) {
    const length = Math.max(end - start + 1, 0);
    return Array.from({length}, (_, index) => start + index);
}

function buildPaginationItems(totalPages: number, current: number, siblingCount: number, boundaryCount: number): PaginationItem[] {
    const visibleCount = siblingCount * 2 + boundaryCount * 2 + 3;

    if (totalPages <= visibleCount)
        return range(1, totalPages);

    const startPages = range(1, Math.min(boundaryCount, totalPages));
    const endPages = range(Math.max(totalPages - boundaryCount + 1, boundaryCount + 1), totalPages);
    const siblingsStart = Math.max(
        Math.min(current - siblingCount, totalPages - boundaryCount - siblingCount * 2 - 1),
        boundaryCount + 2,
    );
    const siblingsEnd = Math.min(
        Math.max(current + siblingCount, boundaryCount + siblingCount * 2 + 2),
        totalPages - boundaryCount - 1,
    );
    const items: PaginationItem[] = [...startPages];

    if (siblingsStart > boundaryCount + 2)
        items.push('start-ellipsis');
    else
        items.push(...range(boundaryCount + 1, siblingsStart - 1));

    items.push(...range(siblingsStart, siblingsEnd));

    if (siblingsEnd < totalPages - boundaryCount - 1)
        items.push('end-ellipsis');
    else
        items.push(...range(siblingsEnd + 1, totalPages - boundaryCount));

    items.push(...endPages);

    return items;
}

export function Pagination(props: PaginationProps) {
    const t = useDataVisoolUITranslate();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        current,
        defaultCurrent = 1,
        total = 0,
        pageSize,
        defaultPageSize = 10,
        pageCount,
        disabled,
        readOnly,
        size = 'md',
        siblingCount = 1,
        boundaryCount = 1,
        showTotal,
        showQuickJumper,
        showSizeChanger,
        pageSizeOptions = defaultPageSizeOptions,
        simple,
        hideOnSinglePage,
        prevAriaLabel = t('上一页'),
        nextAriaLabel = t('下一页'),
        onChange,
        onPageSizeChange,
        ...containerProps
    } = restProps as PaginationProps;
    const isCurrentControlled = current !== undefined;
    const isPageSizeControlled = pageSize !== undefined;
    const [innerCurrent, setInnerCurrent] = React.useState(defaultCurrent);
    const [innerPageSize, setInnerPageSize] = React.useState(defaultPageSize);
    const [quickValue, setQuickValue] = React.useState('');
    const finalPageSize = Math.max(Math.trunc(isPageSizeControlled ? pageSize : innerPageSize), 1);
    const totalPages = Math.max(pageCount ?? Math.ceil(total / finalPageSize) ?? 1, 1);
    const finalCurrent = clampPage(isCurrentControlled ? current : innerCurrent, totalPages);
    const normalizedPageSizeOptions = React.useMemo(() => {
        const positiveOptions = [...pageSizeOptions, finalPageSize]
            .filter((option) => Number.isFinite(option) && option > 0)
            .map((option) => Math.trunc(option));

        return Array.from(new Set(positiveOptions))
            .sort((first, second) => first - second);
    }, [finalPageSize, pageSizeOptions]);
    const firstItem = total === 0 ? 0 : (finalCurrent - 1) * finalPageSize + 1;
    const lastItem = Math.min(finalCurrent * finalPageSize, total);
    const interactiveDisabled = disabled || readOnly;
    const pageItems = React.useMemo(
        () => buildPaginationItems(totalPages, finalCurrent, Math.max(siblingCount, 0), Math.max(boundaryCount, 0)),
        [boundaryCount, finalCurrent, siblingCount, totalPages],
    );

    if (hideOnSinglePage && totalPages <= 1)
        return null;

    const updatePage = (nextPage: number, nextPageSize = finalPageSize) => {
        const nextTotalPages = Math.max(pageCount ?? Math.ceil(total / nextPageSize) ?? 1, 1);
        const normalizedPage = clampPage(nextPage, nextTotalPages);

        if (interactiveDisabled || normalizedPage === finalCurrent && nextPageSize === finalPageSize)
            return;

        if (!isCurrentControlled)
            setInnerCurrent(normalizedPage);
        onChange?.(normalizedPage, nextPageSize);
    };

    const updatePageSize = (nextPageSize: number) => {
        if (interactiveDisabled || !Number.isFinite(nextPageSize) || nextPageSize <= 0)
            return;

        const normalizedPageSize = Math.trunc(nextPageSize);
        const nextTotalPages = Math.max(pageCount ?? Math.ceil(total / normalizedPageSize) ?? 1, 1);
        const nextPage = clampPage(finalCurrent, nextTotalPages);

        if (!isPageSizeControlled)
            setInnerPageSize(normalizedPageSize);
        if (!isCurrentControlled)
            setInnerCurrent(nextPage);
        onPageSizeChange?.(normalizedPageSize, nextPage);
        onChange?.(nextPage, normalizedPageSize);
    };

    const submitQuickJump = () => {
        const parsedPage = Number(quickValue);
        if (Number.isNaN(parsedPage))
            return;
        updatePage(parsedPage);
        setQuickValue('');
    };

    const totalNode = typeof showTotal === 'function'
        ? showTotal(total, [firstItem, lastItem])
        : showTotal
            ? t('共 {total} 条', {total})
            : null;

    return (
        <UIContainer {...containerProps}>
            <nav
                aria-label={t('分页')}
                aria-disabled={disabled || undefined}
                aria-readonly={readOnly || undefined}
                className={cn(
                    'datavisool-pagination',
                    `datavisool-pagination-size-${size}`,
                    simple && 'datavisool-pagination-simple',
                    disabled && 'datavisool-pagination-disabled',
                    readOnly && 'datavisool-pagination-readonly',
                    styleProps.controlClassName,
                )}
                data-disabled={disabled ? 'true' : undefined}
                data-readonly={readOnly ? 'true' : undefined}
                style={buildStyle(styleProps, styleProps.controlStyle)}
            >
                {totalNode ? <span className="datavisool-pagination-total">{totalNode}</span> : null}
                <div className="datavisool-pagination-pages">
                    <button
                        type="button"
                        className="datavisool-pagination-item datavisool-pagination-arrow"
                        aria-label={prevAriaLabel}
                        disabled={interactiveDisabled || finalCurrent <= 1}
                        onClick={() => updatePage(finalCurrent - 1)}
                    >
                        <IconChevronLeft/>
                    </button>
                    {simple ? (
                        <span className="datavisool-pagination-simple-text" aria-live="polite">
                            {finalCurrent} / {totalPages}
                        </span>
                    ) : (
                        pageItems.map((item) => item === 'start-ellipsis' || item === 'end-ellipsis' ? (
                            <span key={item} className="datavisool-pagination-ellipsis" aria-hidden="true">...</span>
                        ) : (
                            <button
                                key={item}
                                type="button"
                                className={cn('datavisool-pagination-item', item === finalCurrent && 'datavisool-pagination-item-active')}
                                aria-label={t('第 {page} 页', {page: item})}
                                aria-current={item === finalCurrent ? 'page' : undefined}
                                disabled={interactiveDisabled}
                                onClick={() => updatePage(item)}
                            >
                                {item}
                            </button>
                        ))
                    )}
                    <button
                        type="button"
                        className="datavisool-pagination-item datavisool-pagination-arrow"
                        aria-label={nextAriaLabel}
                        disabled={interactiveDisabled || finalCurrent >= totalPages}
                        onClick={() => updatePage(finalCurrent + 1)}
                    >
                        <IconChevronRight/>
                    </button>
                </div>
                {showSizeChanger ? (
                    <label className="datavisool-pagination-size-changer">
                        <span className="datavisool-pagination-control-label">{t('每页')}</span>
                        <select
                            value={finalPageSize}
                            disabled={interactiveDisabled}
                            className="datavisool-pagination-select"
                            onChange={(event) => updatePageSize(Number(event.target.value))}
                        >
                            {normalizedPageSizeOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>
                ) : null}
                {showQuickJumper ? (
                    <label className="datavisool-pagination-jumper">
                        <span className="datavisool-pagination-control-label">{t('跳至')}</span>
                        <input
                            value={quickValue}
                            min={1}
                            max={totalPages}
                            inputMode="numeric"
                            disabled={interactiveDisabled}
                            className="datavisool-pagination-input"
                            aria-label={t('跳转页码')}
                            onChange={(event) => setQuickValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter')
                                    submitQuickJump();
                            }}
                        />
                        <button
                            type="button"
                            className="datavisool-pagination-go"
                            disabled={interactiveDisabled || !quickValue}
                            onClick={submitQuickJump}
                        >
                            {t('确定')}
                        </button>
                    </label>
                ) : null}
            </nav>
        </UIContainer>
    );
}
