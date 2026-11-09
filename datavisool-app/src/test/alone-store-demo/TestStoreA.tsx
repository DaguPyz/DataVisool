/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import {AloneStore} from "./AloneStore.ts";

const storeA = new AloneStore();
export {storeA};

const TestStoreA = () => {
    console.log('TestStoreA')
    return (
        <div>
            <h1>TestStoreA</h1>
            <p>count{storeA.count}</p>
        </div>
    );
}

export default observer(TestStoreA);