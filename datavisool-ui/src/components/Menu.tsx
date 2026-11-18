/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {IconChevronDown} from './Icon';

export interface MenuClickInfo {
    key: string;
    keyPath: string[];
    domEvent: React.MouseEvent<HTMLButtonElement>;
}

export interface MenuItem {
    key: string;
    label: React.ReactNode;
    icon?: React.ReactNode;
    children?: MenuItemType[];
    disabled?: boolean;
    danger?: boolean;
    className?: string;
}

export interface MenuDivider {
    key?: string;
    type: 'divider';
    className?: string;
}

export type MenuItemType = MenuItem | MenuDivider;
export type MenuMode = 'inline';

export interface MenuProps {
    items?: MenuItemType[];
    mode?: MenuMode;
    selectedKeys?: string[];
    defaultSelectedKeys?: string[];
    openKeys?: string[];
    defaultOpenKeys?: string[];
    className?: string;
    style?: React.CSSProperties;
    itemClassName?: string;
    ariaLabel?: string;
    onClick?: (info: MenuClickInfo) => void;
    onOpenChange?: (openKeys: string[]) => void;
}

function isDivider(item: MenuItemType): item is MenuDivider {
    return (item as MenuDivider).type === 'divider';
}

function hasSelectedChild(item: MenuItem, selectedKeySet: Set<string>): boolean {
    if (!item.children)
        return false;

    return item.children.some((child) => {
        if (isDivider(child))
            return false;
        return selectedKeySet.has(child.key) || hasSelectedChild(child, selectedKeySet);
    });
}

export function Menu(props: MenuProps) {
    const t = useDataVisoolUITranslate();
    const {
        items = [],
        mode = 'inline',
        selectedKeys,
        defaultSelectedKeys = [],
        openKeys,
        defaultOpenKeys = [],
        className,
        style,
        itemClassName,
        ariaLabel = t('菜单'),
        onClick,
        onOpenChange,
    } = props;
    const [innerSelectedKeys, setInnerSelectedKeys] = React.useState(defaultSelectedKeys);
    const [innerOpenKeys, setInnerOpenKeys] = React.useState(defaultOpenKeys);
    const menuRef = React.useRef<HTMLElement | null>(null);
    const indicatorReadyFrameRef = React.useRef<number>();
    const mergedSelectedKeys = selectedKeys ?? innerSelectedKeys;
    const mergedOpenKeys = openKeys ?? innerOpenKeys;
    const activeMenuKey = mergedSelectedKeys[0];
    const selectedKeySet = React.useMemo(() => new Set(mergedSelectedKeys), [mergedSelectedKeys]);
    const openKeySet = React.useMemo(() => new Set(mergedOpenKeys), [mergedOpenKeys]);
    const [indicatorRect, setIndicatorRect] = React.useState({
        top: 0,
        left: 0,
        width: 0,
        height: 49,
        visible: false,
        ready: false,
    });

    const updateIndicatorByKey = React.useCallback((key?: string) => {
        const menuNode = menuRef.current;
        if (!menuNode || !key) {
            setIndicatorRect((prev) => ({...prev, visible: false}));
            return false;
        }

        const activeNode = Array.from(menuNode.querySelectorAll<HTMLElement>('[data-datavisool-menu-key]'))
            .find((node) => node.dataset.datavisoolMenuKey === key);
        const activeButton = activeNode?.querySelector<HTMLElement>(':scope > .datavisool-menu-item');
        if (!activeButton) {
            setIndicatorRect((prev) => ({...prev, visible: false}));
            return false;
        }

        const menuRect = menuNode.getBoundingClientRect();
        const activeRect = activeButton.getBoundingClientRect();
        setIndicatorRect((prev) => ({
            top: activeRect.top - menuRect.top + menuNode.scrollTop,
            left: activeRect.left - menuRect.left + menuNode.scrollLeft,
            width: activeRect.width,
            height: activeRect.height,
            visible: true,
            ready: prev.visible ? prev.ready : false,
        }));
        return true;
    }, []);

    const markIndicatorReady = React.useCallback(() => {
        if (indicatorReadyFrameRef.current)
            window.cancelAnimationFrame(indicatorReadyFrameRef.current);
        indicatorReadyFrameRef.current = window.requestAnimationFrame(() => {
            setIndicatorRect((prev) => ({...prev, ready: true}));
        });
    }, []);

    React.useLayoutEffect(() => {
        updateIndicatorByKey(activeMenuKey);
        markIndicatorReady();
    }, [activeMenuKey, markIndicatorReady, mergedOpenKeys, updateIndicatorByKey]);

    React.useEffect(() => () => {
        if (indicatorReadyFrameRef.current)
            window.cancelAnimationFrame(indicatorReadyFrameRef.current);
    }, []);

    const updateOpenKeys = React.useCallback((nextOpenKeys: string[]) => {
        if (openKeys === undefined)
            setInnerOpenKeys(nextOpenKeys);
        onOpenChange?.(nextOpenKeys);
    }, [onOpenChange, openKeys]);

    const toggleOpen = React.useCallback((key: string) => {
        const nextOpenKeys = openKeySet.has(key)
            ? mergedOpenKeys.filter((itemKey) => itemKey !== key)
            : [...mergedOpenKeys, key];
        updateOpenKeys(nextOpenKeys);
    }, [mergedOpenKeys, openKeySet, updateOpenKeys]);

    const handleItemClick = React.useCallback((item: MenuItem, keyPath: string[], event: React.MouseEvent<HTMLButtonElement>) => {
        if (item.disabled)
            return;
        if (selectedKeys === undefined)
            setInnerSelectedKeys([item.key]);
        onClick?.({key: item.key, keyPath, domEvent: event});
    }, [onClick, selectedKeys]);

    const renderItems = (menuItems: MenuItemType[], level: number, parentPath: string[]) => (
        <ul className="datavisool-menu-list" role={level === 0 ? 'menu' : 'group'}>
            {menuItems.map((item, index) => {
                if (isDivider(item)) {
                    return (
                        <li
                            key={item.key ?? `divider-${level}-${index}`}
                            className={cn('datavisool-menu-divider', item.className)}
                            role="separator"
                        />
                    );
                }

                const keyPath = [item.key, ...parentPath];
                const hasChildren = Boolean(item.children?.length);
                const selected = selectedKeySet.has(item.key);
                const childSelected = hasSelectedChild(item, selectedKeySet);
                const open = openKeySet.has(item.key);
                const itemStyle = {'--datavisool-menu-indent': `${16 + level * 22}px`} as React.CSSProperties;

                return (
                    <li
                        key={item.key}
                        data-datavisool-menu-key={item.key}
                        className={cn(
                            'datavisool-menu-node',
                            hasChildren && 'datavisool-menu-submenu',
                            selected && 'datavisool-menu-selected',
                            childSelected && 'datavisool-menu-child-selected',
                            open && 'datavisool-menu-open',
                            item.disabled && 'datavisool-menu-disabled',
                            item.danger && 'datavisool-menu-danger',
                            item.className,
                        )}
                        role="none"
                    >
                        <button
                            type="button"
                            className={cn('datavisool-menu-item', hasChildren && 'datavisool-menu-submenu-trigger', itemClassName)}
                            style={itemStyle}
                            disabled={item.disabled}
                            role="menuitem"
                            aria-current={selected ? 'page' : undefined}
                            aria-expanded={hasChildren ? open : undefined}
                            onClick={(event) => {
                                if (hasChildren) {
                                    toggleOpen(item.key);
                                    return;
                                }
                                handleItemClick(item, keyPath, event);
                            }}
                        >
                            {item.icon ? <span className="datavisool-menu-item-icon">{item.icon}</span> : null}
                            <span className="datavisool-menu-item-label">{item.label}</span>
                            {hasChildren ? (
                                <span className="datavisool-menu-submenu-arrow" aria-hidden="true">
                                    <IconChevronDown size={14}/>
                                </span>
                            ) : null}
                        </button>
                        {hasChildren ? (
                            <div className="datavisool-menu-submenu-children" hidden={!open}>
                                {renderItems(item.children ?? [], level + 1, keyPath)}
                            </div>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );

    return (
        <nav ref={menuRef} className={cn('datavisool-menu', `datavisool-menu-${mode}`, className)} style={style} aria-label={ariaLabel}>
            <div
                className={cn(
                    'datavisool-menu-active-indicator',
                    indicatorRect.visible && 'is-visible',
                    indicatorRect.ready && 'is-ready',
                )}
                style={{
                    top: indicatorRect.top,
                    left: indicatorRect.left,
                    width: indicatorRect.width,
                    height: indicatorRect.height,
                }}
            />
            {renderItems(items, 0, [])}
        </nav>
    );
}
