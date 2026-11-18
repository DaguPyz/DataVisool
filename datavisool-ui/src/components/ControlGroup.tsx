/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {IconChevronRight, IconMinus, IconPlus} from './Icon';
import {DatavisoolGUI} from './DatavisoolGUI';
import {Control, FieldChangeData, DatavisoolGUIUtil} from './schema';
import {buildStyle, DataVisoolStyleProps} from './style';
import {useDataVisoolUI, useDataVisoolUITranslate} from '../context/DataVisoolUIContext';

type ControlGroupItem = Record<string, any>;

export interface ControlGroupProps extends DataVisoolStyleProps {
    translate?: (text: string) => string;
    label?: React.ReactNode;
    itemName?: string;
    template?: Control;
    value?: object[];
    defaultValue?: object[];
    onChange?: (value: unknown) => void;
    defaultOpen?: boolean;
    disabled?: boolean;
    minCount?: number;
    maxCount?: number;
    emptyText?: React.ReactNode;
    addText?: string;
    removeText?: string;
    showCount?: boolean;
    className?: string;
    headerClassName?: string;
    headerStyle?: React.CSSProperties;
    contentClassName?: string;
    contentStyle?: React.CSSProperties;
}

function cloneValue<T>(value: T): T {
    if (Array.isArray(value))
        return value.map((entry) => cloneValue(entry)) as T;

    if (value && typeof value === 'object') {
        if (React.isValidElement(value))
            return value;

        const result: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
            result[key] = cloneValue(entry);
        });
        return result as T;
    }

    return value;
}

function normalizeItems(value?: object[]): ControlGroupItem[] {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => item && typeof item === 'object' ? cloneValue(item as ControlGroupItem) : {});
}

function mergeObject(originalData: any, newData: any): any {
    if (!originalData && !newData)
        return null;
    if (!originalData && newData)
        return newData;
    if (originalData && !newData)
        return originalData;

    Object.keys(newData).forEach((key) => {
        const newValue = newData[key];
        if (Object.prototype.hasOwnProperty.call(originalData, key)) {
            if (Array.isArray(newValue)) {
                originalData[key] = newValue;
            } else if (
                newValue &&
                typeof newValue === 'object' &&
                Object.keys(newValue).length > 0 &&
                originalData[key] &&
                typeof originalData[key] === 'object'
            ) {
                mergeObject(originalData[key], newValue);
            } else {
                originalData[key] = newValue;
            }
        } else {
            originalData[key] = newValue;
        }
    });
    return originalData;
}

function applyDisabledToSchema(control: Control, disabled: boolean): Control {
    if (!disabled)
        return control;

    return {
        ...control,
        config: {
            ...control.config,
            disabled: true,
        },
        children: control.children?.map((child) => applyDisabledToSchema(child, disabled)),
    };
}

function buildGroupSchema(items: ControlGroupItem[], template: Control | undefined, itemName: string, disabled: boolean): Control {
    if (!template)
        return {children: []};

    return {
        children: items.map((item, index) => ({
            type: 'accordion',
            key: String(index),
            label: `${itemName}${index + 1}`,
            config: {
                defaultActive: true,
                keepMounted: true,
                accordionSize: 'sm',
                variant: 'surface',
                disabled: disabled || undefined,
            },
            children: [
                applyDisabledToSchema(DatavisoolGUIUtil.schemaStructureAssignment(item, cloneValue(template)), disabled),
            ],
        })),
    };
}

export function ControlGroup(props: ControlGroupProps) {
    const {translate: contextTranslate} = useDataVisoolUI();
    const {
        label,
        itemName,
        template,
        value,
        defaultValue = [],
        translate,
        onChange,
        defaultOpen = false,
        disabled = false,
        minCount = 0,
        maxCount = Number.POSITIVE_INFINITY,
        emptyText,
        addText,
        removeText,
        showCount = true,
        className,
        headerClassName,
        headerStyle,
        contentClassName,
        contentStyle,
    } = props;
    const t = useDataVisoolUITranslate(translate);
    const resolvedTranslate = translate ?? contextTranslate;
    const resolvedItemName = itemName ?? t('系列');
    const resolvedEmptyText = emptyText ?? t('暂无配置项');
    const initialItems = React.useMemo(() => normalizeItems(value ?? defaultValue), []);
    const dataRef = React.useRef<ControlGroupItem[]>(initialItems);
    const [items, setItems] = React.useState<ControlGroupItem[]>(initialItems);
    const [open, setOpen] = React.useState(defaultOpen);
    const [hasOpened, setHasOpened] = React.useState(defaultOpen);
    const titleId = React.useId();
    const contentId = React.useId();
    const templateData = React.useMemo(() => template ? DatavisoolGUIUtil.parseSchemaData(template) as ControlGroupItem : {}, [template]);
    const schema = React.useMemo(() => buildGroupSchema(items, template, resolvedItemName, disabled), [disabled, items, resolvedItemName, template]);
    const canAdd = !disabled && !!template && items.length < maxCount;
    const canRemove = !disabled && items.length > minCount && items.length > 0;

    React.useEffect(() => {
        if (value === undefined)
            return;
        const nextItems = normalizeItems(value);
        dataRef.current = nextItems;
        setItems(nextItems);
    }, [value]);

    const updateItems = React.useCallback((nextItems: ControlGroupItem[]) => {
        dataRef.current = nextItems;
        setItems(nextItems);
        onChange?.(nextItems);
    }, [onChange]);

    const toggleOpen = React.useCallback(() => {
        if (disabled)
            return;
        setOpen((current) => {
            const next = !current;
            if (next)
                setHasOpened(true);
            return next;
        });
    }, [disabled]);

    const handleHeaderKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget)
            return;
        if (event.key !== 'Enter' && event.key !== ' ')
            return;
        event.preventDefault();
        toggleOpen();
    }, [toggleOpen]);

    const addGroup = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!canAdd)
            return;
        updateItems([...dataRef.current, cloneValue(templateData)]);
        setHasOpened(true);
        setOpen(true);
    }, [canAdd, templateData, updateItems]);

    const removeGroup = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!canRemove)
            return;
        updateItems(dataRef.current.slice(0, -1));
    }, [canRemove, updateItems]);

    const handleFieldChange = React.useCallback((fieldChangeData: FieldChangeData) => {
        if (disabled)
            return;

        const dataFragment = fieldChangeData.dataFragment as Record<string, any>;
        const [indexKey] = Object.keys(dataFragment);
        const index = Number(indexKey);
        if (!Number.isInteger(index) || index < 0)
            return;

        const nextItems = [...dataRef.current];
        nextItems[index] = mergeObject(cloneValue(nextItems[index] ?? {}), dataFragment[indexKey]) ?? {};
        updateItems(nextItems);
    }, [disabled, updateItems]);

    return (
        <section
            className={cn(
                'datavisool-control-group',
                open && 'datavisool-control-group-open',
                disabled && 'datavisool-control-group-disabled',
                className,
            )}
            data-open={open ? 'true' : undefined}
            data-disabled={disabled ? 'true' : undefined}
            style={buildStyle(props)}
        >
            <div
                className={cn('datavisool-control-group-header', headerClassName)}
                style={headerStyle}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-expanded={open}
                aria-controls={contentId}
                aria-labelledby={titleId}
                aria-disabled={disabled || undefined}
                onClick={toggleOpen}
                onKeyDown={handleHeaderKeyDown}
            >
                <span className="datavisool-control-group-heading">
                    <span id={titleId} className="datavisool-control-group-title">{label}</span>
                    {showCount ? <span className="datavisool-control-group-count">{items.length}</span> : null}
                </span>
                <span className="datavisool-control-group-actions">
                    <button
                        type="button"
                        className="datavisool-control-group-action"
                        aria-label={removeText ?? t('删除{itemName}', {itemName: resolvedItemName})}
                        title={removeText ?? t('删除{itemName}', {itemName: resolvedItemName})}
                        disabled={!canRemove}
                        onClick={removeGroup}
                    >
                        <IconMinus size={15}/>
                    </button>
                    <button
                        type="button"
                        className="datavisool-control-group-action datavisool-control-group-action-primary"
                        aria-label={addText ?? t('新增{itemName}', {itemName: resolvedItemName})}
                        title={addText ?? t('新增{itemName}', {itemName: resolvedItemName})}
                        disabled={!canAdd}
                        onClick={addGroup}
                    >
                        <IconPlus size={15}/>
                    </button>
                    <span className="datavisool-control-group-toggle" aria-hidden="true">
                        <IconChevronRight size={16}/>
                    </span>
                </span>
            </div>
            <div
                id={contentId}
                className="datavisool-control-group-body"
                role="region"
                aria-labelledby={titleId}
                aria-hidden={!open}
            >
                <div className="datavisool-control-group-body-inner">
                    <div className={cn('datavisool-control-group-content', contentClassName)} style={contentStyle}>
                        {hasOpened ? (
                            items.length > 0 && template ? (
                                <DatavisoolGUI
                                    className={disabled ? 'datavisool-control-group-disabled-content' : undefined}
                                    schema={schema}
                                    onFieldChange={handleFieldChange}
                                    emptyText={resolvedEmptyText}
                                    translate={resolvedTranslate}
                                />
                            ) : (
                                <div className="datavisool-control-group-empty">{resolvedEmptyText}</div>
                            )
                        ) : null}
                    </div>
                </div>
            </div>
        </section>
    );
}
