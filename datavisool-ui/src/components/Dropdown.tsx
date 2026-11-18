/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {createPortal, flushSync} from 'react-dom';
import {cn} from '@/lib/utils';

export type DropdownPlacement = 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
export type DropdownTrigger = 'click' | 'hover';

export interface DropdownClickInfo {
    key: string;
    domEvent: React.MouseEvent<HTMLButtonElement>;
}

export interface DropdownItem {
    key: string;
    label: React.ReactNode;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
    className?: string;
    onClick?: (info: DropdownClickInfo) => void;
}

export interface DropdownDivider {
    key?: string;
    type: 'divider';
}

export type DropdownMenuItem = DropdownItem | DropdownDivider;

export interface DropdownMenu {
    items?: DropdownMenuItem[];
    onClick?: (info: DropdownClickInfo) => void;
}

export interface DropdownProps {
    children: React.ReactElement;
    items?: DropdownMenuItem[];
    menu?: DropdownMenu;
    overlay?: React.ReactNode;
    trigger?: DropdownTrigger[];
    placement?: DropdownPlacement;
    open?: boolean;
    defaultOpen?: boolean;
    disabled?: boolean;
    closeOnSelect?: boolean;
    offset?: number;
    className?: string;
    popupClassName?: string;
    popupStyle?: React.CSSProperties;
    onOpenChange?: (open: boolean) => void;
}

const viewportPadding = 8;

function isDropdownItem(item: DropdownMenuItem): item is DropdownItem {
    return (item as DropdownDivider).type !== 'divider';
}

function getPopupPosition(trigger: DOMRect, popup: DOMRect, placement: DropdownPlacement, offset: number) {
    const isTop = placement.startsWith('top');
    const alignRight = placement.endsWith('Right');
    const rawTop = isTop ? trigger.top - popup.height - offset : trigger.bottom + offset;
    const rawLeft = alignRight ? trigger.right - popup.width : trigger.left;
    const maxLeft = window.innerWidth - popup.width - viewportPadding;
    const maxTop = window.innerHeight - popup.height - viewportPadding;

    return {
        top: Math.max(viewportPadding, Math.min(rawTop, maxTop)),
        left: Math.max(viewportPadding, Math.min(rawLeft, maxLeft)),
    };
}

function resolveTriggerAnchor(wrapper: HTMLElement, target?: EventTarget | null): HTMLElement {
    if (target instanceof Element) {
        const interactive = target.closest('button,a,input,select,textarea,[role="button"],[tabindex]');

        if (interactive instanceof HTMLElement && wrapper.contains(interactive))
            return interactive;

        if (target instanceof HTMLElement && target !== wrapper && wrapper.contains(target))
            return target;
    }

    return wrapper.firstElementChild instanceof HTMLElement ? wrapper.firstElementChild : wrapper;
}

export function Dropdown(props: DropdownProps) {
    const {
        children,
        items,
        menu,
        overlay,
        trigger = ['click'],
        placement = 'bottomLeft',
        open,
        defaultOpen = false,
        disabled,
        closeOnSelect = true,
        offset = 8,
        className,
        popupClassName,
        popupStyle,
        onOpenChange,
    } = props;
    const menuItems = menu?.items ?? items ?? [];
    const triggerRef = React.useRef<HTMLElement | null>(null);
    const anchorRef = React.useRef<HTMLElement | null>(null);
    const popupRef = React.useRef<HTMLDivElement | null>(null);
    const hoverCloseTimerRef = React.useRef<number | null>(null);
    const popupId = React.useId();
    const isControlled = open !== undefined;
    const [innerOpen, setInnerOpen] = React.useState(defaultOpen);
    const [position, setPosition] = React.useState({top: 0, left: 0, measured: false});
    const isOpen = !disabled && (isControlled ? open : innerOpen);
    const useClick = trigger.includes('click');
    const useHover = trigger.includes('hover');

    const updateOpen = React.useCallback((nextOpen: boolean) => {
        if (disabled)
            return;
        if (nextOpen)
            setPosition((current) => ({...current, measured: false}));
        if (!isControlled)
            setInnerOpen(nextOpen);
        onOpenChange?.(nextOpen);
    }, [disabled, isControlled, onOpenChange]);

    const updatePosition = React.useCallback(() => {
        if (!anchorRef.current && triggerRef.current)
            anchorRef.current = resolveTriggerAnchor(triggerRef.current);

        const triggerNode = anchorRef.current ?? triggerRef.current;
        const popupNode = popupRef.current;

        if (!triggerNode || !popupNode)
            return;

        const nextPosition = getPopupPosition(
            triggerNode.getBoundingClientRect(),
            popupNode.getBoundingClientRect(),
            placement,
            offset,
        );
        setPosition({...nextPosition, measured: true});
    }, [offset, placement]);

    React.useLayoutEffect(() => {
        if (!isOpen)
            return;
        updatePosition();
    }, [isOpen, menuItems.length, overlay, updatePosition]);

    React.useEffect(() => {
        if (!isOpen)
            return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target) || popupRef.current?.contains(target))
                return;
            updateOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                updateOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen, updateOpen, updatePosition]);

    React.useEffect(() => () => {
        if (hoverCloseTimerRef.current)
            window.clearTimeout(hoverCloseTimerRef.current);
    }, []);

    const clearHoverCloseTimer = () => {
        if (!hoverCloseTimerRef.current)
            return;
        window.clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = null;
    };

    const scheduleHoverClose = () => {
        if (!useHover)
            return;
        clearHoverCloseTimer();
        hoverCloseTimerRef.current = window.setTimeout(() => updateOpen(false), 120);
    };

    const handleItemClick = (item: DropdownItem, event: React.MouseEvent<HTMLButtonElement>) => {
        if (item.disabled)
            return;

        const info = {key: item.key, domEvent: event};
        if (closeOnSelect)
            flushSync(() => updateOpen(false));
        item.onClick?.(info);
        menu?.onClick?.(info);
    };

    const triggerNode = React.cloneElement(children, {
        'aria-haspopup': 'menu',
        'aria-expanded': isOpen,
        'aria-controls': isOpen ? popupId : undefined,
    } as Partial<React.HTMLAttributes<HTMLElement>>);

    const handleTriggerPointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
        if (!useClick || event.button !== 0 || event.defaultPrevented)
            return;
        anchorRef.current = resolveTriggerAnchor(event.currentTarget, event.target);
        updateOpen(!isOpen);
    };

    const triggerWrapper = (
        <span
            ref={triggerRef}
            className={cn('datavisool-dropdown-trigger', className)}
            onPointerDown={handleTriggerPointerDown}
            onMouseEnter={(event) => {
                if (useHover) {
                    anchorRef.current = resolveTriggerAnchor(event.currentTarget, event.target);
                    clearHoverCloseTimer();
                    updateOpen(true);
                }
            }}
            onMouseLeave={scheduleHoverClose}
            onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    anchorRef.current = resolveTriggerAnchor(event.currentTarget, event.target);
                    updateOpen(true);
                }
            }}
        >
            {triggerNode}
        </span>
    );

    const popup = isOpen ? (
        <div
            id={popupId}
            ref={popupRef}
            role="menu"
            className={cn('datavisool-dropdown-popup', `datavisool-dropdown-placement-${placement}`, popupClassName)}
            style={{
                ...popupStyle,
                top: position.top,
                left: position.left,
                visibility: position.measured ? 'visible' : 'hidden',
            }}
            onMouseEnter={clearHoverCloseTimer}
            onMouseLeave={scheduleHoverClose}
            onClick={(event) => event.stopPropagation()}
        >
            {overlay ?? (
                <div className="datavisool-dropdown-menu">
                    {menuItems.map((item, index) => {
                        if (!isDropdownItem(item)) {
                            return (
                                <div
                                    key={item.key ?? `divider-${index}`}
                                    className="datavisool-dropdown-divider"
                                    role="separator"
                                />
                            );
                        }

                        return (
                            <button
                                key={item.key}
                                type="button"
                                role="menuitem"
                                disabled={item.disabled}
                                className={cn(
                                    'datavisool-dropdown-item',
                                    item.danger && 'datavisool-dropdown-item-danger',
                                    item.className,
                                )}
                                onClick={(event) => handleItemClick(item, event)}
                            >
                                {item.icon ? <span className="datavisool-dropdown-item-icon">{item.icon}</span> : null}
                                <span className="datavisool-dropdown-item-label">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    ) : null;

    return (
        <>
            {triggerWrapper}
            {popup && typeof document !== 'undefined' ? createPortal(popup, document.body) : null}
        </>
    );
}
