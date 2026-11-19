/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {action, makeObservable, observable} from 'mobx';

/** The shell owns dock visibility; each activation gets an independent instance. */
export class DesignerDockState {
    activeModule = 'components';
    panelOpen = false;
    panelOpenOrder = 0;
    aiDrivenVisible = false;
    private restoreDockFocusAfterClose = true;
    private disposed = false;
    private paused = false;

    constructor(private readonly nextPanelOrder: () => number) {
        makeObservable(this, {
            activeModule: observable,
            panelOpen: observable,
            panelOpenOrder: observable,
            aiDrivenVisible: observable,
            setActiveModule: action,
            openPanel: action,
            closePanel: action,
            togglePanel: action,
            setAiDrivenVisible: action,
            dispose: action,
        });
    }

    setActiveModule = (module: string) => {
        if (this.disposed || this.paused) return;
        this.activeModule = module;
        this.openPanel();
    };

    openPanel = () => {
        if (this.disposed || this.paused) return;
        this.restoreDockFocusAfterClose = true;
        this.panelOpen = true;
        this.panelOpenOrder = this.nextPanelOrder();
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
        if (this.disposed || this.paused) return;
        if (this.activeModule === module && this.panelOpen) this.closePanel();
        else this.setActiveModule(module);
    };

    setAiDrivenVisible = (visible: boolean) => {
        if (this.disposed || (visible && this.paused)) return;
        this.aiDrivenVisible = visible;
        if (visible) this.closePanel(false);
    };

    toggleAiDrivenVisible = () => this.setAiDrivenVisible(!this.aiDrivenVisible);

    pause() { this.paused = true; }
    resume() { if (!this.disposed) this.paused = false; }

    dispose = () => {
        this.disposed = true;
        this.panelOpen = false;
        this.aiDrivenVisible = false;
    };
}
