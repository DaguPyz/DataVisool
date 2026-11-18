/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import "@/pages/home/project-setting/ProjectSetting.less";
import {Tabs} from "@datavisool/ui";
import type {TabsProps} from "@datavisool/ui";
import {useLocation} from "react-router-dom";
import type {DynamicScriptsService} from "@datavisool/sdk/plugin/contracts/dynamicScripts";

export default function ProjectSetting({ScriptList}: DynamicScriptsService) {

    const location = useLocation();
    const {projectId, title} = location.state;

    const items: TabsProps['items'] = [
        {
            key: '1',
            label: '动态脚本',
            children: <ScriptList key={projectId} title={'项目动态脚本'} projectId={projectId} variant="resource"/>,
        },
    ];
    return (
        <div className="project-setting">
            <div className="project-setting-header">
                <div className="setting-title">项目设置 - {title}</div>
            </div>
            <div className="project-setting-body">
                <Tabs className="project-setting-tabs" defaultActiveKey="1" items={items}/>
            </div>
        </div>
    )
}
