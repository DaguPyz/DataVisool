/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {buildStyle, splitControlStyleProps} from './style';

type GridBreakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl';
type GridColumns = number | Partial<Record<GridBreakpoint, number>>;
type GridVariant = 'plain' | 'surface' | 'panel';

export interface GridProps extends UIContainerProps {
    children?: React.ReactNode;
    columns?: GridColumns;
    gridGap?: React.CSSProperties['gap'];
    rowGap?: React.CSSProperties['rowGap'];
    columnGap?: React.CSSProperties['columnGap'];
    minItemWidth?: React.CSSProperties['minWidth'];
    responsive?: boolean;
    variant?: GridVariant;
    dense?: boolean;
    equalHeight?: boolean;
    alignItems?: React.CSSProperties['alignItems'];
    justifyItems?: React.CSSProperties['justifyItems'];
    autoFlow?: React.CSSProperties['gridAutoFlow'];
    role?: React.AriaRole;
    ariaLabel?: string;
    emptyText?: React.ReactNode;
}

export function Grid(props: GridProps) {
    const t = useDataVisoolUITranslate();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        children,
        columns = 1,
        gridGap = '12px',
        rowGap,
        columnGap,
        minItemWidth = '0px',
        responsive = true,
        variant = 'plain',
        dense,
        equalHeight,
        alignItems,
        justifyItems,
        autoFlow,
        role = 'group',
        ariaLabel,
        emptyText,
        ...containerProps
    } = restProps as GridProps;
    const hasChildren = React.Children.count(children) > 0;
    const gridLabel = ariaLabel ?? (typeof containerProps.label === 'string' ? containerProps.label : undefined);
    const gridStyle: React.CSSProperties = {
        ...getGridColumnVars(columns),
        '--datavisool-grid-gap': gridGap,
        '--datavisool-grid-row-gap': rowGap ?? gridGap,
        '--datavisool-grid-column-gap': columnGap ?? gridGap,
        '--datavisool-grid-min-item-width': typeof minItemWidth === 'number' ? `${minItemWidth}px` : minItemWidth,
        alignItems,
        justifyItems,
        gridAutoFlow: autoFlow,
        ...buildStyle(styleProps, styleProps.controlStyle),
    } as React.CSSProperties;

    return (
        <UIContainer {...containerProps}>
            <div
                className={cn(
                    'datavisool-grid',
                    `datavisool-grid-variant-${variant}`,
                    responsive && 'datavisool-grid-responsive',
                    dense && 'datavisool-grid-dense',
                    equalHeight && 'datavisool-grid-equal-height',
                    styleProps.controlClassName,
                )}
                role={role}
                aria-label={gridLabel}
                data-empty={!hasChildren ? 'true' : undefined}
                style={gridStyle}
            >
                {hasChildren ? children : <div className="datavisool-grid-empty">{emptyText ?? t('暂无内容')}</div>}
            </div>
        </UIContainer>
    );
}

function getGridColumnVars(columns: GridColumns): React.CSSProperties {
    const targetColumns = normalizeColumns(typeof columns === 'number' ? columns : columns.md ?? columns.lg ?? columns.xl ?? columns.base ?? 1);
    const columnConfig = typeof columns === 'number'
        ? {base: 1, sm: Math.min(targetColumns, 2), md: targetColumns, lg: targetColumns, xl: targetColumns}
        : columns;
    const baseColumns = normalizeColumns(columnConfig.base ?? 1);

    return {
        '--datavisool-grid-columns': baseColumns,
        '--datavisool-grid-columns-sm': normalizeColumns(columnConfig.sm ?? Math.min(baseColumns, 2)),
        '--datavisool-grid-columns-md': normalizeColumns(columnConfig.md ?? baseColumns),
        '--datavisool-grid-columns-lg': normalizeColumns(columnConfig.lg ?? columnConfig.md ?? baseColumns),
        '--datavisool-grid-columns-xl': normalizeColumns(columnConfig.xl ?? columnConfig.lg ?? columnConfig.md ?? baseColumns),
    } as React.CSSProperties;
}

function normalizeColumns(value: number): number {
    if (!Number.isFinite(value))
        return 1;
    return Math.max(1, Math.min(12, Math.floor(value)));
}
