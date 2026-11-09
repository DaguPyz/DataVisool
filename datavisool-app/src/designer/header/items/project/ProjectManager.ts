/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, toJS} from "mobx";
import AbstractManager from "@/designer/manager/core/AbstractManager.ts";
import {IProjectInfoManager, ProjectState} from "@datavisool/sdk/types";

class ProjectManager extends AbstractManager<IProjectInfoManager> {
    constructor() {
        super();
        makeObservable(this, {
            projectConfig: observable,
            updateProjectConfig: action,
        })
    }

    /**
     * 项目设置
     */
    projectConfig: IProjectInfoManager = {
        name: "", //项目名称
        des: "", //项目描述
        state: ProjectState.DRAFT, //项目状态
        createTime: "", //创建时间
        updateTime: "", //更新时间
    };

    /**
     * 更新项目配置
     */
    updateProjectConfig = (data: IProjectInfoManager) => this.projectConfig = {...this.projectConfig, ...data};

    destroy(): void {
    }

    getData(): IProjectInfoManager {
        return toJS(this.projectConfig);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    init(data: IProjectInfoManager): void {
    }


}

const projectHdStore = new ProjectManager();
export default projectHdStore;
