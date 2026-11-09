/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {FormEvent, useRef} from 'react';
import './ProjectHdItemImpl.less';
import projectManager from "./ProjectManager.ts";
import {Button, Grid, Input, Radio} from "@datavisool/ui";
import {IProjectInfoManager, ProjectState} from "@datavisool/sdk/types";
import {Dialog} from "@datavisool/ui";
import designerHeaderStore from "@/designer/header/DesignerHeaderStore.ts";


const ProjectHdItemImpl = () => {
    const configRef = useRef<IProjectInfoManager | null>({...projectManager.projectConfig});
    const {name, des, state} = configRef.current!;

    const onClose = () => designerHeaderStore.setCurrentKey('');

    const doSave = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const {updateProjectConfig} = projectManager;
        updateProjectConfig(configRef.current!);
        onClose();
    }

    return (
        <Dialog title={'项目设置'} className={'datavisool-header-project-set'} open={true}
                onClose={onClose} mask centered showClose>
            <form onSubmit={doSave}>
                <div style={{display: 'flex', flexWrap: 'wrap'}}>
                    <Grid gridGap={'15px'} columns={2}>
                        <Input label={'项目名称'} defaultValue={name}
                               onChange={(name) => configRef.current!.name = name}/>
                        <Input label={'项目描述'} defaultValue={des}
                               onChange={(des) => configRef.current!.des = des}/>
                        <Radio label={'项目状态'} onChange={value => configRef.current!.state = value as ProjectState}
                               containerStyle={{gridColumn: '1/3'}}
                               defaultValue={state}
                               options={[
                                   {label: '草稿', value: ProjectState.DRAFT},
                                   {label: '发布', value: ProjectState.PUBLISH},
                                   {label: '封存', value: ProjectState.SEALED}
                               ]}/>
                    </Grid>

                </div>
                <div className={'datavisool-header-project-footer'}>
                    <Button>保存</Button>
                    <Button onClick={onClose}>取消</Button>
                </div>
            </form>
        </Dialog>
    );
}

export default ProjectHdItemImpl;
