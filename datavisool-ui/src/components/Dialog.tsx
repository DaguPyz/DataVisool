/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {createPortal} from 'react-dom';
import {cn} from '@/lib/utils';
import {IconX} from './Icon';

export interface DialogProps {
    title?: React.ReactNode;
    children: React.ReactNode;
    open?: boolean;
    onClose?: () => void;
    mask?: boolean;
    maskClosable?: boolean;
    initialPosition?: { x: number; y: number };
    width?: number | string;
    height?: number | string;
    className?: string;
    headerClassName?: string;
    bodyClassName?: string;
    hideHeader?: boolean;
    showClose?: boolean;
    centered?: boolean;
    zIndex?: number;
}

export function Dialog(props: DialogProps) {
    const t = useDataVisoolUITranslate();
    const {
        title,
        children,
        open = true,
        onClose,
        mask = false,
        maskClosable = true,
        initialPosition,
        width = 320,
        height = 'auto',
        className,
        headerClassName,
        bodyClassName,
        hideHeader = false,
        showClose = false,
        centered = false,
        zIndex,
    } = props;
    const [mounted, setMounted] = React.useState(open);
    const visible = open;
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const dragRef = React.useRef({
        isDragging: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        currentX: 0,
        currentY: 0,
    });

    React.useLayoutEffect(() => {
        let timer = 0;

        if (open) {
            setMounted(true);
        } else {
            timer = window.setTimeout(() => setMounted(false), 200);
        }

        return () => {
            if (timer)
                window.clearTimeout(timer);
        };
    }, [open]);

    const syncCenteredPosition = React.useCallback(() => {
        const wrapper = wrapperRef.current;
        const modal = wrapper?.querySelector<HTMLElement>('.datavisool-dialog');
        if (!wrapper || !modal)
            return;

        const x = Math.max(16, (window.innerWidth - modal.offsetWidth) / 2);
        const y = Math.max(16, (window.innerHeight - modal.offsetHeight) / 2);

        dragRef.current.currentX = x;
        dragRef.current.currentY = y;
        wrapper.style.transform = `translate(${x}px, ${y}px)`;
    }, []);

    React.useLayoutEffect(() => {
        const wrapper = wrapperRef.current;
        if (!mounted || !wrapper)
            return;

        if (centered) {
            syncCenteredPosition();
            return;
        }

        const {currentX, currentY} = dragRef.current;
        if (currentX === 0 && currentY === 0) {
            const fallbackWidth = typeof width === 'number' ? width : 320;
            dragRef.current.currentX = initialPosition?.x ?? (window.innerWidth - fallbackWidth) / 2;
            dragRef.current.currentY = initialPosition?.y ?? 100;
        }

        wrapper.style.transform = `translate(${dragRef.current.currentX}px, ${dragRef.current.currentY}px)`;
    }, [centered, mounted, initialPosition, syncCenteredPosition, width]);

    React.useEffect(() => {
        if (!mounted || !centered)
            return undefined;

        const handleResize = () => syncCenteredPosition();
        window.addEventListener('resize', handleResize);

        return () => window.removeEventListener('resize', handleResize);
    }, [centered, mounted, syncCenteredPosition]);

    React.useEffect(() => {
        if (!mounted || !centered || typeof ResizeObserver === 'undefined')
            return undefined;

        const modal = wrapperRef.current?.querySelector<HTMLElement>('.datavisool-dialog');
        if (!modal)
            return undefined;

        const observer = new ResizeObserver(() => syncCenteredPosition());
        observer.observe(modal);
        return () => observer.disconnect();
    }, [centered, mounted, syncCenteredPosition]);

    const handleMouseMove = React.useCallback((event: MouseEvent) => {
        if (!dragRef.current.isDragging || !wrapperRef.current)
            return;

        const nextX = dragRef.current.initialX + event.clientX - dragRef.current.startX;
        const nextY = dragRef.current.initialY + event.clientY - dragRef.current.startY;

        dragRef.current.currentX = nextX;
        dragRef.current.currentY = nextY;
        wrapperRef.current.style.transform = `translate(${nextX}px, ${nextY}px)`;
    }, []);

    const handleMouseUp = React.useCallback(() => {
        dragRef.current.isDragging = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);

    const handleMouseDown = React.useCallback((event: React.MouseEvent) => {
        if (!wrapperRef.current)
            return;

        dragRef.current.isDragging = true;
        dragRef.current.startX = event.clientX;
        dragRef.current.startY = event.clientY;
        dragRef.current.initialX = dragRef.current.currentX;
        dragRef.current.initialY = dragRef.current.currentY;

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove, handleMouseUp]);

    React.useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    if (!mounted || typeof document === 'undefined')
        return null;

    const hasTitle = title !== undefined && title !== null && title !== false && title !== '';
    const showHeader = !hideHeader && hasTitle;
    const showCloseButton = showClose && Boolean(onClose);

    return createPortal(
        <>
            {mask ? (
                <div
                    className={cn('datavisool-dialog-mask', visible && 'visible')}
                    style={zIndex ? {zIndex} : undefined}
                    onClick={maskClosable && onClose ? onClose : undefined}
                />
            ) : null}
            <div ref={wrapperRef} className="datavisool-dialog-wrapper" style={zIndex ? {zIndex: zIndex + 1} : undefined}>
                <div
                    className={cn('datavisool-dialog', visible && 'visible', className)}
                    style={{width, height}}
                    role="dialog"
                    aria-modal={mask || undefined}
                >
                    {showHeader ? (
                        <div className={cn('datavisool-dialog-header', headerClassName)} onMouseDown={handleMouseDown}>
                            <div className="datavisool-dialog-title">{title}</div>
                            {showCloseButton ? (
                                <button className="datavisool-dialog-close" type="button" aria-label={t('关闭')} title={t('关闭')} onClick={onClose}>
                                    <IconX size={16} strokeWidth={3}/>
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                    {!showHeader && showCloseButton ? (
                        <button className="datavisool-dialog-close datavisool-dialog-close-floating" type="button" aria-label={t('关闭')} title={t('关闭')} onClick={onClose}>
                            <IconX size={16} strokeWidth={3}/>
                        </button>
                    ) : null}
                    <div className={cn('datavisool-dialog-body', bodyClassName)}>
                        {children}
                    </div>
                </div>
            </div>
        </>,
        document.body,
    );
}

export default Dialog;
