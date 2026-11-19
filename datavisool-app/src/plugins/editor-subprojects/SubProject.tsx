/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import {Button, Input} from '@datavisool/ui';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import './SubProject.less';
import {Delete, Plus, Search} from "@icon-park/react";
import NewProjectDialog, {type INewProjectInfo} from "@/shared/project/NewProjectDialog.tsx";
import baseApi from "@/api/engineering/BaseApi.ts";
import {globalMessage} from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import {useEditorProject} from '@/shared/designer/EditorProjectContext.ts';
import DesignerPanelHeader from '@/shared/components/panel-header/DesignerPanelHeader';

interface Project {
    id: string;
    name: string;
}

interface SubProjectLifecycle {
    canEdit(): boolean;
    isActive(): boolean;
    trackTask<T>(task: Promise<T>): Promise<T>;
    registerPauseHandlers(onPause: () => void, onResume: () => void): () => void;
}

const SubProject = observer(({onClose, lifecycle}: {onClose(): void; lifecycle: SubProjectLifecycle}) => {
    const {rootProjectId, readWorkspace, switchWorkspace, onWorkspaceDeleted, renameWorkspace} = useEditorProject();
    const selectedId = readWorkspace()?.activeId ?? rootProjectId;
    const mounted = useRef(false);
    const projectScope = useRef<string | null>(null);
    const listRequest = useRef<AbortController>();
    const savingRenameRef = useRef<string | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [addVisible, setAddVisible] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const normalizedSearchValue = searchValue.trim().toLowerCase();
    const filteredProjects = useMemo(() => projects.filter(project =>
        project.name.toLowerCase().includes(normalizedSearchValue)
    ), [normalizedSearchValue, projects]);
    const showMainProject = !normalizedSearchValue || '主项目'.toLowerCase().includes(normalizedSearchValue);

    // 进入编辑模式
    const handleEditStart = (id: string, name: string) => {
        setEditingId(id);
        setEditValue(name);
    };

    // 保存编辑
    const handleEditSave = async (id: string) => {
        if (!lifecycle.canEdit()) return;
        const name = editValue.trim();
        if (!name || savingRenameRef.current === id) return;
        const original = projects.find(project => project.id === id);
        if (original?.name === name) { setEditingId(null); return; }
        savingRenameRef.current = id;
        const task = (async () => {
          try {
            const saved = await baseApi.updateProject({id, name});
            if (!mounted.current || projectScope.current !== rootProjectId) return;
            if (!saved) { globalMessage.messageApi?.error('重命名失败'); return; }
            renameWorkspace(id, name);
            if (mounted.current) {
                setProjects(current => current.map(project => project.id === id ? {...project, name} : project));
                setEditingId(current => current === id ? null : current);
            }
          } catch {
            if (lifecycle.isActive()) globalMessage.messageApi?.error('重命名失败');
          } finally { savingRenameRef.current = null; }
        })();
        await lifecycle.trackTask(task);
    };

    // 取消编辑
    const handleEditCancel = () => {
        if (!lifecycle.canEdit()) return;
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

    const loadSubProjectList = useCallback(async () => {
        if (!mounted.current || !lifecycle.canEdit()) return;
        listRequest.current?.abort();
        const request = new AbortController();
        listRequest.current = request;
        try {
            const projects = await baseApi.getSubProjectList(rootProjectId, {signal: request.signal});
            if (!request.signal.aborted && projectScope.current === rootProjectId) setProjects(projects);
        } catch (error) {
            if (!request.signal.aborted) console.error('加载子项目列表失败', error);
        }
    }, [lifecycle, rootProjectId]);

    useEffect(() => {
        mounted.current = true;
        projectScope.current = rootProjectId;
        void loadSubProjectList();
        const unregister = lifecycle.registerPauseHandlers(
            () => listRequest.current?.abort(),
            () => { if (mounted.current) void loadSubProjectList(); },
        );
        return () => {
            mounted.current = false;
            if (projectScope.current === rootProjectId) projectScope.current = null;
            unregister();
            listRequest.current?.abort();
        };
    }, [lifecycle, loadSubProjectList]);

    const handleCreate = async ({name, des, width, height}: INewProjectInfo) => {
        if (!lifecycle.canEdit()) return;
        const dataJson = JSON.stringify({canvasManager: {width, height}});
        await lifecycle.trackTask((async () => {
            const subId = await baseApi.createSubProject({name, pid: rootProjectId, des, dataJson});
            if (subId && mounted.current && projectScope.current === rootProjectId && lifecycle.isActive()) {
                setAddVisible(false);
                void loadSubProjectList();
            }
        })());
    };

    const delSubProject = (subId: string) => {
        if (!lifecycle.canEdit()) return;
        globalModal?.modalApi?.confirm({
            title: '删除子项目',
            content: '删除后将无法恢复，确认删除吗？',
            okText: '删除',
            cancelText: '取消',
            onOk: async () => {
                if (!lifecycle.canEdit()) return false;
                return lifecycle.trackTask((async () => {
                    if (!(await baseApi.deleteSubProject(rootProjectId, subId))) return;
                    if (!mounted.current || projectScope.current !== rootProjectId) return;
                    await onWorkspaceDeleted(subId);
                    if (lifecycle.isActive()) globalMessage.messageApi?.success('删除成功');
                    if (mounted.current) void loadSubProjectList();
                })());
            },
        });
    };

    return (
        <div className='sub-project'>
            <DesignerPanelHeader onClose={() => { if (lifecycle.canEdit()) onClose(); }} title="子项目" actions={
                <button type="button" className="designer-panel-header-button" title="新建子项目"
                        aria-label="新建子项目" onClick={() => { if (lifecycle.canEdit()) setAddVisible(true); }}>
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
                    <div className={`sub-project-item main-project ${selectedId === rootProjectId ? "sub-project-item-active" : ""}`}
                         role="button" tabIndex={0}
                         onKeyDown={e => { if (lifecycle.canEdit() && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void lifecycle.trackTask(switchWorkspace(rootProjectId)); } }}
                         onClick={() => { if (lifecycle.canEdit()) void lifecycle.trackTask(switchWorkspace(rootProjectId)); }}>
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
                         onKeyDown={e => { if (lifecycle.canEdit() && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void lifecycle.trackTask(switchWorkspace(project.id)); } }}
                         onClick={() => { if (lifecycle.canEdit()) void lifecycle.trackTask(switchWorkspace(project.id)); }}>
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
                                 onDoubleClick={() => { if (lifecycle.canEdit()) handleEditStart(project.id, project.name); }}>
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
            <NewProjectDialog visible={addVisible} onOk={handleCreate} onCancel={() => { if (lifecycle.canEdit()) setAddVisible(false); }}/>
        </div>
    )
})

export default SubProject;
