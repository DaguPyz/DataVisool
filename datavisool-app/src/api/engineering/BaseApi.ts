/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {IProjectAiMemory} from "./ProjectAiMemory.ts";
import type {ComponentDocumentInfo} from "@/designer/ai-driven/ComponentAiSelectionDocRegistry.ts";
/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {URLUtil} from "@datavisool/sdk";
import {IImageData} from "../../comps/builtin/base-image/BaseImageComponent.tsx";
import AuthFetchUtil from "../../util/AuthFetchUtil.ts";
import {IPage, IPageParam, IProject, IProjectInfoManager, IProjectMeta} from "@datavisool/sdk/types";
import {AbstractApi} from "./AbstractApi.ts";
import ProjectUtil from "../../util/ProjectUtil.ts";
import ProjectDataCodecUtil from "../../util/ProjectDataCodecUtil.ts";

export class BaseApi extends AbstractApi {

    async createProject(project: IProjectInfoManager): Promise<string | null> {
        return await AuthFetchUtil.post<string | null>('/api/project/create', project);
    }

    async copyProject(id: string): Promise<string> {
        return await AuthFetchUtil.get<string>(`/api/project/copy/${id}`);
    }

    async getProjectAiMemory(projectId: string): Promise<IProjectAiMemory | null> {
        const data = await AuthFetchUtil.get<IProjectAiMemory | null>(`/api/projectAiMemory/get/${projectId}`);
        return data || null;
    }

    async saveProjectAiMemory(memory: IProjectAiMemory): Promise<IProjectAiMemory | null> {
        const data = await AuthFetchUtil.post<IProjectAiMemory | null>('/api/projectAiMemory/save', memory);
        return data || null;
    }

    async deleteProject(id: string): Promise<boolean> {
        return await AuthFetchUtil.get<boolean>(`/api/project/del/${id}`);
    }

    async getProjectData(id: string): Promise<IProject | null> {
        const data = await AuthFetchUtil.get<{ id: string, name: string, dataJson: string } | null>(`/api/project/getProjectData/${id}`);
        if (data !== null) {
            const {id, name, dataJson} = data;
            const decoded = ProjectDataCodecUtil.decompressIfNeeded(dataJson);
            const projectData = ProjectUtil.deserializeProjectData(decoded);
            return {id, name, data: projectData};
        }
        return null;
    }

    async getProjectMeta(id: string): Promise<IProjectMeta | null> {
        const data = await AuthFetchUtil.get<{ id: string, name: string, pid: string | null, dataJson: string } | null>(`/api/project/getProjectInfo/${id}`);
        if (data !== null) {
            const {id, name, pid, dataJson} = data;
            const decoded = ProjectDataCodecUtil.decompressIfNeeded(dataJson);
            const projectData = ProjectUtil.deserializeProjectData(decoded);
            return {id, name, pid, data: projectData};
        }
        return null;
    }

    /**
     * 获取项目分页列表
     */
    public async getProjectInfoPageList(pageParam: IPageParam): Promise<IPage<IProjectInfoManager>> {
        const data = await AuthFetchUtil.post<IPage<IProjectInfoManager>>('/api/project/pageList', pageParam);
        return data || {records: [], total: 0, current: 1, size: 10};
    }

    public async updateProject(data: IProjectInfoManager): Promise<boolean> {
        return await AuthFetchUtil.post<boolean>('/api/project/update', data);
    }

    async getImageSourceList(): Promise<IImageData[]> {
        const data = await AuthFetchUtil.get<IImageData[]>(`/api/image/getUserUploadedImageList`);
        return data || [];
    }

    public async delImageSource(imageId: string): Promise<boolean> {
        return await AuthFetchUtil.get<boolean>(`/api/image/del/${imageId}`);
    }

    public async getVideoSourceList(name?: string): Promise<any[]> {
        const records: any[] = [];
        let current = 1;
        const size = 100;
        while (true) {
            const data = await AuthFetchUtil.post<IPage<any>>(`/api/video/page`, {
                current, size, searchValue: name?.trim()
            });
            const page = data?.records || [];
            records.push(...page);
            if (!data || page.length < size || records.length >= data.total) break;
            current++;
        }
        return records;
    }

    public async delVideoSource(videoId: string): Promise<boolean> {
        return await AuthFetchUtil.get<boolean>(`/api/video/delete/${videoId}`);
    }

    public async uploadCover(file: File): Promise<boolean> {
        const {id} = URLUtil.parseUrlParams();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('id', id);
        return await AuthFetchUtil.post<boolean>('/api/project/cover', formData, {headers: {'Content-Type': 'multipart/form-data'}});
    }

    /**
     * 获取远程组件列表
     */
    public async getAllRemoteComponents(): Promise<{ id: string, url: string, documentInfo?: ComponentDocumentInfo }[]> {
        const data = await AuthFetchUtil.get<{ id: string, url: string, documentInfo?: ComponentDocumentInfo }[]>('/api/remote/component/list');
        return data || [];
    }

    public async uploadRemoteComponent(file: File, id?: string): Promise<boolean> {
        const formData = new FormData();
        formData.append('componentFile', file);
        id && formData.append('id', id);
        return await AuthFetchUtil.post<boolean>('/api/remote/component/upload', formData, {
            headers: {'Content-Type': 'multipart/form-data'},
            loadingText: '正在上传服务器组件...'
        });
    }

    public async createTemplate(template: FormData): Promise<boolean> {
        return await AuthFetchUtil.post<boolean>('/api/template/create', template, {headers: {'Content-Type': 'multipart/form-data'}});
    }

    public async getTemplateList(name?: string): Promise<{ id: string, name: string }[]> {
        return await AuthFetchUtil.post<{ id: string, name: string }[]>('/api/template/getAllTemplate', {name: name});
    }

    public async getTemplate(id: string): Promise<any> {
        return await AuthFetchUtil.get<any>(`/api/template/getTemplate/${id}`);
    }

    public async deleteTemplate(ids: string[]): Promise<boolean> {
        return await AuthFetchUtil.post<boolean>(`/api/template/batchDel`, ids);
    }

    public async createSubProject(subProject: any): Promise<string> {
        return await AuthFetchUtil.post<string>('/api/project/createSubProject', subProject);
    }

    public async getSubProjectList(id: string): Promise<{ id: string, name: string }[]> {
        const data = await AuthFetchUtil.get<{ id: string, name: string }[]>(`/api/project/getSubProjectList/${id}`);
        return data || [];
    }

    public async deleteSubProject(pid: string, subId: string): Promise<boolean> {
        return await AuthFetchUtil.post<boolean>(`/api/project/deleteSubProject/${pid}/${subId}`, {});
    }

}

const baseApi = new BaseApi();
export default baseApi;
