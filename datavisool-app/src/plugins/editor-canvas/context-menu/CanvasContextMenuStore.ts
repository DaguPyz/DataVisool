/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";

interface PendingContextMenu {
    position: [number, number];
}

export interface CanvasMenuCandidate {
    id: string;
    name: string;
    type: string;
    locked: boolean;
}

type CanvasMenuPrepare = (position: [number, number]) => CanvasMenuCandidate[];

/** State and right-button gesture tracking for the main canvas context menu. */
export class CanvasContextMenuStore {
    constructor(private readonly canEdit: () => boolean = () => true) {
        makeObservable(this, {
            canvasMenuVisible: observable,
            position: observable,
            canvasMenuCandidates: observable,
            rightPointerDown: observable,
            pause: action,
            setPosition: action,
            setPointerTarget: action,
            updateCanvasMenuVisible: action,
            hideMenu: action,
            beginRightDrag: action,
            startRightDrag: action,
            endRightDrag: action,
            requestCanvasMenu: action,
            setCanvasMenuPrepare: action,
            clearPendingMenu: action,
            consumeSuppressedContextMenu: action,
            reset: action,
        });
    }

    canvasMenuVisible = false;
    canvasMenuCandidates: CanvasMenuCandidate[] = [];
    rightPointerDown = false;
    rightDragActive = false;
    suppressNextContextMenu = false;
    pointerTarget: EventTarget | null = null;
    position: [number, number] = [0, 0];
    pendingMenu: PendingContextMenu | null = null;

    private canvasMenuPrepare: CanvasMenuPrepare | null = null;
    private lifecycleVersion = 0;

    getDismissVersion = () => this.lifecycleVersion;
    isDismissVersionCurrent = (version: number) => this.canEdit() && version === this.lifecycleVersion;

    updateCanvasMenuVisible = (visible: boolean) => {
        if (this.canEdit() || !visible) this.canvasMenuVisible = visible;
    };
    hideMenu = () => { this.canvasMenuVisible = false; };
    setPosition = (position: [number, number]) => { if (this.canEdit()) this.position = position; };
    setPointerTarget = (target: EventTarget | null) => { if (this.canEdit()) this.pointerTarget = target; };

    /** Clear transient input state while preserving the installed menu builder for resume. */
    pause = () => {
        this.lifecycleVersion += 1;
        this.canvasMenuVisible = false;
        this.canvasMenuCandidates = [];
        this.pendingMenu = null;
        this.rightPointerDown = false;
        this.rightDragActive = false;
        this.suppressNextContextMenu = false;
        this.pointerTarget = null;
    };

    beginRightDrag = () => {
        if (!this.canEdit()) return;
        this.rightPointerDown = true;
        this.rightDragActive = false;
        this.suppressNextContextMenu = false;
        this.clearPendingMenu();
        this.hideMenu();
    };

    startRightDrag = () => {
        if (!this.canEdit()) return;
        this.rightDragActive = true;
        this.clearPendingMenu();
        this.suppressNextContextMenu = true;
        this.hideMenu();
    };

    endRightDrag = (dragged: boolean) => {
        if (!this.canEdit()) return;
        this.rightPointerDown = false;
        this.rightDragActive = false;
        if (!dragged) {
            this.suppressNextContextMenu = false;
            this.flushPendingMenu();
            return;
        }
        this.clearPendingMenu();
        this.hideMenu();
    };

    requestCanvasMenu = (position: [number, number]) => {
        if (!this.canEdit()) return;
        if (this.rightPointerDown) {
            this.pendingMenu = {position};
            this.hideMenu();
            return;
        }
        this.pendingMenu = null;
        this.position = position;
        this.canvasMenuCandidates = this.canvasMenuPrepare?.(position) ?? [];
        this.canvasMenuVisible = true;
    };

    setCanvasMenuPrepare = (prepare: CanvasMenuPrepare | null) => { this.canvasMenuPrepare = prepare; };
    clearPendingMenu = () => { this.pendingMenu = null; };

    consumeSuppressedContextMenu = () => {
        if (!this.suppressNextContextMenu) return false;
        this.suppressNextContextMenu = false;
        return true;
    };

    private flushPendingMenu = () => {
        if (!this.pendingMenu) return;
        const {position} = this.pendingMenu;
        this.pendingMenu = null;
        this.position = position;
        this.canvasMenuCandidates = this.canvasMenuPrepare?.(position) ?? [];
        this.canvasMenuVisible = true;
    };

    reset = () => {
        this.lifecycleVersion += 1;
        this.hideMenu();
        this.clearPendingMenu();
        this.rightPointerDown = false;
        this.rightDragActive = false;
        this.suppressNextContextMenu = false;
        this.position = [0, 0];
        this.pointerTarget = null;
        this.canvasMenuCandidates = [];
    };
}

