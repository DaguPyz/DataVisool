/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import { BaseResourceStore, IBaseResource } from "@/pages/home/common/BaseResourceStore.ts";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {globalMessage} from "@datavisool/ui";
import {runInAction} from "mobx";
import {tx} from "@/i18n/miniI18n.ts";

export interface IAiModel extends IBaseResource {
    key?: string;
    name?: string;
    provider?: string;
    providerLabel?: string;
    providerFamily?: string;
    baseUrl?: string;
    apiKey?: string;
    hasApiKey?: boolean;
    clearApiKey?: number;
    description?: string;
    temperature?: number;
    maxTokens?: number;
    enabled?: number;
    isDefault?: number;
    createTime?: string | number[];
    updateTime?: string | number[];
}

class AiModelManagementStore extends BaseResourceStore<IAiModel> {
    getListApiUrl = "/api/aiModel/pageList";
    deleteApiUrl = "/api/aiModel/batchDel";
    createApiUrl = "/api/aiModel/create";
    updateApiUrl = "/api/aiModel/update";
    protected retainSearchValue = true;
    protected correctOutOfRangePage = true;

    async saveModel(item: Partial<IAiModel>): Promise<boolean> {
        const context = this.captureRequestContext();
        const updating = Boolean(item.id);
        const result = await AuthFetchUtil.post<unknown>(updating ? this.updateApiUrl : this.createApiUrl, item);
        if (!this.isRequestContextCurrent(context)) return false;
        const created = typeof result === "string" ? /^[1-9]\d*$/.test(result)
            : typeof result === "number" && Number.isSafeInteger(result) && result > 0;
        if (updating ? result !== true : !created) {
            if (result !== null) globalMessage.messageApi?.error(tx(updating ? "保存失败" : "创建失败"));
            return false;
        }
        runInAction(() => this.setModalVisible(false));
        this.getList();
        globalMessage.messageApi?.success(tx("操作成功"));
        return true;
    }

    async deleteModels(ids: string[]): Promise<boolean> {
        if (!ids.length) return false;
        const context = this.captureRequestContext();
        const result = await AuthFetchUtil.post<boolean>(this.deleteApiUrl, ids);
        if (!this.isRequestContextCurrent(context)) return false;
        if (result !== true) {
            if (result !== null) globalMessage.messageApi?.error(tx("删除失败"));
            return false;
        }
        this.getList();
        globalMessage.messageApi?.success(tx("删除成功"));
        return true;
    }
}

const aiModelManagementStore = new AiModelManagementStore();

export default aiModelManagementStore;
