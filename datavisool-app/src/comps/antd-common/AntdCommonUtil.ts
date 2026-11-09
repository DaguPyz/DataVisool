/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ISelectOption} from "@datavisool/ui";
import type {AbstractController} from "@datavisool/sdk/core";
import DataUtil from "@/util/DataUtil.ts";

export default class AntdCommonUtil {
    public static getDataFieldOptions(controller: AbstractController) {
        const config = controller.getConfig();
        const dataConfig = config?.data;
        const data = dataConfig?.value !== undefined
            ? dataConfig.value
            : DataUtil.getStaticData(dataConfig?.staticData ?? {});
        const options: ISelectOption[] = [];
        if (Array.isArray(data) && data.length >= 1) {
            const dataObj = data[0];
            Object.keys(dataObj).forEach(key => options.push({label: key, value: key}))
        }
        return options;
    }
}
