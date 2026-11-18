/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {CoordinateSnapshot} from './Coordinate';
import type {PointerLike} from './types';
import type {SpatialIndex} from './SpatialIndex';

export type ActiveInteractionMode = 'drag' | 'select' | 'resize' | 'rotate';

export interface PointerSessionOptions {
    getEventContainer: () => HTMLElement;
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onPointerCancel: (event: PointerEvent) => void;
}

export interface PointerSessionStartOptions {
    capture?: boolean;
    selectionSpatialIndex?: SpatialIndex;
}

export class PointerSession {
    private readonly options: PointerSessionOptions;

    private coordinateSnapshot: CoordinateSnapshot | null = null;

    private activePointerId: number | null = null;

    private activeMode: ActiveInteractionMode | null = null;

    private activeWindowListeners = false;

    private activePointerCaptured = false;

    private selectionSpatialIndex: SpatialIndex | null = null;

    constructor(options: PointerSessionOptions) {
        this.options = options;
    }

    start(
        mode: ActiveInteractionMode,
        snapshot: CoordinateSnapshot,
        pointerId: number,
        options: PointerSessionStartOptions = {},
    ) {
        this.coordinateSnapshot = snapshot;
        this.activePointerId = pointerId;
        this.activeMode = mode;
        this.selectionSpatialIndex = options.selectionSpatialIndex ?? null;
        this.addWindowListeners();

        if (options.capture) {
            this.capturePointer({pointerId});
        }
    }

    destroy() {
        this.removeWindowListeners();
        this.coordinateSnapshot = null;
        this.activePointerId = null;
        this.activeMode = null;
        this.selectionSpatialIndex = null;
    }

    cleanup(event: PointerLike) {
        this.coordinateSnapshot = null;
        this.releasePointer(event);
        this.removeWindowListeners();
        this.activePointerId = null;
        this.activeMode = null;
        this.activePointerCaptured = false;
        this.selectionSpatialIndex = null;
    }

    getSnapshot() {
        return this.coordinateSnapshot;
    }

    getMode() {
        return this.activeMode;
    }

    getSelectionSpatialIndex() {
        return this.selectionSpatialIndex;
    }

    isActivePointer(event: PointerLike) {
        return this.activePointerId === null
            || typeof event.pointerId !== 'number'
            || event.pointerId === this.activePointerId;
    }

    isTransformActive() {
        return this.activeMode === 'drag'
            || this.activeMode === 'resize'
            || this.activeMode === 'rotate';
    }

    captureAfterMove(event: PointerLike, moved: boolean) {
        if (this.activePointerCaptured || !moved) {
            return;
        }

        this.activePointerCaptured = this.capturePointer(event);
    }

    private addWindowListeners() {
        if (this.activeWindowListeners) {
            return;
        }

        window.addEventListener('pointermove', this.options.onPointerMove);
        window.addEventListener('pointerup', this.options.onPointerUp);
        window.addEventListener('pointercancel', this.options.onPointerCancel);
        this.activeWindowListeners = true;
    }

    private removeWindowListeners() {
        if (!this.activeWindowListeners) {
            return;
        }

        window.removeEventListener('pointermove', this.options.onPointerMove);
        window.removeEventListener('pointerup', this.options.onPointerUp);
        window.removeEventListener('pointercancel', this.options.onPointerCancel);
        this.activeWindowListeners = false;
    }

    private capturePointer(event: Pick<PointerLike, 'pointerId'>) {
        const pointerId = event.pointerId;
        const eventContainer = this.options.getEventContainer();

        if (typeof pointerId !== 'number' || !eventContainer.setPointerCapture) {
            return false;
        }

        try {
            eventContainer.setPointerCapture(pointerId);
            return true;
        } catch {
            // Pointer capture can fail if the pointer is no longer active; window listeners still keep the drag lifecycle safe.
            return false;
        }
    }

    private releasePointer(event: Pick<PointerLike, 'pointerId'>) {
        const pointerId = event.pointerId;
        const eventContainer = this.options.getEventContainer();

        if (typeof pointerId !== 'number' || !eventContainer.releasePointerCapture) {
            return;
        }

        try {
            eventContainer.releasePointerCapture(pointerId);
        } catch {
            // Releasing a non-captured pointer should not turn a normal pointerup into a drag cancel.
        }
    }
}
