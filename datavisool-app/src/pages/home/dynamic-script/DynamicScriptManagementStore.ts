/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, override, runInAction} from "mobx";
import {globalMessage} from "@datavisool/ui";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {BaseResourceStore} from "@/pages/home/common/BaseResourceStore.ts";
import {tx} from "@/i18n/miniI18n.ts";

export interface IDynamicScript {
    id?: string;
    key?: string;
    name?: string;
    type?: string;
    url?: string;
    projectId?: string;
    scriptFile?: File;
}

export class DynamicScriptManagementStore extends BaseResourceStore<IDynamicScript> {
    constructor() {
        super();
        makeObservable(this, {
            fileList: observable,
            saving: observable,
            setFileList: action.bound,
            saveOrUpdateDynamicScript: action.bound,
            setModalVisible: override,
            init: override,
            getList: override
        });
        // Set default currentItem state
        this.currentItem = { type: 'REMOTE' };
    }

    getListApiUrl = '/api/dynamicScript/pageList';
    deleteApiUrl = '/api/dynamicScript/batchDel';
    updateApiUrl = '/api/dynamicScript/update';
    protected retainSearchValue = true;
    protected correctOutOfRangePage = true;

    projectId: string | undefined = undefined;
    saving = false;

    // 文件列表
    fileList: { name: string, uid: string }[] = [];

    setFileList(fileList: { name: string, uid: string }[]) {
        this.fileList = fileList;
    }

    setModalVisible(visible: boolean) {
        this.modalVisible = visible;
        if (!visible) {
            this.currentItem = { type: 'REMOTE', projectId: this.projectId };
            this.fileList = [];
        }
    }

    init(projectId?: string) {
        if (projectId) {
            this.projectId = projectId;
        }
        if (!this.currentItem.projectId) {
            this.currentItem = { ...this.currentItem, projectId: this.projectId };
        }
        this.getList();
    }

    getList() {
        super.getList({ projectId: this.projectId });
    }

    saveOrUpdateDynamicScript = async () => {
        if (this.saving) return false;
        const {name, type, url, id, scriptFile} = this.currentItem;
        const projectId = this.currentItem.projectId ?? this.projectId;
        if (type === 'LOCAL' && !scriptFile) {
            globalMessage.messageApi?.error(tx('请选择脚本文件'));
            return;
        }
        if (type === 'REMOTE' && !url) {
            globalMessage.messageApi?.error(tx('请输入远程脚本地址'));
            return;
        }

        if (type === 'REMOTE') {
            try {
                const address = url!.trim();
                if (!/^(https?:)?\/\//i.test(address) || /\s/u.test(address)) throw new Error('invalid url');
                const parsed = new URL(address.startsWith('//') ? `https:${address}` : address);
                if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('invalid url');
            } catch {
                globalMessage.messageApi?.error(tx('请输入有效的 HTTP 或 HTTPS 脚本地址'));
                return false;
            }
        }

        this.saving = true;
        try {
            const isTauri = typeof window !== 'undefined' && (('__TAURI_INTERNALS__' in window) || ('__TAURI__' in window));
            let res: unknown;
            if (isTauri) {
                const payload: Record<string, unknown> = {id, name: name ?? '', type, url: url?.trim() ?? '', projectId};
                if (type === 'LOCAL' && scriptFile) {
                    const bytes = new Uint8Array(await scriptFile.arrayBuffer());
                    const chunkSize = 0x8000;
                    let binary = '';
                    for (let i = 0; i < bytes.length; i += chunkSize) {
                        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
                    }
                    payload.scriptFileName = scriptFile.name;
                    payload.scriptDataUrl = `data:text/javascript;base64,${btoa(binary)}`;
                    payload.url = '';
                }
                res = await AuthFetchUtil.post('/api/dynamicScript/saveOrUpdate', payload);
            } else {
                const formData = new FormData();
                if (scriptFile) formData.append('scriptFile', scriptFile);
                formData.append('name', name ?? '');
                formData.append('type', type!);
                if (url) formData.append('url', url.trim());
                if (projectId) formData.append('projectId', projectId);
                if (id) formData.append('id', id);
                res = await AuthFetchUtil.post('/api/dynamicScript/saveOrUpdate', formData, {
                    headers: {'Content-Type': 'multipart/form-data'}
                });
            }

            if (res === true) {
                globalMessage.messageApi?.success(tx('操作成功'));
                this.setModalVisible(false);
                this.getList();
                return true;
            }
            if (res === false) globalMessage.messageApi?.error(tx('操作失败'));
            return false;
        } finally {
            runInAction(() => { this.saving = false; });
        }
    }
}

const scriptManagementStore = new DynamicScriptManagementStore();
export default scriptManagementStore;
