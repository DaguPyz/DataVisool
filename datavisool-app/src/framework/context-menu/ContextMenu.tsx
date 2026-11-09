/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import './ContextMenu.less';
import {type ReactNode, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

const VIEWPORT_MARGIN = 8;
const SUBMENU_VERTICAL_OFFSET = 8;
const ROOT_MENU_PATH = 'root';

const positionSubmenu = (submenu: HTMLElement, anchor: HTMLElement) => {
    const parentRect = anchor.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();
    const submenuWidth = submenuRect.width || 220;
    const submenuHeight = submenuRect.height;
    const canOpenLeft = parentRect.left - submenuWidth >= VIEWPORT_MARGIN;
    const opensLeft = parentRect.right + submenuWidth > window.innerWidth - VIEWPORT_MARGIN
        && canOpenLeft;
    let left = opensLeft ? parentRect.left - submenuWidth : parentRect.right;
    left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(left, Math.max(VIEWPORT_MARGIN, window.innerWidth - submenuWidth - VIEWPORT_MARGIN)),
    );
    let top = parentRect.top - SUBMENU_VERTICAL_OFFSET;
    top = Math.max(
        VIEWPORT_MARGIN,
        Math.min(top, Math.max(VIEWPORT_MARGIN, window.innerHeight - submenuHeight - VIEWPORT_MARGIN)),
    );

    submenu.classList.toggle('context-menu-submenu-open-left', opensLeft);
    submenu.style.setProperty('--context-submenu-left', `${left}px`);
    submenu.style.setProperty('--context-submenu-top', `${top}px`);
};

const isSubmenuPathOpen = (openPath: string, itemPath: string) => {
    return openPath === itemPath || openPath.startsWith(`${itemPath}/`);
};

export interface IContextMenuItem {
    name: string;
    icon?: any;
    shortcut?: ReactNode;
    onClick?: (...args: any[]) => void;
    onPointerDown?: (...args: any[]) => void;
    children?: IContextMenuItem[];
    className?: string;
    separated?: boolean;
}

export interface ContextMenuProps {
    menus: IContextMenuItem[];
    visible: boolean;
    position: [number, number];
    className?: string;
    width?: number;
    itemHeight?: number;
}

export default function ContextMenu(props: ContextMenuProps) {
    const {menus, visible, position, className, width = 160} = props;
    const [positionX, positionY] = position;
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef(new Map<string, HTMLDivElement>());
    const submenuRefs = useRef(new Map<string, HTMLDivElement>());
    const [openSubmenuPath, setOpenSubmenuPath] = useState(ROOT_MENU_PATH);

    useEffect(() => {
        setOpenSubmenuPath(ROOT_MENU_PATH);
    }, [visible, positionX, positionY]);

    useLayoutEffect(() => {
        if (!visible || !containerRef.current)
            return;
        const updateSubmenuPositions = () => {
            submenuRefs.current.forEach((submenu, path) => {
                const anchor = itemRefs.current.get(path);
                if (anchor)
                    positionSubmenu(submenu, anchor);
            });
        };
        const updateLayout = () => {
            const container = containerRef.current;
            if (!container)
                return;
            container.style.left = `${positionX}px`;
            container.style.top = `${positionY}px`;
            const containerRect = container.getBoundingClientRect();
            const left = Math.max(
                VIEWPORT_MARGIN,
                Math.min(positionX, Math.max(VIEWPORT_MARGIN, window.innerWidth - containerRect.width - VIEWPORT_MARGIN)),
            );
            const top = Math.max(
                VIEWPORT_MARGIN,
                Math.min(positionY, Math.max(VIEWPORT_MARGIN, window.innerHeight - containerRect.height - VIEWPORT_MARGIN)),
            );
            container.style.left = `${left}px`;
            container.style.top = `${top}px`;
            updateSubmenuPositions();
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        document.addEventListener('scroll', updateSubmenuPositions, true);
        return () => {
            window.removeEventListener('resize', updateLayout);
            document.removeEventListener('scroll', updateSubmenuPositions, true);
        };
    }, [visible, menus, positionX, positionY, width, props.itemHeight, openSubmenuPath]);

    const buildMenuList = (items: IContextMenuItem[], parentPath = ROOT_MENU_PATH) => {
        const menuListDom = [];
        for (let i = 0; i < items.length; i++) {
            const menuItem = items[i];
            const Icon = menuItem.icon;
            const hasChildren = Boolean(menuItem.children?.length);
            const itemPath = `${parentPath}/${i}`;
            const submenuOpen = hasChildren && isSubmenuPathOpen(openSubmenuPath, itemPath);
            menuListDom.push(
                <div
                    key={itemPath}
                    ref={(element) => {
                        if (element)
                            itemRefs.current.set(itemPath, element);
                        else
                            itemRefs.current.delete(itemPath);
                    }}
                    className={[
                        'context-menu-item',
                        hasChildren ? 'context-menu-item-has-children' : '',
                        menuItem.className,
                        menuItem.separated ? 'context-menu-item-separated' : ''
                    ].filter(Boolean).join(' ')}
                    onPointerDown={(event) => {
                        if (!menuItem.onPointerDown)
                            return;
                        event.preventDefault();
                        event.stopPropagation();
                        menuItem.onPointerDown(event);
                    }}
                    onClick={(event) => {
                        const clickedItem = (event.target as Element).closest('.context-menu-item');
                        if (clickedItem !== event.currentTarget)
                            return;
                        if (hasChildren) {
                            event.stopPropagation();
                            setOpenSubmenuPath(itemPath);
                            return;
                        }
                        menuItem.onClick?.(event);
                    }}
                    onMouseEnter={(event) => {
                        event.stopPropagation();
                        setOpenSubmenuPath(hasChildren ? itemPath : parentPath);
                    }}
                >
                    <span className="context-menu-icon">{Icon ? <Icon/> : null}</span>
                    <span className="context-menu-text">{menuItem.name}</span>
                    {menuItem.shortcut ? <span className="context-menu-shortcut">{menuItem.shortcut}</span> : null}
                    {hasChildren ? <span className="context-menu-submenu-arrow">›</span> : null}
                    {submenuOpen ? createPortal(
                        <div
                            ref={(element) => {
                                if (element) {
                                    submenuRefs.current.set(itemPath, element);
                                    const anchor = itemRefs.current.get(itemPath);
                                    if (anchor)
                                        positionSubmenu(element, anchor);
                                } else {
                                    submenuRefs.current.delete(itemPath);
                                }
                            }}
                            className={[
                                'context-menu-container',
                                'context-menu-submenu',
                                className,
                            ].filter(Boolean).join(' ')}
                            style={{width: 220, zIndex: 10000}}
                        >
                            {buildMenuList(menuItem.children!, itemPath)}
                        </div>,
                        document.body,
                        `${itemPath}-submenu`,
                    ) : null}
                </div>
            )
        }
        return menuListDom;
    }

    if (!visible)
        return null;

    return createPortal(
        <div className={[
            'context-menu-container',
            className
        ].filter(Boolean).join(' ')} ref={containerRef} style={{
            position: 'fixed',
            top: positionY,
            left: positionX,
            width,
            zIndex: 9999,
        }}>
            {buildMenuList(menus)}
        </div>,
        document.body,
    );
}
