/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";

class DesignerHeaderStore {

    constructor() {
        makeObservable(this, {
            currentKey: observable,
            setCurrentKey: action,
        })
    }


    currentKey = '';

    setCurrentKey = (key: string) => this.currentKey = key
}

const designerHeaderStore = new DesignerHeaderStore();
export default designerHeaderStore;