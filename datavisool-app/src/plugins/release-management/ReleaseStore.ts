/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {WorkbenchPageServices} from "@/shared/workbench/pageServices.ts";
import {action, makeObservable, override} from "mobx";
import {globalMessage} from "@datavisool/ui";
import {HybridCryptoUtil, type EncryptResult} from "@/util/HybridCryptoUtil.ts";
import {BaseResourceStore, IBaseResource} from "@/shared/resources/BaseResourceStore.ts";

export interface IReleaseProjectItem extends IBaseResource {
    id?: string;
    key?: string;
    name?: string;
    state?: boolean;
    updateTime?: string;
    description?: string;
    des?: string;
    expirationDate?: number;
    encrypt?: boolean;
    password?: string | EncryptResult;
}

export class ReleaseStore extends BaseResourceStore<IReleaseProjectItem> {
    constructor(services: WorkbenchPageServices) {
        super(services);
        makeObservable(this, {
            updateReleaseState: action,
            updateItem: override,
        })
    }

    getListApiUrl = '/api/release/pageList';
    deleteApiUrl = '/api/release/batchDel';

    protected processRecords(records: IReleaseProjectItem[]) {
        records.forEach((item) => item.key = item.id);
    }

    async updateItem() {
        const context = this.captureRequestContext();
        const item = {...this.currentItem};
        if (typeof item.password === 'string' && item.password) {
            item.password = await HybridCryptoUtil.encryptRequest(item.password);
        }
        if (!this.isRequestContextCurrent(context)) return;
        const res = await this.services.post('/api/release/update', item);
        if (res !== null && this.isRequestContextCurrent(context)) {
            this.setModalVisible(false);
            this.getList();
            globalMessage.messageApi?.success(this.translate("操作成功"));
        }
    }

    updateReleaseState = (id: string, state: boolean) => {
        const context = this.captureRequestContext();
        this.services.post('/api/release/update', {id, state: state ? 1 : 0}).then(res => {
            if (res !== null && this.isRequestContextCurrent(context)) {
                globalMessage.messageApi?.success(this.translate('操作成功'));
            }
        })
    }
}

