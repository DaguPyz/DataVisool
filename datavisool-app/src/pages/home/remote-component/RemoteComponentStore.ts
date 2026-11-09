/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseResourceStore, IBaseResource} from "@/pages/home/common/BaseResourceStore.ts";

export interface IRemoteComponent extends IBaseResource {
    key?: string;
    componentName?: string;
    url?: string;
}

export class RemoteComponentStore extends BaseResourceStore<IRemoteComponent> {
    getListApiUrl = '/api/remote/component/pageList';
    deleteApiUrl = '/api/remote/component/batchDel';
    updateApiUrl = '/api/remote/component/update';
    protected retainSearchValue = true;
    protected correctOutOfRangePage = true;
}

const remoteComponentStore = new RemoteComponentStore();
export default remoteComponentStore;
