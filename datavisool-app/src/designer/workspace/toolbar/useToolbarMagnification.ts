/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect, useRef} from 'react';
import './ToolbarMagnification.less';

const INFLUENCE_RADIUS = 88;
const PROXIMITY_PROPERTY = '--workspace-tool-proximity';

/** Keep the magnification wave continuous across buttons and group dividers. */
export default function useToolbarMagnification(axis: 'x' | 'y' = 'x', itemSelector = '.workspace-icon-button') {
    const toolbarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const toolbar = toolbarRef.current;
        if (!toolbar) return;
        let buttons: HTMLButtonElement[] = [];
        let frame = 0;
        let pointer: {x: number; y: number} | null = null;

        const collectButtons = () => {
            const current = Array.from(toolbar.querySelectorAll<HTMLButtonElement>(itemSelector));
            buttons.filter((button) => !current.includes(button))
                .forEach((button) => button.style.removeProperty(PROXIMITY_PROPERTY));
            buttons = current;
        };

        const update = () => {
            frame = 0;
            collectButtons();
            const bounds = toolbar.getBoundingClientRect();
            const inside = pointer && pointer.x >= bounds.left && pointer.x <= bounds.right
                && pointer.y >= bounds.top && pointer.y <= bounds.bottom;
            const proximity = buttons.map((button) => {
                const rect = button.getBoundingClientRect();
                if (!inside || !pointer || !rect.width || !rect.height || button.disabled) return 0;
                const center = axis === 'x' ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
                const distance = Math.min(1, Math.abs(pointer[axis] - center) / INFLUENCE_RADIUS);
                return (1 + Math.cos(Math.PI * distance)) / 2;
            });
            buttons.forEach((button, index) => button.style.setProperty(PROXIMITY_PROPERTY, proximity[index].toFixed(4)));
        };

        const schedule = () => {
            if (!pointer) return;
            if (!frame) frame = requestAnimationFrame(update);
        };

        const move = (event: PointerEvent) => {
            if (event.pointerType === 'touch') return;
            pointer = {x: event.clientX, y: event.clientY};
            schedule();
        };

        const reset = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            pointer = null;
            collectButtons();
            buttons.forEach((button) => button.style.setProperty(PROXIMITY_PROPERTY, '0'));
        };

        toolbar.addEventListener('pointerenter', move);
        toolbar.addEventListener('pointermove', move);
        toolbar.addEventListener('pointerleave', reset);
        toolbar.addEventListener('pointercancel', reset);
        toolbar.addEventListener('scroll', schedule, true);
        window.addEventListener('blur', reset);
        window.addEventListener('resize', reset);
        return () => {
            reset();
            buttons.forEach((button) => button.style.removeProperty(PROXIMITY_PROPERTY));
            toolbar.removeEventListener('pointerenter', move);
            toolbar.removeEventListener('pointermove', move);
            toolbar.removeEventListener('pointerleave', reset);
            toolbar.removeEventListener('pointercancel', reset);
            toolbar.removeEventListener('scroll', schedule, true);
            window.removeEventListener('blur', reset);
            window.removeEventListener('resize', reset);
        };
    }, [axis, itemSelector]);

    return toolbarRef;
}
