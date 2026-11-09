/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {memo, useCallback, useEffect, useRef} from 'react';
import "@/pages/home/project-list/ProjectList.less";
import {Button, Input, Pagination} from "@datavisool/ui";
import {INewProjectInfo, NewProjectDialog} from "@/pages/home/project-list/NewProjectDialog.tsx";
import {globalMessage} from "@datavisool/ui";
import DelProjectDialog from "@/pages/home/project-list/DelProjectDialog.tsx";
import CloneProjectDialog from "@/pages/home/project-list/CloneProjectDialog.tsx";
import ProjectItem from "@/pages/home/project-list/ProjectItem.tsx";
import {tx} from "@/i18n/miniI18n.ts";
import {Plus, Search} from "@icon-park/react";
import baseApi from "@/api/engineering/BaseApi.ts";
import {IPage, IProjectInfoManager} from "@datavisool/sdk/types";
import {useNavigate} from "react-router-dom";
import {withDesktopWebviewUserAgent} from "@/util/WebviewUserAgentUtil.ts";
import {openDesktopWebview} from "@/util/TauriCompatUtil.ts";
import projectCoverDashboard from "@/pages/home/project-list/assets/project-cover-dashboard.webp";

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

export const ProjectList = memo(() => {
    const navigate = useNavigate();
    const [addDialog, setAddDialog] = React.useState(false);
    const [delDialog, setDelDialog] = React.useState(false);
    const [cloneDialog, setCloneDialog] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState("");
    const delIdRef = useRef<string>("");
    const cloneIdRef = useRef<string>("");
    const latestQuery = useRef({current: 1, size: PROJECT_PAGE_SIZE, searchValue: ""});
    const [pageData, setPageData] = React.useState<IPage<IProjectInfoManager>>({
        records: [],
        total: 0,
        current: 1,
        size: PROJECT_PAGE_SIZE
    });

    const getProjectPageList = useCallback(async (params = latestQuery.current) => {
        const query = {...params};
        latestQuery.current = query;
        while (true) {
            const data = await baseApi.getProjectInfoPageList(query);
            if (query !== latestQuery.current) return;
            const lastPage = Math.max(1, Math.ceil(data.total / query.size));
            if (query.current <= lastPage) {
                setPageData(data);
                return;
            }
            // 删除可能让当前页消失，按最新总数重新读取最后一个有效页。
            query.current = lastPage;
        }
    }, []);


    const toggleNewProVisible = () => setAddDialog(!addDialog);

    const onOk = async ({name, des, width, height}: INewProjectInfo) => {
        const id = await baseApi.createProject({
            name, des,
            dataJson: JSON.stringify({canvasManager: {width, height}}),
        });
        if (!isProjectId(id)) {
            globalMessage.messageApi?.error(tx('创建失败'));
            return;
        }
        setAddDialog(false);
        navigate(`/designer?id=${id}`);
    }

    const onCancel = () => setAddDialog(false);

    const operateHandler = (id: string, type: string) => {
        switch (type) {
            case 'edit':
                navigate(`/designer?id=${id}`);
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

    const confirmClone = () => {
        baseApi.copyProject(cloneIdRef.current).then((id) => {
            if (id !== "") {
                setCloneDialog(false);
                getProjectPageList();
                globalMessage.messageApi?.success(tx('克隆成功'));
            } else {
                globalMessage.messageApi?.error(tx('克隆失败'));
            }
        });
    }

    const cancelClone = () => setCloneDialog(false);

    const confirmDel = async () => {
        try {
            const deleted = await baseApi.deleteProject(delIdRef.current);
            if (!deleted) {
                globalMessage.messageApi?.error(tx('删除失败'));
                return;
            }
            setDelDialog(false);
            await getProjectPageList();
        } catch {
            globalMessage.messageApi?.error(tx('删除失败'));
        }
    }

    const pageChange = (page: number, size: number) => {
        getProjectPageList({...latestQuery.current, current: page, size});
    }

    const doSearch = (value: string) => {
        getProjectPageList({current: 1, size: PROJECT_PAGE_SIZE, searchValue: value.trim()});
    }

    useEffect(() => {
        getProjectPageList();
    }, [getProjectPageList]);

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
                                         doOperate={operateHandler}/>
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
            <CloneProjectDialog onOk={() => confirmClone()} onCancel={cancelClone}
                                visible={cloneDialog}/>
        </div>
    );
})

export default ProjectList;
