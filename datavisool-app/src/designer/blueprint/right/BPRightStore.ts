/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, runInAction} from "mobx";

class BPRightStore {
    constructor() {
        makeObservable(this, {
            activeNode: observable,
            setActiveNode: action,
        })
    }

    activeNode: string | null = null;

    setActiveNode = (node: string | null) => {
        this.activeNode = null;
        const timer = setTimeout(() => {
            runInAction(()=>this.activeNode = node);
            clearTimeout(timer)
        }, 0);
    }
}

const bpRightStore = new BPRightStore();
export default bpRightStore;