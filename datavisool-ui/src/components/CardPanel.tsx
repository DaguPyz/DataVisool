/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {createPortal} from 'react-dom';
import {cn} from '@/lib/utils';
import {IconChevronDown, IconInfo} from './Icon';
import {buildStyle, DataVisoolStyleProps} from './style';

type CardPanelSize = 'sm' | 'md' | 'lg';
type CardPanelVariant = 'default' | 'surface' | 'plain';
type CardPanelStatus = 'default' | 'active' | 'success' | 'warning' | 'error';

export interface ItemPanelProps extends DataVisoolStyleProps {
    label: React.ReactNode;
    tip?: React.ReactNode;
    description?: React.ReactNode;
    extra?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
    panelSize?: CardPanelSize;
    variant?: CardPanelVariant;
    status?: CardPanelStatus;
    collapsible?: boolean;
    defaultCollapsed?: boolean;
    collapsed?: boolean;
    onCollapse?: (collapsed: boolean) => void;
    contentStyle?: React.CSSProperties;
    contentClassName?: string;
    headerStyle?: React.CSSProperties;
    headerClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
    extraClassName?: string;
    footerStyle?: React.CSSProperties;
    footerClassName?: string;
    className?: string;
    id?: string;
    ariaLabel?: string;
}

const tipViewportPadding = 8;
const tipOffset = 8;

function getTipPosition(trigger: DOMRect, popup: DOMRect) {
    const centeredLeft = trigger.left + trigger.width / 2 - popup.width / 2;
    const maxLeft = window.innerWidth - popup.width - tipViewportPadding;
    const topAbove = trigger.top - popup.height - tipOffset;
    const topBelow = trigger.bottom + tipOffset;
    const maxTop = window.innerHeight - popup.height - tipViewportPadding;

    return {
        left: Math.max(tipViewportPadding, Math.min(centeredLeft, maxLeft)),
        top: Math.max(tipViewportPadding, Math.min(topAbove >= tipViewportPadding ? topAbove : topBelow, maxTop)),
    };
}

function CardPanelTip(props: {tip: React.ReactNode; title?: string}) {
    const t = useDataVisoolUITranslate();
    const {tip, title} = props;
    const tooltipId = React.useId();
    const triggerRef = React.useRef<HTMLSpanElement | null>(null);
    const popupRef = React.useRef<HTMLSpanElement | null>(null);
    const hoverCloseTimerRef = React.useRef<number | null>(null);
    const focusCloseTimerRef = React.useRef<number | null>(null);
    const [hovered, setHovered] = React.useState(false);
    const [focused, setFocused] = React.useState(false);
    const [position, setPosition] = React.useState({top: 0, left: 0, measured: false});
    const open = hovered || focused;

    const clearHoverCloseTimer = React.useCallback(() => {
        if (hoverCloseTimerRef.current === null)
            return;
        window.clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = null;
    }, []);

    const clearFocusCloseTimer = React.useCallback(() => {
        if (focusCloseTimerRef.current === null)
            return;
        window.clearTimeout(focusCloseTimerRef.current);
        focusCloseTimerRef.current = null;
    }, []);

    const openFromHover = React.useCallback(() => {
        clearHoverCloseTimer();
        setHovered(true);
    }, [clearHoverCloseTimer]);

    const scheduleHoverClose = React.useCallback(() => {
        clearHoverCloseTimer();
        hoverCloseTimerRef.current = window.setTimeout(() => {
            setHovered(false);
            hoverCloseTimerRef.current = null;
        }, 120);
    }, [clearHoverCloseTimer]);

    const openFromFocus = React.useCallback(() => {
        clearFocusCloseTimer();
        setFocused(true);
    }, [clearFocusCloseTimer]);

    const scheduleFocusClose = React.useCallback(() => {
        clearFocusCloseTimer();
        focusCloseTimerRef.current = window.setTimeout(() => {
            const activeElement = document.activeElement;
            const focusInsideTip = activeElement instanceof Node && (
                Boolean(triggerRef.current?.contains(activeElement)) || Boolean(popupRef.current?.contains(activeElement))
            );
            setFocused(focusInsideTip);
            focusCloseTimerRef.current = null;
        }, 0);
    }, [clearFocusCloseTimer]);

    const updatePosition = React.useCallback(() => {
        const triggerNode = triggerRef.current;
        const popupNode = popupRef.current;

        if (!triggerNode || !popupNode)
            return;

        setPosition({
            ...getTipPosition(triggerNode.getBoundingClientRect(), popupNode.getBoundingClientRect()),
            measured: true,
        });
    }, []);

    React.useLayoutEffect(() => {
        if (!open)
            return;
        updatePosition();
    }, [open, tip, updatePosition]);

    React.useEffect(() => {
        if (!open)
            return;

        const handlePositionChange = () => updatePosition();
        window.addEventListener('resize', handlePositionChange);
        window.addEventListener('scroll', handlePositionChange, true);

        return () => {
            window.removeEventListener('resize', handlePositionChange);
            window.removeEventListener('scroll', handlePositionChange, true);
        };
    }, [open, updatePosition]);

    React.useEffect(() => {
        return () => {
            clearHoverCloseTimer();
            clearFocusCloseTimer();
        };
    }, [clearFocusCloseTimer, clearHoverCloseTimer]);

    const tooltip = open && typeof document !== 'undefined' ? createPortal(
        <span
            id={tooltipId}
            ref={popupRef}
            className="datavisool-card-panel-tip-content"
            role="tooltip"
            style={{
                left: position.left,
                top: position.top,
                visibility: position.measured ? 'visible' : 'hidden',
            }}
            onPointerEnter={openFromHover}
            onPointerLeave={scheduleHoverClose}
            onFocus={openFromFocus}
            onBlur={scheduleFocusClose}
        >
            {tip}
        </span>,
        document.body,
    ) : null;

    return (
        <>
            <span
                ref={triggerRef}
                className="datavisool-card-panel-tip"
                title={title}
                aria-label={title ?? t('面板说明')}
                aria-describedby={open ? tooltipId : undefined}
                tabIndex={0}
                onPointerEnter={openFromHover}
                onPointerLeave={scheduleHoverClose}
                onFocus={openFromFocus}
                onBlur={scheduleFocusClose}
            >
                <IconInfo size={14}/>
            </span>
            {tooltip}
        </>
    );
}

export function CardPanel(props: ItemPanelProps) {
    const t = useDataVisoolUITranslate();
    const generatedId = React.useId();
    const {
        label,
        tip,
        description,
        extra,
        footer,
        contentStyle,
        contentClassName,
        headerStyle,
        headerClassName,
        titleClassName,
        descriptionClassName,
        extraClassName,
        footerStyle,
        footerClassName,
        className,
        children,
        panelSize = 'md',
        variant = 'default',
        status = 'default',
        collapsible,
        defaultCollapsed,
        collapsed,
        onCollapse,
        id,
        ariaLabel,
    } = props;
    const controlled = collapsed !== undefined;
    const [innerCollapsed, setInnerCollapsed] = React.useState(Boolean(defaultCollapsed));
    const finalCollapsed = controlled ? Boolean(collapsed) : innerCollapsed;
    const panelId = id ?? `${generatedId}-card-panel`;
    const titleId = `${panelId}-title`;
    const contentId = `${panelId}-content`;
    const tipTitle = typeof tip === 'string' || typeof tip === 'number' ? String(tip) : undefined;

    const updateCollapsed = () => {
        const nextCollapsed = !finalCollapsed;
        if (!controlled)
            setInnerCollapsed(nextCollapsed);
        onCollapse?.(nextCollapsed);
    };

    return (
        <section
            id={panelId}
            className={cn(
                'datavisool-panel datavisool-card-panel',
                `datavisool-card-panel-size-${panelSize}`,
                `datavisool-card-panel-variant-${variant}`,
                status !== 'default' && `datavisool-card-panel-status-${status}`,
                finalCollapsed && 'datavisool-card-panel-collapsed',
                className,
            )}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : titleId}
            data-collapsed={finalCollapsed ? 'true' : undefined}
            data-status={status !== 'default' ? status : undefined}
            style={buildStyle(props)}
        >
            <header className={cn('datavisool-card-panel-header', headerClassName)} style={headerStyle}>
                <div className="datavisool-card-panel-heading">
                    <div className="datavisool-card-panel-title-row">
                        {collapsible ? (
                            <button
                                type="button"
                                className="datavisool-card-panel-collapse"
                                aria-label={finalCollapsed ? t('展开面板') : t('收起面板')}
                                aria-expanded={!finalCollapsed}
                                aria-controls={contentId}
                                onClick={updateCollapsed}
                            >
                                <IconChevronDown size={16}/>
                            </button>
                        ) : null}
                        <h3 id={titleId} className={cn('datavisool-card-panel-title', titleClassName)}>{label}</h3>
                        {tip ? <CardPanelTip tip={tip} title={tipTitle}/> : null}
                    </div>
                    {description ? <div className={cn('datavisool-card-panel-description', descriptionClassName)}>{description}</div> : null}
                </div>
                {extra ? <div className={cn('datavisool-card-panel-extra', extraClassName)}>{extra}</div> : null}
            </header>
            <div id={contentId} className={cn('datavisool-card-panel-content', contentClassName)} style={contentStyle} hidden={finalCollapsed}>
                {children}
            </div>
            {footer && !finalCollapsed ? (
                <footer className={cn('datavisool-card-panel-footer', footerClassName)} style={footerStyle}>
                    {footer}
                </footer>
            ) : null}
        </section>
    );
}
