/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {ReactNode} from 'react';
import {useEffect, useRef, useState} from 'react';

interface WorkspacePopoverProps {
    label: string;
    icon: ReactNode;
    triggerContent?: ReactNode;
    className?: string;
    align?: 'left' | 'right';
    children: (close: () => void) => ReactNode;
}

const WorkspacePopover = ({label, icon, triggerContent, className = '', align = 'left', children}: WorkspacePopoverProps) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const close = () => setOpen(false);

    useEffect(() => {
        if (!open) return;
        const root = rootRef.current;
        const closeOutside = (event: PointerEvent) => {
            if (!root?.contains(event.target as Node))
                close();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
            triggerRef.current?.focus();
        };
        document.addEventListener('pointerdown', closeOutside);
        root?.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            root?.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    return (
        <div className={`workspace-popover ${align === 'right' ? 'workspace-popover-right' : ''} ${className}`} ref={rootRef}>
            <button
                ref={triggerRef}
                type="button"
                className="workspace-icon-button workspace-popover-trigger"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                title={label}
                onClick={() => setOpen((value) => !value)}
            >
                {triggerContent ?? icon}
            </button>
            {open && <div className="workspace-popover-panel" role="menu" aria-label={label}>{children(close)}</div>}
        </div>
    );
};

export default WorkspacePopover;
