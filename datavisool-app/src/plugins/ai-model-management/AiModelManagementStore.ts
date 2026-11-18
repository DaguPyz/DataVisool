/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {IAiModel} from "@/api/AiModelApi.ts";
import { BaseResourceStore } from "@/shared/resources/BaseResourceStore.ts";
import {globalMessage} from "@datavisool/ui";
import {runInAction} from "mobx";

export class AiModelManagementStore extends BaseResourceStore<IAiModel> {
    getListApiUrl = "/api/aiModel/pageList";
    deleteApiUrl = "/api/aiModel/batchDel";
    createApiUrl = "/api/aiModel/create";
    updateApiUrl = "/api/aiModel/update";
    protected retainSearchValue = true;
    protected correctOutOfRangePage = true;

    async saveModel(item: Partial<IAiModel>): Promise<boolean> {
        const context = this.captureRequestContext();
        const updating = Boolean(item.id);
        const result = await this.services.post<unknown>(updating ? this.updateApiUrl : this.createApiUrl, item);
        if (!this.isRequestContextCurrent(context)) return false;
        const created = typeof result === "string" ? /^[1-9]\d*$/.test(result)
            : typeof result === "number" && Number.isSafeInteger(result) && result > 0;
        if (updating ? result !== true : !created) {
            if (result !== null) globalMessage.messageApi?.error(this.translate(updating ? "保存失败" : "创建失败"));
            return false;
        }
        runInAction(() => this.setModalVisible(false));
        this.getList();
        globalMessage.messageApi?.success(this.translate("操作成功"));
        return true;
    }

    async deleteModels(ids: string[]): Promise<boolean> {
        if (!ids.length) return false;
        const context = this.captureRequestContext();
        const result = await this.services.post<boolean>(this.deleteApiUrl, ids);
        if (!this.isRequestContextCurrent(context)) return false;
        if (result !== true) {
            if (result !== null) globalMessage.messageApi?.error(this.translate("删除失败"));
            return false;
        }
        this.getList();
        globalMessage.messageApi?.success(this.translate("删除成功"));
        return true;
    }
}

