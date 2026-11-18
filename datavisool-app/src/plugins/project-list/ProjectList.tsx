/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {memo, useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {Button, globalMessage, Input, Pagination} from "@datavisool/ui";
import type {RouterService} from "@datavisool/sdk/plugin/contracts/router";
import {NewProjectDialog, type INewProjectInfo} from "@/shared/project/NewProjectDialog.tsx";
import type {I18nBinding} from "@/i18n/i18nBinding.ts";
import type {AuthRequestInit} from "@/util/AuthFetchUtil.ts";
import {Plus, Search} from "@icon-park/react";
import baseApi from "@/api/engineering/BaseApi.ts";
import type {IPage, IProjectInfoManager} from "@datavisool/sdk/types";
import {withDesktopWebviewUserAgent} from "@/util/WebviewUserAgentUtil.ts";
import {openDesktopWebview} from "@/util/TauriCompatUtil.ts";
import DelProjectDialog from "./DelProjectDialog.tsx";
import CloneProjectDialog from "./CloneProjectDialog.tsx";
import ProjectItem from "./ProjectItem.tsx";
import projectCoverDashboard from "./assets/project-cover-dashboard.webp";
import "./ProjectList.less";

interface ProjectListProps extends I18nBinding {
    readonly canOperate: () => boolean;
    readonly navigate: RouterService['navigate'];
    readonly requestOptions: (signal?: AbortSignal) => AuthRequestInit;
    readonly trackWrite: <T>(request: Promise<T>) => Promise<T>;
}

type ProjectCardVariant = "analytics" | "mimo" | "map";

const PROJECT_PAGE_SIZE = 6;
const MAX_PROJECT_ID = "9223372036854775807";

const isProjectId = (id: unknown): id is string => {
    if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) return false;
    return id.length < MAX_PROJECT_ID.length
        || (id.length === MAX_PROJECT_ID.length && id <= MAX_PROJECT_ID);
};

const projectCardVariants: ProjectCardVariant[] = ["analytics", "mimo", "map"];
const projectCoverAssets = [projectCoverDashboard];

const formatProjectDate = (value?: unknown) => {
    if (!value) return "";
    if (Array.isArray(value) && value.length >= 3) {
        const [year, month, day] = value;
        return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
    }
    if (typeof value !== "string" && typeof value !== "number") return "";
    const text = String(value);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text.replace(/-/g, "/").slice(0, 10);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}/${month}/${day}`;
}

const ProjectList = memo(({i18n, subscribeLocale, canOperate, navigate, requestOptions, trackWrite}: ProjectListProps) => {
    useSyncExternalStore(subscribeLocale, i18n.getLocale);
    const tx = i18n.translate;
    const [addDialog, setAddDialog] = React.useState(false);
    const [delDialog, setDelDialog] = React.useState(false);
    const [cloneDialog, setCloneDialog] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState("");
    const delIdRef = useRef<string>("");
    const cloneIdRef = useRef<string>("");
    const latestQuery = useRef({current: 1, size: PROJECT_PAGE_SIZE, searchValue: ""});
    const mounted = useRef(false);
    const pendingRead = useRef<AbortController>();
    const [pageData, setPageData] = React.useState<IPage<IProjectInfoManager>>({
        records: [],
        total: 0,
        current: 1,
        size: PROJECT_PAGE_SIZE
    });

    const getProjectPageList = useCallback(async (params = latestQuery.current) => {
        if (!mounted.current || !canOperate()) return;
        pendingRead.current?.abort();
        const request = new AbortController();
        pendingRead.current = request;
        const query = {...params};
        latestQuery.current = query;
        try {
            while (!request.signal.aborted) {
                const data = await baseApi.getProjectInfoPageList(query, requestOptions(request.signal));
                if (request.signal.aborted) return;
                const lastPage = Math.max(1, Math.ceil(data.total / query.size));
                if (query.current <= lastPage) {
                    setPageData(data);
                    return;
                }
                // 删除可能让当前页消失，按最新总数重新读取最后一个有效页。
                query.current = lastPage;
            }
        } finally {
            if (pendingRead.current === request) pendingRead.current = undefined;
        }
    }, [canOperate, requestOptions]);


    const toggleNewProVisible = () => {
        if (canOperate()) setAddDialog(!addDialog);
    };

    const onOk = async ({name, des, width, height}: INewProjectInfo) => {
        if (!canOperate()) return;
        const id = await trackWrite(baseApi.createProject({
            name, des,
            dataJson: JSON.stringify({canvasManager: {width, height}}),
        }, requestOptions()));
        if (!mounted.current) return;
        if (!isProjectId(id)) {
            globalMessage.messageApi?.error(tx('创建失败'));
            return;
        }
        setAddDialog(false);
        await navigate(`/designer?id=${id}`);
    }

    const onCancel = () => setAddDialog(false);

    const operateHandler = (id: string, type: string) => {
        if (!canOperate()) return;
        switch (type) {
            case 'edit':
                void navigate(`/designer?id=${id}`);
                break;
            case 'show':
                void openDesktopWebview(`preview-${id}`, withDesktopWebviewUserAgent({
                    url: `/preview?id=${id}`,
                    title: 'DataVisool Preview',
                    decorations: false,
                    width: 1280,
                    height: 800
                }));
                break;
            case 'del':
                delIdRef.current = id;
                setDelDialog(true);
                break;
            case 'clone':
                cloneIdRef.current = id;
                setCloneDialog(true);
                break;
        }
    }

    const cancelDel = () => setDelDialog(false);

    const confirmClone = async () => {
        if (!canOperate()) return;
        try {
            const id = await trackWrite(baseApi.copyProject(cloneIdRef.current, requestOptions()));
            if (!mounted.current) return;
            if (!id) {
                globalMessage.messageApi?.error(tx('克隆失败'));
                return;
            }
            setCloneDialog(false);
            void getProjectPageList();
            globalMessage.messageApi?.success(tx('克隆成功'));
        } catch {
            if (mounted.current) globalMessage.messageApi?.error(tx('克隆失败'));
        }
    };

    const cancelClone = () => setCloneDialog(false);

    const confirmDel = async () => {
        if (!canOperate()) return;
        try {
            const deleted = await trackWrite(baseApi.deleteProject(delIdRef.current, requestOptions()));
            if (!mounted.current) return;
            if (!deleted) {
                globalMessage.messageApi?.error(tx('删除失败'));
                return;
            }
            setDelDialog(false);
            await getProjectPageList();
        } catch {
            if (mounted.current) globalMessage.messageApi?.error(tx('删除失败'));
        }
    }

    const pageChange = (page: number, size: number) => {
        getProjectPageList({...latestQuery.current, current: page, size});
    }

    const doSearch = (value: string) => {
        getProjectPageList({current: 1, size: PROJECT_PAGE_SIZE, searchValue: value.trim()});
    }

    useEffect(() => {
        mounted.current = true;
        void getProjectPageList();
        return () => {
            mounted.current = false;
            pendingRead.current?.abort();
        };
    }, [getProjectPageList]);

    const renameProject = (id: string, name: string) =>
        trackWrite(baseApi.updateProject({id, name}, requestOptions()));

    return (
        <div className='project-list-container'>
            <div className="project-list-header">
                <div className="project-list-title-group">
                    <h1>项目列表</h1>
                    <p>集中管理您的所有项目，轻松查看和快速访问</p>
                </div>
                <div className="project-list-actions">
                    <Input placeholder={'搜索项目并回车'}
                           prefix={<Search theme="outline" size={18}/>}
                           className="project-list-search-field"
                           controlClassName="project-list-search"
                           value={searchValue}
                           onChange={setSearchValue}
                           onPressEnter={(event) => doSearch(event.currentTarget.value)}/>
                    <Button type={"primary"}
                            icon={<Plus theme="outline" size={20}/>}
                            className="project-list-create-btn"
                            onClick={toggleNewProVisible}>新建项目</Button>
                </div>
            </div>
            <div className="project-list-content">
                <div className={'project-list'}>
                    {pageData.records.length > 0 ? pageData.records.map((item: IProjectInfoManager, index) => {
                        const variant = projectCardVariants[index % projectCardVariants.length];
                        return (
                            <ProjectItem key={item.id} id={item.id!} name={item.name!}
                                         description={item.des}
                                         updatedAt={formatProjectDate(item.updateTime || item.createTime)}
                                         variant={variant}
                                         cover={item.cover || projectCoverAssets[index % projectCoverAssets.length]}
                                         doOperate={operateHandler} canOperate={canOperate} navigate={navigate}
                                         renameProject={renameProject} translate={tx}/>
                        )
                    }) : (
                        <div className="project-list-empty">暂无项目</div>
                    )}
                </div>
                {pageData.total > 0 && (
                    <div className="project-list-pagination">
                        <Pagination
                            controlClassName="project-list-page"
                            current={pageData.current}
                            showSizeChanger={false}
                            pageSize={PROJECT_PAGE_SIZE}
                            total={pageData.total}
                            showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`}
                            onChange={pageChange}
                        />
                    </div>
                )}
            </div>
            <NewProjectDialog onOk={onOk} onCancel={onCancel} visible={addDialog}/>
            <DelProjectDialog visible={delDialog} onOk={confirmDel} onCancel={cancelDel}/>
            <CloneProjectDialog onOk={confirmClone} onCancel={cancelClone}
                                visible={cloneDialog}/>
        </div>
    );
})

export default ProjectList;
