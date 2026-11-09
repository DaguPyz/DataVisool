/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";

class RuntimeStore {

    constructor() {
        makeObservable(this, {
            auxiliaryBorder: observable,
            setAuxiliaryBorder: action,
        })
    }

    auxiliaryBorder: boolean = false;

    setAuxiliaryBorder = (auxiliaryBorder: boolean) => {
        this.auxiliaryBorder = auxiliaryBorder;
    }

}

const runtimeConfigStore = new RuntimeStore();
export default runtimeConfigStore;