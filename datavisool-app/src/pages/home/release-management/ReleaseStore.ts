/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, override} from "mobx";
import {globalMessage} from "@datavisool/ui";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {EncryptResult, HybridCryptoUtil} from "@/util/HybridCryptoUtil.ts";
import {BaseResourceStore, IBaseResource} from "@/pages/home/common/BaseResourceStore.ts";
import {tx} from "@/i18n/miniI18n.ts";

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
    constructor() {
        super();
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

    updateItem() {
        if (!this.currentItem) return;
        const password = this.currentItem.password as string;
        if (password) {
            HybridCryptoUtil.encryptRequest(password).then(encoded => {
                this.currentItem.password = encoded as EncryptResult;
                AuthFetchUtil.post('/api/release/update', this.currentItem).then(res => {
                    if (res !== null) {
                        this.setCurrentItem({});
                        this.setModalVisible(false);
                        this.getList();
                        globalMessage.messageApi?.success(tx("操作成功"));
                    }
                })
            });
        } else {
            // Fallback if no password (though UI implies password update)
            AuthFetchUtil.post('/api/release/update', this.currentItem).then(res => {
                if (res !== null) {
                    this.setCurrentItem({});
                    this.setModalVisible(false);
                    this.getList();
                    globalMessage.messageApi?.success(tx("操作成功"));
                }
            })
        }
    }

    updateReleaseState = (id: string, state: boolean) => {
        AuthFetchUtil.post('/api/release/update', {id, state: state ? 1 : 0}).then(res => {
            res !== null && globalMessage.messageApi?.success(tx('操作成功'));
        })
    }
}

const releaseStore = new ReleaseStore();
export default releaseStore;
