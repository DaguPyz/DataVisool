/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from 'mobx';

export type BPWorkspaceNarrowPanel = 'left' | 'right';

const MIN_RIGHT_WIDTH = 260;
const MAX_RIGHT_WIDTH = 560;
const DEFAULT_RIGHT_WIDTH = 304;

export class BPWorkspaceUIStore {
    constructor() {
        makeObservable(this, {
            leftOpen: observable,
            rightOpen: observable,
            rightWidth: observable,
            activeNarrowPanel: observable,
            nodeDragActive: observable,
            toggleLeft: action,
            openLeft: action,
            closeLeft: action,
            openRight: action,
            closeRight: action,
            setRightWidth: action,
            setActiveNarrowPanel: action,
            resetPanelState: action,
            setNodeDragActive: action,
        });
    }

    leftOpen = true;
    rightOpen = false;
    rightWidth = DEFAULT_RIGHT_WIDTH;
    activeNarrowPanel: BPWorkspaceNarrowPanel = 'left';
    nodeDragActive = false;

    toggleLeft = (currentlyVisible = this.leftOpen) => {
        if (this.nodeDragActive)
            return;
        currentlyVisible ? this.closeLeft() : this.openLeft();
    };

    openLeft = () => {
        this.leftOpen = true;
        this.activeNarrowPanel = 'left';
    };

    closeLeft = () => {
        if (this.nodeDragActive)
            return;
        this.leftOpen = false;
        if (this.rightOpen)
            this.activeNarrowPanel = 'right';
    };

    openRight = () => {
        this.rightOpen = true;
        this.activeNarrowPanel = 'right';
    };

    closeRight = () => {
        this.rightOpen = false;
        if (this.leftOpen)
            this.activeNarrowPanel = 'left';
    };

    setRightWidth = (width: number) => {
        if (!Number.isFinite(width))
            return;
        this.rightWidth = Math.min(MAX_RIGHT_WIDTH, Math.max(MIN_RIGHT_WIDTH, width));
    };

    setActiveNarrowPanel = (panel: BPWorkspaceNarrowPanel) => {
        this.activeNarrowPanel = panel;
    };

    isLeftLibraryVisible = (isNarrow: boolean) => this.leftOpen &&
        (!isNarrow || !this.rightOpen || this.activeNarrowPanel === 'left');

    setNodeDragActive = (active: boolean) => {
        this.nodeDragActive = active;
    };

    /** Keep the documented default panel state when the blueprint is reopened. */
    resetPanelState = () => {
        this.leftOpen = true;
        this.rightOpen = false;
        this.activeNarrowPanel = 'left';
        this.nodeDragActive = false;
    };
}

const bpWorkspaceUIStore = new BPWorkspaceUIStore();
export default bpWorkspaceUIStore;
