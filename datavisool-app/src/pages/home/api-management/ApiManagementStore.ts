/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseResourceStore} from "@/pages/home/common/BaseResourceStore.ts";


export interface ICommonApi {
    id?: string;
    key?: string;
    name?: string;
    method?: string;
    params?: string;
    headers?: string;
    url?: string;
}


class ApiManagementStore extends BaseResourceStore<ICommonApi> {

    getListApiUrl = '/api/commonApi/pageList';
    deleteApiUrl = '/api/commonApi/batchDel';
    createApiUrl = '/api/commonApi/create';
    updateApiUrl = '/api/commonApi/update';

}

const apiManagementStore = new ApiManagementStore();
export default apiManagementStore;
