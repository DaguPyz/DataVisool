/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {IProjectAiMemory} from "./ProjectAiMemory.ts";
/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */


import {IPage, IPageParam, IProject, IProjectInfoManager} from "@datavisool/sdk/types";
import {IImageData} from "@/comps/builtin/base-image/BaseImageComponent.tsx";

/**
 * 工程化API
 * 此API结构的设计用于完成设计器在不同场景下（比如编辑、预览、发布等）能自动切换实现。使用同一个api请求不同场景下的数据。
 */
export abstract class AbstractApi {
    /**
     * 创建项目
     * @param project 项目初始化数据
     */
    public abstract createProject(project: IProjectInfoManager): Promise<string | null>;

    /**
     * 更新项目数据
     * @param projectData 项目数据
     */
    public abstract updateProject(projectData: IProjectInfoManager): Promise<boolean> ;

    /**
     * 删除项目（在线项目为逻辑删除，本地项目为物理删除）
     * @param id 项目id
     */
    public abstract deleteProject(id: string): Promise<boolean>;

    /**
     * 获取项目分页列表
     * @param pageParam
     */
    public abstract getProjectInfoPageList(pageParam: IPageParam): Promise<IPage<IProjectInfoManager>>;

    /**
     * 获取项目完整数据，包括主设计器数据和蓝图设计器数据及每一个组件的详细配置
     * @param id 项目id
     */
    public abstract getProjectData(id: string): Promise<IProject | null>;

    /**
     * 复制项目
     * @param id 项目id
     */
    public abstract copyProject(id: string): Promise<string>;

    /**
     * 获取项目 AI 摘要
     * @param projectId 项目id
     */
    public abstract getProjectAiMemory(projectId: string): Promise<IProjectAiMemory | null>;

    /**
     * 保存项目 AI 摘要
     * @param memory 项目摘要
     */
    public abstract saveProjectAiMemory(memory: IProjectAiMemory): Promise<IProjectAiMemory | null>;


    /**
     * 获取图片资源列表
     * @param projectId 项目id
     */
    public abstract getImageSourceList(projectId: string): Promise<IImageData[]>;

    /**
     * 删除图片资源
     * @param imageId 图片id
     */
    public abstract delImageSource(imageId: string): Promise<boolean>;

    /**
     * 上传封面快照
     * @param file 图片文件
     */
    public abstract uploadCover(file: File): Promise<boolean>;
}
