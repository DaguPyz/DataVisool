/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {BoxSelectionMode, Point, Rect} from './types';
import {SelectionOverlay} from '../dom/SelectionOverlay';

interface SelectionBoxSession {
    startPoint: Point;
    currentPoint: Point;
    rect: Rect;
    mode: BoxSelectionMode;
    additive: boolean;
    moved: boolean;
}

export interface SelectionBoxResult {
    rect: Rect;
    mode: BoxSelectionMode;
    additive: boolean;
    moved: boolean;
}

export interface SelectionBoxControllerOptions {
    overlay?: SelectionOverlay;
    threshold?: number;
}

function createRect(startPoint: Point, currentPoint: Point): Rect {
    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);

    return {
        x,
        y,
        width: Math.abs(currentPoint.x - startPoint.x),
        height: Math.abs(currentPoint.y - startPoint.y),
    };
}

export class SelectionBoxController {
    private session: SelectionBoxSession | null = null;

    private readonly overlay: SelectionOverlay;

    private readonly threshold: number;

    constructor(options: SelectionBoxControllerOptions = {}) {
        this.overlay = options.overlay ?? new SelectionOverlay();
        this.threshold = options.threshold ?? 4;
    }

    attach(container: HTMLElement) {
        this.overlay.attach(container);
    }

    start(pointer: Point, additive: boolean, mode: BoxSelectionMode = 'intersect') {
        this.cancel();
        this.session = {
            startPoint: {...pointer},
            currentPoint: {...pointer},
            rect: createRect(pointer, pointer),
            mode,
            additive,
            moved: false,
        };
        this.overlay.setMode(mode);
    }

    move(pointer: Point, mode?: BoxSelectionMode) {
        const session = this.session;

        if (!session) {
            return false;
        }

        session.currentPoint = {...pointer};
        const rect = createRect(session.startPoint, session.currentPoint);
        session.rect = rect;
        session.mode = mode ?? session.mode;
        session.moved = session.moved
            || rect.width >= this.threshold
            || rect.height >= this.threshold;

        if (session.moved) {
            this.overlay.render(rect, session.mode);
        }

        return true;
    }

    updateMode(mode: BoxSelectionMode) {
        const session = this.session;

        if (!session) {
            return false;
        }

        session.mode = mode;

        if (session.moved) {
            this.overlay.render(session.rect, mode);
        } else {
            this.overlay.setMode(mode);
        }

        return true;
    }

    end(pointer: Point, mode?: BoxSelectionMode): SelectionBoxResult | null {
        const session = this.session;

        if (!session) {
            return null;
        }

        session.currentPoint = {...pointer};
        const rect = createRect(session.startPoint, session.currentPoint);
        session.rect = rect;
        session.mode = mode ?? session.mode;
        const moved = session.moved
            || rect.width >= this.threshold
            || rect.height >= this.threshold;

        this.overlay.hide();
        this.session = null;

        return {
            rect,
            mode: session.mode,
            additive: session.additive,
            moved,
        };
    }

    cancel() {
        if (!this.session) {
            return;
        }

        this.overlay.hide();
        this.session = null;
    }

    destroy() {
        this.cancel();
        this.overlay.detach();
    }
}
