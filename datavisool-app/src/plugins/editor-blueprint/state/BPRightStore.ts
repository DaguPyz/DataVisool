/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";

export class BPRightStore {
    constructor() {
        makeObservable(this, {
            activeNode: observable,
            setActiveNode: action,
        })
    }

    activeNode: string | null = null;

    setActiveNode = (node: string | null) => {
        this.activeNode = node;
    }
}

export default BPRightStore;
