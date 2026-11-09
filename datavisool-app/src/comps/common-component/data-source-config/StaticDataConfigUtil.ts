/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep} from "lodash";
import {IStaticData} from "@datavisool/sdk/types";

export interface ResolveInitialStaticDataOptions {
    draftValue?: any;
    defaultValue?: any;
}

export const resolveInitialStaticData = (data?: IStaticData, options: ResolveInitialStaticDataOptions = {}): IStaticData => {
    const {draftValue, defaultValue} = options;
    const initialValue = draftValue !== undefined
        ? draftValue
        : data?.value !== undefined
            ? data.value
            : defaultValue;
    return {
        value: cloneDeep(initialValue),
        filter: (data?.filter ?? null) as any,
    };
};
