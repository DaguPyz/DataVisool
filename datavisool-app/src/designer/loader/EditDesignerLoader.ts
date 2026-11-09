/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import DesignerLoader from "./DesignerLoader.ts";
import {DesignerMode, DesignerScene, IDesignerManager} from "@datavisool/sdk/types";
import baseApi from "@/api/engineering/BaseApi.ts";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import {globalMessage} from "@datavisool/ui";
import managerStore from "@/designer/manager/ManagerStore.ts";
import {startAutoSave} from "@/designer/footer/auto-save/AutoSaveManager.ts";
import {getSaveData} from "@/designer/operate-provider/hot-key/HotKeyImpl.ts";
import enhanceFetch from "@/designer/footer/auto-save/EnhanceFetch.ts";
import footerStore from "@/designer/footer/FooterStore.ts";

export default class EditDesignerLoader extends DesignerLoader {

    private snapshotRecoveryTimer: number | null = null;

    public override cancelLoad() {
        super.cancelLoad();
        if (this.snapshotRecoveryTimer !== null) {
            clearTimeout(this.snapshotRecoveryTimer);
            this.snapshotRecoveryTimer = null;
        }
    }

    /**
     * 加载编辑模式下的下项目数据
     * @param id 项目id
     */
    async getProjectData(id: string): Promise<IDesignerManager | null> {
        const res = await baseApi.getProjectData(id);
        if (!res)
            return null;
        const {id: projectId, name, data} = res!;
        this.projectInfo = {id, name}
        data!.id = projectId;
        data!.name = name;
        return data!;
    }

    initializeRuntimeEnv(projectId: string, manager: DesignerManager) {
        if (manager) {
            //暴露必要的环境到 window
            window.DATAVISOOL_ENV = {
                ...window.DATAVISOOL_ENV,
                projectId,
                mode: DesignerMode.EDIT,
                controllers: manager.layerManager.controllers,
                definitions: DesignerLoader.definitionMap,
                remoteScripts: DesignerLoader.remoteScriptMap,
                fonts: this.fonts,
                currentManager: manager,
                mainManger: manager,
            }
            managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
            this.setLoaded(true);
        } else {
            globalMessage?.messageApi?.error("未加载到项目数据，请联系管理员");
        }
    }


    async load(id: string): Promise<void> {
        await super.load(id);
        if (!this.loaded)
            return;
        startAutoSave(`DATAVISOOL_${id}`, 1000 * 60 * 5,
            () => JSON.stringify(getSaveData()),
            () => ({...this.projectInfo}));
        enhanceFetch();
        if (!this.loaded)
            return;
        this.snapshotRecoveryTimer = window.setTimeout(() => {
            if (!this.loaded)
                return;
            const hasErr = localStorage.getItem(`PROJECT_ERROR_${window.DATAVISOOL_ENV.projectId}`) === '1';
            if (hasErr)
                footerStore.setSnapshotRecoveryVisible(true);
            if (this.snapshotRecoveryTimer !== null) {
                clearTimeout(this.snapshotRecoveryTimer);
                this.snapshotRecoveryTimer = null;
            }
        }, 2000)
    }
}
