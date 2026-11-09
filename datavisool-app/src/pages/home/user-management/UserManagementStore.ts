/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, override, runInAction} from "mobx";
import AuthFetchUtil from "../../../util/AuthFetchUtil.ts";
import {globalMessage} from "@datavisool/ui";
import {HybridCryptoUtil} from "../../../util/HybridCryptoUtil.ts";
import {BaseResourceStore, IBaseResource} from "../common/BaseResourceStore.ts";
import {tx} from "@/i18n/miniI18n.ts";

export interface Option {
    value: string;
    label: string;
}

export interface IUser extends IBaseResource {
    no?: number;
    key?: string;
    id?: string;
    name?: string;
    password?: string;
    username?: string;
    phone?: string;
    email?: string;
    avatar?: string;
    avatarFile?: File;
    roles?: Array<string | { id: string; name?: string; description?: string }>;
}

class UserManagementStore extends BaseResourceStore<IUser> {
    constructor() {
        super();
        makeObservable(this, {
            roleOptions: observable,
            setRoleOptions: action,
            doEditUserInfo: action,
            saving: observable,
            destroy: override,
        })
    }

    getListApiUrl = '/api/user/pageList';
    deleteApiUrl = '/api/user/batchDel';
    protected retainSearchValue = true;
    protected correctOutOfRangePage = true;
    saving = false;

    roleOptions: Option[] = [];

    setRoleOptions = (roleOptions: Option[]) => this.roleOptions = roleOptions;

    protected processRecords(records: IUser[]) {
        records.forEach((item, index) => {
            item.no = index + 1;
            item.key = item.id;
        });
    }

    async saveUser(user: IUser): Promise<boolean> {
        if (this.saving) return false;
        const context = this.captureRequestContext();
        const updating = Boolean(user.id);
        runInAction(() => { this.saving = true; });
        try {
            const encoded = await HybridCryptoUtil.encryptRequest(JSON.stringify(user));
            const result = await AuthFetchUtil.post<unknown>(updating ? '/api/user/update' : '/api/user/createEncrypted', encoded);
            if (!this.isRequestContextCurrent(context)) return false;
            const created = typeof result === 'string' ? /^[1-9]\d*$/.test(result)
                : typeof result === 'number' && Number.isSafeInteger(result) && result > 0;
            if (updating ? result !== true : !created) {
                if (result !== null) globalMessage.messageApi?.error(tx(updating ? '保存失败' : '创建失败'));
                return false;
            }
            this.setModalVisible(false);
            this.getList();
            globalMessage.messageApi?.success(tx(updating ? '更新成功' : '创建成功'));
            return true;
        } catch {
            if (this.isRequestContextCurrent(context)) globalMessage.messageApi?.error(tx(updating ? '保存失败' : '创建失败'));
            return false;
        } finally {
            runInAction(() => { this.saving = false; });
        }
    }

    async deleteUsers(ids: string[]): Promise<boolean> {
        if (!ids.length) return false;
        const context = this.captureRequestContext();
        try {
            const result = await AuthFetchUtil.post<boolean>(this.deleteApiUrl, ids);
            if (!this.isRequestContextCurrent(context)) return false;
            if (result !== true) {
                if (result !== null) globalMessage.messageApi?.error(tx('删除失败'));
                return false;
            }
            this.getList();
            globalMessage.messageApi?.success(tx('删除成功'));
            return true;
        } catch {
            if (this.isRequestContextCurrent(context)) globalMessage.messageApi?.error(tx('删除失败'));
            return false;
        }
    }

    doEditUserInfo = (id: string) => {
        AuthFetchUtil.get<IUser>(`/api/user/getUser/${id}`).then((res) => {
            if (res !== null) {
                runInAction(() => {
                    // 如果 roles 是对象数组，提取 id
                    if (res.roles && res.roles.length > 0 && typeof res.roles[0] === 'object') {
                        res.roles = res.roles.map((role: any) => role.id);
                    }
                    this.setCurrentItem(res);
                    this.setModalVisible(true);
                })
            }
        })
    }

    destroy() {
        super.destroy();
        runInAction(() => {
            this.roleOptions = [];
        })
    }

}

const userManagementStore = new UserManagementStore();
export default userManagementStore;
