/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {IDataSource} from "@/api/DatabaseTypes.ts";
import type {WorkbenchPageServices} from "@/shared/workbench/pageServices.ts";

import {action, makeObservable} from "mobx";
import {globalMessage} from "@datavisool/ui";
import {EncryptResult, HybridCryptoUtil} from "@/util/HybridCryptoUtil.ts";
import {BaseResourceStore} from "@/shared/resources/BaseResourceStore.ts";

export class DataBaseStore extends BaseResourceStore<IDataSource> {
    constructor(services: WorkbenchPageServices) {
        super(services);
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
            content: this.translate('正在测试数据库连接，请稍后...'),
            type: 'loading',
            duration: 0
        });
        this.services.get(`/api/commonDatabase/test/${id}`).then(res => {
            globalMessage.messageApi?.destroy('testDBConnect');
            if (res !== null)
                globalMessage.messageApi?.success(this.translate('连接正常'));
        })
    }

    openDataSourceEditor = (id: string) => {
        const context = this.captureRequestContext();
        const clientKey = HybridCryptoUtil.getClientPublicKey();
        this.services.post<EncryptResult>('/api/commonDatabase/get', {id, key: clientKey}, {signal: this.readSignal}).then(res => {
            if (res !== null && this.isRequestContextCurrent(context)) {
                const data = HybridCryptoUtil.decryptResponse(res);
                this.setCurrentItem(JSON.parse(data as string) as IDataSource);
                this.setModalVisible(true);
            }
        })
    }

    doCreateOrUpdateDataSource = async (data: IDataSource) => {
        const context = this.captureRequestContext();
        const encoded = await HybridCryptoUtil.encryptRequest(JSON.stringify(data));
        if (!this.isRequestContextCurrent(context)) return;
        const path = data.id ? '/api/commonDatabase/update' : '/api/commonDatabase/add';
        const res = await this.services.post(path, encoded);
        if (res !== null && this.isRequestContextCurrent(context)) {
            globalMessage.messageApi?.success(this.translate('操作成功'));
            this.getList();
            this.setModalVisible(false);
        }
    }
}

