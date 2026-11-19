/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {action, makeObservable, observable} from 'mobx';

interface PendingMenu {
    position: [number, number];
}

/** Right-click state scoped to one blueprint editor overlay. */
export class BlueprintContextMenuStore {
    constructor() {
        makeObservable(this, {
            bpMenuVisible: observable,
            position: observable,
            rightPointerDown: observable,
            rightDragActive: observable,
            suppressNextContextMenu: observable,
            pendingMenu: observable.ref,
            updateBpMenuVisible: action,
            hideMenus: action,
            setPosition: action,
            beginRightDrag: action,
            startRightDrag: action,
            endRightDrag: action,
            requestBpMenu: action,
            clearPendingMenu: action,
            consumeSuppressedContextMenu: action,
            reset: action,
        });
    }

    bpMenuVisible = false;
    position: [number, number] = [0, 0];
    rightPointerDown = false;
    rightDragActive = false;
    suppressNextContextMenu = false;
    pendingMenu: PendingMenu | null = null;

    updateBpMenuVisible = (visible: boolean) => { this.bpMenuVisible = visible; };
    hideMenus = () => { this.bpMenuVisible = false; };
    setPosition = (position: [number, number]) => { this.position = position; };

    beginRightDrag = () => {
        this.rightPointerDown = true;
        this.rightDragActive = false;
        this.suppressNextContextMenu = false;
        this.clearPendingMenu();
        this.hideMenus();
    };

    startRightDrag = () => {
        this.rightDragActive = true;
        this.clearPendingMenu();
        this.suppressNextContextMenu = true;
        this.hideMenus();
    };

    endRightDrag = (dragged: boolean) => {
        this.rightPointerDown = false;
        this.rightDragActive = false;
        if (!dragged) {
            this.suppressNextContextMenu = false;
            if (this.pendingMenu) {
                this.position = this.pendingMenu.position;
                this.pendingMenu = null;
                this.bpMenuVisible = true;
            }
            return;
        }
        this.clearPendingMenu();
        this.hideMenus();
    };

    requestBpMenu = (position: [number, number]) => {
        if (this.rightPointerDown) {
            this.pendingMenu = {position};
            this.hideMenus();
            return;
        }
        this.pendingMenu = null;
        this.position = position;
        this.bpMenuVisible = true;
    };

    clearPendingMenu = () => { this.pendingMenu = null; };

    consumeSuppressedContextMenu = () => {
        if (!this.suppressNextContextMenu) return false;
        this.suppressNextContextMenu = false;
        return true;
    };

    reset = () => {
        this.hideMenus();
        this.clearPendingMenu();
        this.rightPointerDown = false;
        this.rightDragActive = false;
        this.suppressNextContextMenu = false;
        this.position = [0, 0];
    };
}
