/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useCallback, useEffect, useRef} from 'react';
import bpWorkspaceUIStore from './BPWorkspaceUIStore';

const MIN_RIGHT_WIDTH = 260;
const MAX_RIGHT_WIDTH = 560;

/** Resizes the floating property panel while restoring global pointer styles. */
export default function useBPPanelResize() {
    const resizeRef = useRef<{
        startX: number;
        startWidth: number;
        cursor: string;
        userSelect: string;
    } | null>(null);

    const moveResize = useCallback((event: PointerEvent) => {
        const state = resizeRef.current;
        if (!state)
            return;
        const width = state.startWidth + state.startX - event.clientX;
        bpWorkspaceUIStore.setRightWidth(Math.min(MAX_RIGHT_WIDTH, Math.max(MIN_RIGHT_WIDTH, width)));
    }, []);

    const stopResize = useCallback(() => {
        if (!resizeRef.current)
            return;
        const {cursor, userSelect} = resizeRef.current;
        resizeRef.current = null;
        document.body.style.cursor = cursor;
        document.body.style.userSelect = userSelect;
        window.removeEventListener('pointermove', moveResize);
        window.removeEventListener('pointerup', stopResize);
        window.removeEventListener('pointercancel', stopResize);
        window.removeEventListener('blur', stopResize);
    }, [moveResize]);

    const startResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0)
            return;
        event.preventDefault();
        event.stopPropagation();
        stopResize();
        const panelWidth = event.currentTarget.closest<HTMLElement>('.bp-right')?.getBoundingClientRect().width;
        resizeRef.current = {
            startX: event.clientX,
            startWidth: panelWidth || bpWorkspaceUIStore.rightWidth,
            cursor: document.body.style.cursor,
            userSelect: document.body.style.userSelect,
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', moveResize);
        window.addEventListener('pointerup', stopResize);
        window.addEventListener('pointercancel', stopResize);
        window.addEventListener('blur', stopResize);
    }, [moveResize, stopResize]);

    useEffect(() => stopResize, [stopResize]);

    return startResize;
}
