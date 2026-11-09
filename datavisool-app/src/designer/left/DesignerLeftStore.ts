/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, computed, makeObservable, observable} from "mobx";
import {ReactNode} from "react";

let panelOpenOrderCounter = 0;

export const nextPanelOpenOrder = () => ++panelOpenOrderCounter;

export interface ILeftMenu {
    icon: ReactNode,
    name: string,
    key: string,
}

class DesignerLeftStore {
    constructor() {
        makeObservable(this, {
            activeModule: observable,
            panelOpen: observable,
            panelOpenOrder: observable,
            aiDrivenVisible: observable,
            menu: computed,
            setActiveModule: action,
            openPanel: action,
            closePanel: action,
            togglePanel: action,
            consumeDockFocusRestore: action,
            setMenu: action,
            setAiDrivenVisible: action,
            toggleAiDrivenVisible: action,
        });
    }

    activeModule: string = 'components';
    panelOpen: boolean = false;
    panelOpenOrder: number = 0;
    aiDrivenVisible: boolean = false;
    private restoreDockFocusAfterClose = true;

    /** Backward-compatible alias used by existing layer and interaction code. */
    get menu() {
        return this.panelOpen ? this.activeModule : '';
    }

    setActiveModule = (module: string) => {
        this.restoreDockFocusAfterClose = true;
        this.activeModule = module;
        this.panelOpen = true;
        this.panelOpenOrder = nextPanelOpenOrder();
    };

    openPanel = () => {
        this.restoreDockFocusAfterClose = true;
        this.panelOpen = true;
        this.panelOpenOrder = nextPanelOpenOrder();
    };

    closePanel = (restoreFocus = true) => {
        this.restoreDockFocusAfterClose = restoreFocus;
        this.panelOpen = false;
    };

    consumeDockFocusRestore = () => {
        const restoreFocus = this.restoreDockFocusAfterClose;
        this.restoreDockFocusAfterClose = true;
        return restoreFocus;
    };

    togglePanel = (module: string) => {
        if (this.activeModule === module && this.panelOpen) {
            this.closePanel();
            return;
        }
        this.restoreDockFocusAfterClose = true;
        this.activeModule = module;
        this.panelOpen = true;
        this.panelOpenOrder = nextPanelOpenOrder();
    };

    /** Legacy callers used an empty menu key to close the panel. */
    setMenu = (menu: string) => {
        if (!menu) {
            this.closePanel();
            return;
        }
        this.setActiveModule(menu);
    };

    setAiDrivenVisible = (visible: boolean) => {
        this.aiDrivenVisible = visible;
        if (visible)
            this.closePanel(false);
    };

    toggleAiDrivenVisible = () => this.setAiDrivenVisible(!this.aiDrivenVisible);

    designerLeftRef: HTMLElement | null = null;

    setDesignerLeftRef = (ref: HTMLElement | null) => this.designerLeftRef = ref;

}

const designerLeftStore = new DesignerLeftStore();
export default designerLeftStore;
