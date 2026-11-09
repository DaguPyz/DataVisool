/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep} from "lodash";

class LoopContainerSampleDataStore {
    private sampleDataMap = new Map<string, unknown>();

    setSampleData(loopContainerId: string | null | undefined, sampleData: unknown) {
        if (!loopContainerId)
            return;
        if (sampleData === undefined) {
            this.sampleDataMap.delete(loopContainerId);
            return;
        }
        this.sampleDataMap.set(loopContainerId, cloneDeep(sampleData));
    }

    getSampleData<T = unknown>(loopContainerId: string | null | undefined): T | undefined {
        if (!loopContainerId)
            return undefined;
        const sampleData = this.sampleDataMap.get(loopContainerId);
        if (sampleData === undefined)
            return undefined;
        return cloneDeep(sampleData) as T;
    }

    removeSampleData(loopContainerId: string | null | undefined) {
        if (!loopContainerId)
            return;
        this.sampleDataMap.delete(loopContainerId);
    }

    reset() {
        this.sampleDataMap.clear();
    }
}

const loopContainerSampleDataStore = new LoopContainerSampleDataStore();

export default loopContainerSampleDataStore;
