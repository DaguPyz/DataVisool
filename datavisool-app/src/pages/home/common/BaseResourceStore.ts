/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, runInAction} from "mobx";
import {IPage} from "@datavisool/sdk/types";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {globalMessage} from "@datavisool/ui";
import {tx} from "@/i18n/miniI18n.ts";
import AuthTools from "@/util/AuthTools.ts";

export interface IBaseResource {
    id?: string;
    [key: string]: any;
}

interface ResourceRequestContext {
    lifecycleVersion: number;
    userId: string | null;
}

export abstract class BaseResourceStore<T extends IBaseResource> {
    constructor() {
        makeObservable(this, {
            modalVisible: observable,
            pageData: observable,
            currentItem: observable,
            setPageData: action.bound,
            setCurrentItem: action.bound,
            changeCurrentPage: action.bound,
            setModalVisible: action.bound,
            destroy: action.bound,
            getList: action.bound,
            doBatchDelete: action.bound,
            updateItem: action.bound,
            saveItem: action.bound,
            copyItem: action.bound,
            fetchAndEdit: action.bound,
            init: action.bound
        })
    }

    modalVisible = false;
    searchValue: string | null = null;
    pageData: IPage<T> = {
        records: [],
        total: 0,
        size: 10,
        current: 1
    };
    currentItem: Partial<T> = {};
    private lifecycleVersion = 0;
    private listRequestVersion = 0;

    protected captureRequestContext(): ResourceRequestContext {
        return {lifecycleVersion: this.lifecycleVersion, userId: AuthTools.getUserId()};
    }

    protected isRequestContextCurrent(context: ResourceRequestContext): boolean {
        return context.lifecycleVersion === this.lifecycleVersion && context.userId === AuthTools.getUserId();
    }

    // Abstract properties/methods to be implemented by subclasses
    abstract getListApiUrl: string;
    abstract deleteApiUrl: string;
    protected retainSearchValue = false;
    protected correctOutOfRangePage = false;
    createApiUrl?: string;
    updateApiUrl?: string;

    setModalVisible(visible: boolean) {
        this.modalVisible = visible
        if (!visible) {
            this.currentItem = {};
        }
    }

    setPageData(pageData: IPage<T>) {
        this.pageData = pageData;
    }

    setCurrentItem(item: Partial<T>) {
        this.currentItem = item;
    }

    changeCurrentPage(page: number) {
        this.pageData.current = page;
        this.getList();
    }

    /**
     * Optional hook to process records after fetching
     */
    protected processRecords(records: T[]): void {
        records.forEach((item) => {
            if (item.id && !item.key) {
                (item as any).key = item.id;
            }
        });
    }

    getList(extraParams: Record<string, any> = {}) {
        const context = this.captureRequestContext();
        const requestVersion = ++this.listRequestVersion;
        AuthFetchUtil.post<IPage<T>>(this.getListApiUrl, {
            current: this.pageData.current,
            size: this.pageData.size,
            searchValue: this.searchValue,
            ...extraParams
        }).then(res => {
            if (res !== null && requestVersion === this.listRequestVersion && this.isRequestContextCurrent(context)) {
                runInAction(() => {
                    const lastPage = Math.max(1, Math.ceil(res.total / res.size));
                    if (this.correctOutOfRangePage && res.size > 0 && res.current > lastPage) {
                        this.pageData.current = lastPage;
                        this.getList(extraParams);
                        return;
                    }
                    if (res.records) {
                        this.processRecords(res.records as T[]);
                    }
                    this.setPageData({
                        records: res.records,
                        total: res.total,
                        size: res.size,
                        current: res.current
                    });
                    if (!this.retainSearchValue) this.searchValue = null;
                })
            }
        })
    }

    doBatchDelete(ids: string[]) {
        if (ids.length === 0)
            return;
        const context = this.captureRequestContext();
        AuthFetchUtil.post(this.deleteApiUrl, ids).then((res) => {
            if (res !== null && this.isRequestContextCurrent(context)) {
                globalMessage.messageApi?.success(tx('删除成功'));
                this.getList();
            }
        })
    }

    updateItem() {
        this.saveItem();
    }

    saveItem() {
        const isUpdate = !!this.currentItem.id;
        const url = isUpdate ? this.updateApiUrl : this.createApiUrl;

        if (!url) {
            console.error("No API URL defined for save operation (create/update)");
            return;
        }

        const context = this.captureRequestContext();
        AuthFetchUtil.post(url, this.currentItem).then(res => {
            if (res !== null && this.isRequestContextCurrent(context)) {
                runInAction(() => {
                    this.setModalVisible(false);
                    this.currentItem = {};
                    this.getList();
                    globalMessage.messageApi?.success(tx("操作成功"));
                })
            }
        })
    }

    copyItem(url: string) {
        const context = this.captureRequestContext();
        AuthFetchUtil.get(url).then(res => {
            if (res !== null && this.isRequestContextCurrent(context)) {
                globalMessage.messageApi?.success(tx("复制成功"));
                this.getList();
            }
        });
    }

    fetchAndEdit(url: string) {
        const context = this.captureRequestContext();
        AuthFetchUtil.get(url).then(res => {
            if (res !== null && this.isRequestContextCurrent(context)) {
                runInAction(() => {
                    this.setCurrentItem(res || {});
                    this.setModalVisible(true);
                });
            }
        });
    }

    init() {
        this.lifecycleVersion += 1;
        this.getList();
    }

    destroy() {
        this.lifecycleVersion += 1;
        this.modalVisible = false;
        this.searchValue = null;
        this.pageData = {
            records: [],
            total: 0,
            size: 10,
            current: 1
        };
        this.currentItem = {};
    }
}
