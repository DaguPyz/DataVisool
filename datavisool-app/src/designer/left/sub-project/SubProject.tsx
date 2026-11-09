/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import {Button, Input} from '@datavisool/ui';
import {useEffect, useMemo, useRef, useState} from 'react';
import './SubProject.less';
import {Delete, Plus, Search} from "@icon-park/react";
import NewProjectDialog, {INewProjectInfo} from "@/pages/home/project-list/NewProjectDialog.tsx";
import baseApi from "@/api/engineering/BaseApi.ts";
import {globalMessage} from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import {DesignerMode, DesignerScene} from "@datavisool/sdk/types";
import managerStore from "@/designer/manager/ManagerStore.ts";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import rightStore from "@/designer/right/RightStore.ts";
import {doSave} from "@/designer/operate-provider/hot-key/HotKeyImpl.ts";
import DesignerPanelHeader from '../panel-header/DesignerPanelHeader';

interface Project {
    id: string;
    name: string;
}

const SubProject = observer(() => {
    // 模拟项目数据
    const savingRenameRef = useRef<string | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [addVisible, setAddVisible] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const normalizedSearchValue = searchValue.trim().toLowerCase();
    const filteredProjects = useMemo(() => projects.filter(project =>
        project.name.toLowerCase().includes(normalizedSearchValue)
    ), [normalizedSearchValue, projects]);
    const showMainProject = !normalizedSearchValue || '主项目'.toLowerCase().includes(normalizedSearchValue);

    // 处理项目选择
    const handleSelect = (id: string) => {
        const {currentManager} = managerStore;
        if (currentManager?.id === id)
            return;
        setSelectedId(id);
        globalMessage.messageApi?.open({
            key: 'handleSelect',
            type: 'loading',
            content: '正在切换工作空间',
            duration: 0,
        })
        doSave().then((saved) => {
            globalMessage.messageApi?.destroy("handleSelect");
            if (!saved) {
                setSelectedId(currentManager?.id ?? null);
                return;
            }
            baseApi.getProjectData(id).then((subData) => {
                if (subData?.data) {
                    const {id, name} = subData;
                    subData.data.id = id;
                    subData.data.name = name;
                    const designerManager = new DesignerManager(DesignerScene.SUB_PROJECT);
                    const {setTargetIds} = eventOperateStore;
                    setTargetIds([]);
                    designerManager.init(subData?.data, DesignerMode.EDIT);
                    window.DATAVISOOL_ENV.currentManager = designerManager;
                    managerStore.resetManagerStack(designerManager, false, DesignerScene.SUB_PROJECT);
                    const timer = setTimeout(() => {
                        window.DATAVISOOL_ENV?.dragScaleProvider?.reset();
                        window.DATAVISOOL_ENV?.historyOperator?.reset();
                        rightStore.activeConfig(null, '');
                        clearTimeout(timer);
                        globalMessage.messageApi?.success('切换成功')
                    }, 10)
                }
            })
        })
    };

    const selectMainProject = () => {
        globalMessage.messageApi?.open({
            key: 'selectMainProject',
            type: 'loading',
            content: '正在切换工作空间',
            duration: 0,
        })
        setSelectedId("MAIN");
        doSave().then((saved) => {
            globalMessage.messageApi?.destroy("selectMainProject");
            if (!saved) {
                setSelectedId(managerStore.currentManager?.id ?? null);
                return;
            }
            const {isMainManager} = managerStore;
            if (isMainManager)
                return;
            const {setTargetIds} = eventOperateStore;
            setTargetIds([]);
            window.DATAVISOOL_ENV.currentManager = window.DATAVISOOL_ENV.mainManger;
            managerStore.resetManagerStack(window.DATAVISOOL_ENV.mainManger, true, DesignerScene.DEFAULT);
            const timer = setTimeout(() => {
                window.DATAVISOOL_ENV?.dragScaleProvider?.reset();
                window.DATAVISOOL_ENV?.historyOperator?.reset();
                rightStore.activeConfig(null, '');
                globalMessage.messageApi?.success('切换成功')
                clearTimeout(timer);
            }, 10)
        });
    }

    // 进入编辑模式
    const handleEditStart = (id: string, name: string) => {
        setEditingId(id);
        setEditValue(name);
    };

    // 保存编辑
    const handleEditSave = async (id: string) => {
        const name = editValue.trim();
        if (!name || savingRenameRef.current === id) return;
        const original = projects.find(project => project.id === id);
        if (original?.name === name) { setEditingId(null); return; }
        savingRenameRef.current = id;
        try {
            const saved = await baseApi.updateProject({id, name});
            if (!saved) { globalMessage.messageApi?.error('重命名失败'); return; }
            setProjects(current => current.map(project => project.id === id ? {...project, name} : project));
            if (managerStore.currentManager?.id === id) managerStore.currentManager.name = name;
            setEditingId(null);
            setEditValue('');
        } catch {
            globalMessage.messageApi?.error('重命名失败');
        } finally { savingRenameRef.current = null; }
    };

    // 取消编辑
    const handleEditCancel = () => {
        setEditingId(null);
        setEditValue('');
    };

    // 处理键盘事件
    const handleKeyPress = (e: React.KeyboardEvent, id: string) => {
        if (e.key === 'Enter') {
            handleEditSave(id);
        } else if (e.key === 'Escape') {
            handleEditCancel();
        }
    };

    const handleCreate = (data: INewProjectInfo) => {
        const {name, des, width, height} = data;
        const dataJson = JSON.stringify({canvasManager: {width, height}});
        const subData = {name, pid: window.DATAVISOOL_ENV.projectId, des, dataJson}
        return baseApi.createSubProject(subData).then((subId) => {
            if (subId) {
                setAddVisible(false)
                loadSubProjectList();
            }
        })
    }

    const delSubProject = (subId: string) => {
        globalModal?.modalApi?.confirm({
            title: '删除子项目',
            content: '删除后将无法恢复，确认删除吗？',
            okText: '删除',
            cancelText: '取消',
            onOk: () => {
                baseApi.deleteSubProject(window.DATAVISOOL_ENV.projectId, subId).then((res) => {
                    if (res) {
                        if (managerStore.currentManager?.id === subId) {
                            eventOperateStore.setTargetIds([]);
                            window.DATAVISOOL_ENV.currentManager = window.DATAVISOOL_ENV.mainManger;
                            managerStore.resetManagerStack(window.DATAVISOOL_ENV.mainManger, true, DesignerScene.DEFAULT);
                            window.DATAVISOOL_ENV?.dragScaleProvider?.reset();
                            window.DATAVISOOL_ENV?.historyOperator?.reset();
                            rightStore.activeConfig(null, '');
                            setSelectedId('MAIN');
                        }
                        globalMessage?.messageApi?.success('删除成功')
                        loadSubProjectList();
                    }
                })
            },
        })

    }

    const loadSubProjectList = () => {
        baseApi.getSubProjectList(window.DATAVISOOL_ENV.projectId).then((subProjects) => {
            setProjects(subProjects as Project[])
        })
    }

    useEffect(() => {
        loadSubProjectList();
    }, [])

    return (
        <div className='sub-project'>
            <DesignerPanelHeader title="子项目" actions={
                <button type="button" className="designer-panel-header-button" title="新建子项目"
                        aria-label="新建子项目" onClick={() => setAddVisible(true)}>
                    <Plus size={20} strokeWidth={1.5} aria-hidden="true"/>
                </button>
            }/>

            <div className="sub-project-header">
                <Input placeholder="搜索项目"
                       prefix={<Search size={16} strokeWidth={1.5}/>}
                       value={searchValue}
                       onChange={setSearchValue}
                       inputSize="md"
                       allowClear
                       className="sub-project-search"/>
            </div>

            <div className="sub-project-list">
                {showMainProject && (
                    <div className={`sub-project-item main-project ${selectedId === "MAIN" ? "sub-project-item-active" : ""}`}
                         role="button" tabIndex={0}
                         onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectMainProject(); } }}
                         onClick={selectMainProject}>
                        <div className="sub-project-item-indicator" aria-hidden="true"/>
                        <div className="sub-project-item-content">
                            <div className="sub-project-item-name">主项目</div>
                            <div className="sub-project-item-desc">当前工程主画布</div>
                        </div>
                    </div>
                )}
                {filteredProjects.map(project => (
                    <div key={project.id}
                         className={`sub-project-item ${selectedId === project.id ? 'sub-project-item-active' : ''}`}
                         role="button" tabIndex={0}
                         onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleSelect(project.id); } }}
                         onClick={() => handleSelect(project.id)}>
                        <div className="sub-project-item-indicator" aria-hidden="true"/>
                        {editingId === project.id ? (
                            <Input
                                value={editValue}
                                onChange={setEditValue}
                                onBlur={() => handleEditSave(project.id)}
                                onKeyDown={(e) => handleKeyPress(e, project.id)}
                                autoFocus
                                inputSize="sm"
                                className="sub-project-edit-input"
                            />
                        ) : (
                            <div className="sub-project-item-content"
                                 onDoubleClick={() => handleEditStart(project.id, project.name)}>
                                <div className="sub-project-item-name" title={project.name}>
                                    {project.name}
                                </div>
                                <div className="sub-project-item-desc">双击重命名</div>
                            </div>
                        )}
                        <Button type="text"
                                size="icon"
                                icon={<Delete size={16} strokeWidth={1.5} aria-hidden="true"/>}
                                title="删除子项目"
                                aria-label={`删除子项目「${project.name}」`}
                                className="sub-project-item-delete"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    delSubProject(project.id)
                                }}/>
                    </div>
                ))}
                {filteredProjects.length === 0 && (!normalizedSearchValue || !showMainProject) && (
                    <div className="sub-project-empty">
                        <div className="sub-project-empty-title">{normalizedSearchValue ? '未找到项目' : '暂无子项目'}</div>
                        <div className="sub-project-empty-desc">
                            {normalizedSearchValue ? '换个关键词试试' : '新建子项目，独立编辑和切换画布'}
                        </div>
                        {!normalizedSearchValue && <Button className="sub-project-empty-action"
                                                           icon={<Plus size={16} strokeWidth={1.5} aria-hidden="true"/>}
                                                           onClick={() => setAddVisible(true)}>
                            新建子项目
                        </Button>}
                    </div>
                )}
            </div>
            <NewProjectDialog visible={addVisible} onOk={handleCreate} onCancel={() => setAddVisible(false)}/>
        </div>
    )
})

export default SubProject;
