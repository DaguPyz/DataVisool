/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";

class FooterStore {

    constructor() {
        makeObservable(this, {
            hotKeyVisible: observable,
            snapShotVisible: observable,
            configCodeVisible: observable,
            saving: observable,
            saveState: observable,
            latestSaveTime: observable,
            snapshotRecoveryVisible: observable,
            canvasRepairVisible: observable,
            setHotKeyVisible: action,
            setSnapShotVisible: action,
            setConfigCodeVisible: action,
            setSaving: action,
            setLatestSaveTime: action,
            setSaveState: action,
            resetSaveState: action,
            setSnapshotRecoveryVisible: action,
            setCanvasRepairVisible: action,
        })
    }

    snapshotRecoveryVisible: boolean = false;

    canvasRepairVisible: boolean = false;

    hotKeyVisible: boolean = false;

    snapShotVisible: boolean = false;

    configCodeVisible: boolean = false;

    saving: boolean = false;

    saveState: 'idle' | 'saving' | 'saved' | 'failed' = 'idle';

    latestSaveTime: string = '';

    setSnapshotRecoveryVisible = (visible: boolean) => this.snapshotRecoveryVisible = visible;

    setCanvasRepairVisible = (visible: boolean) => this.canvasRepairVisible = visible;

    setSaving = (saving: boolean) => this.saving = saving;

    setLatestSaveTime = (time: string) => this.latestSaveTime = time;

    setSaveState = (state: 'idle' | 'saving' | 'saved' | 'failed') => this.saveState = state;

    resetSaveState = () => {
        this.saving = false;
        this.saveState = 'idle';
        this.latestSaveTime = '';
    };

    setHotKeyVisible = (visible: boolean) => this.hotKeyVisible = visible;

    setSnapShotVisible = (visible: boolean) => this.snapShotVisible = visible;

    setConfigCodeVisible = (visible: boolean) => this.configCodeVisible = visible;

}

const footerStore = new FooterStore();
export default footerStore;
