/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import DesignerLoader from "./DesignerLoader.ts";
import {DesignerMode, IDesignerManager} from "@datavisool/sdk/types";
import baseApi from "@/api/engineering/BaseApi.ts";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import {globalMessage} from "@datavisool/ui";

export default class ViewDesignerLoader extends DesignerLoader {

    /**
     * 加载预览模式下的项目数据
     * @param id 项目id
     */
    async getProjectData(id: string): Promise<IDesignerManager | null> {
        const res = await baseApi.getProjectData(id);
        if (!res)
            return null;
        const {id: projectId, name, data} = res;
        if (data) {
            data!.id = projectId;
            data!.name = name;
        }
        this.projectInfo = {id: projectId, name};
        return data ?? {};
    }


    /**
     * 初始化预览模式下运行环境
     * @param projectId 项目id
     * @param manager 设计器管理器
     */
    initializeRuntimeEnv(projectId: string, manager: DesignerManager) {
        if (manager) {
            this.mode = DesignerMode.PREVIEW;
            //暴露必要的环境到 window
            window.DATAVISOOL_ENV = {
                ...window.DATAVISOOL_ENV,
                projectId,
                mode: DesignerMode.PREVIEW,
                controllers: manager.layerManager.controllers,
                definitions: DesignerLoader.definitionMap,
                currentManager: manager
            }
            this.setLoaded(true);
        } else {
            globalMessage?.messageApi?.error("项目不存在");
        }
    }
}
