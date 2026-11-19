/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import DesignerLoader from "./DesignerLoader.ts";
import {DesignerMode, DesignerScene, IDesignerManager} from "@datavisool/sdk/types";
import baseApi from "@/api/engineering/BaseApi.ts";
import DesignerManager from "@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts";
import {globalMessage} from "@datavisool/ui";

export default class EditDesignerLoader extends DesignerLoader {

    /**
     * 加载编辑模式下的下项目数据
     * @param id 项目id
     */
    async getProjectData(id: string): Promise<IDesignerManager | null> {
        const signal = this.loadSignal;
        const res = await baseApi.getProjectData(id, {signal});
        if (signal?.aborted || !res)
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
                definitions: this.runtimeContext.registry.definitions,
                remoteScripts: this.runtimeContext.registry.remoteComponents,
                fonts: this.fonts,
                currentManager: manager,
                mainManger: manager,
            }
            this.runtimeContext.managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
            this.setLoaded(true);
        } else {
            globalMessage?.messageApi?.error("未加载到项目数据，请联系管理员");
        }
    }

}
