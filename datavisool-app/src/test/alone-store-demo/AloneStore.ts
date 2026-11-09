/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";

class AloneStore {

    constructor() {
        makeObservable(this, {
            count: observable,
            setCount: action,
        })
    }

    count = 0;

    setCount = (count: number) => this.count = count;
}

export {AloneStore};