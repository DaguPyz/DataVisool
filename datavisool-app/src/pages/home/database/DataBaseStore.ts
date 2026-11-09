/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable} from "mobx";
import {globalMessage} from "@datavisool/ui";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {EncryptResult, HybridCryptoUtil} from "@/util/HybridCryptoUtil.ts";
import {BaseResourceStore} from "@/pages/home/common/BaseResourceStore.ts";
import {tx} from "@/i18n/miniI18n.ts";

export interface IDataSource {
    id?: string;
    key?: string;
    name?: string;
    type?: string;
    username?: string;
    password?: string;
    ip?: string;
    port?: string;
    databaseName?: string;
    url?: string;
    des?: string;
    allowSqlScript?: boolean;
}

export class DataBaseStore extends BaseResourceStore<IDataSource> {
    constructor() {
        super();
        makeObservable(this, {
            testConnect: action.bound,
            openDataSourceEditor: action.bound,
            doCreateOrUpdateDataSource: action.bound
        })
    }

    getListApiUrl = '/api/commonDatabase/pageList';
    deleteApiUrl = '/api/commonDatabase/batchDel';

    protected processRecords(records: IDataSource[]): void {
        super.processRecords(records);
        records.forEach(item => {
            item.type = item!.type;
        })
    }

    testConnect = (id: string) => {
        globalMessage.messageApi?.open({
            key: 'testDBConnect',
            content: tx('正在测试数据库连接，请稍后...'),
            type: 'loading',
            duration: 0
        });
        AuthFetchUtil.get(`/api/commonDatabase/test/${id}`).then(res => {
            globalMessage.messageApi?.destroy('testDBConnect');
            if (res !== null)
                globalMessage.messageApi?.success(tx('连接正常'));
        })
    }

    openDataSourceEditor = (id: string) => {
        const clientKey = HybridCryptoUtil.getClientPublicKey();
        AuthFetchUtil.post<EncryptResult>(`/api/commonDatabase/get`, {id, key: clientKey}).then(res => {
            if (res !== null) {
                const data = HybridCryptoUtil.decryptResponse(res);
                this.setCurrentItem(JSON.parse(data as string) as IDataSource);
                this.setModalVisible(true);
            }
        })
    }

    private updateDataSource = (data: IDataSource) => {
        HybridCryptoUtil.encryptRequest(JSON.stringify(data)).then(encoded => {
            AuthFetchUtil.post(`/api/commonDatabase/update`, encoded).then(res => {
                if (res !== null) {
                    globalMessage.messageApi?.success(tx('操作成功'));
                    this.getList();
                    this.setModalVisible(false);
                }
            })
        })
    }

    private createDataSource = (data: IDataSource) => {
        HybridCryptoUtil.encryptRequest(JSON.stringify(data)).then(encoded => {
            AuthFetchUtil.post(`/api/commonDatabase/add`, encoded).then(res => {
                if (res !== null) {
                    globalMessage.messageApi?.success(tx('操作成功'));
                    this.getList();
                    this.setModalVisible(false);
                }
            })
        });
    }

    doCreateOrUpdateDataSource = (data: IDataSource) => {
        if (data.id) {
            this.updateDataSource(data);
        } else {
            this.createDataSource(data);
        }
    }
}

const dataSourceStore = new DataBaseStore();
export default dataSourceStore;
