/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {IDesignerManager, IProject, IProjectMeta} from "@datavisool/sdk/types";
import {DataConfigType} from "@datavisool/sdk/types";
import baseApi from "@/api/engineering/BaseApi.ts";
import {CONFIG_FUNC_PREFIX} from "@/constant/GlobalConstant.ts";
import {cloneDeep} from "lodash";
import {collectFontFamilies} from "@/util/FontFamilyUtil";

export interface ProjectDataConfigVisitContext {
    path: Array<string | number>;
    parent: Record<string, any> | Array<any> | null;
    key: string | number | null;
}

export interface ProjectGraphNode {
    id: string;
    name: string;
    pid: string | null;
    data: IDesignerManager;
    isEntry: boolean;
}

export interface ProjectGraphBuildResult {
    entryProjectId: string;
    nodes: ProjectGraphNode[];
}

export interface ProjectGraphBuildOptions {
    loadProjectMeta?: (id: string) => Promise<IProjectMeta | null>;
}

export interface ProjectDependencyPayload {
    id: string;
    name: string;
    fonts: string[];
    images: string[];
    videos: string[];
    models: string[];
    components: string[];
    commonApiIds: string[];
    databaseIds: string[];
    projectJson: string;
}

export interface ProjectGraphDependencyNodePayload extends ProjectDependencyPayload {
    sourceProjectId: string;
    sourcePid: string | null;
    isEntry: boolean;
}

export interface ProjectGraphDependencyPayload extends Omit<ProjectDependencyPayload, 'projectJson'> {
    projects: ProjectGraphDependencyNodePayload[];
}

export class ProjectGraphCycleError extends Error {
    public readonly chain: string[];

    constructor(chain: string[]) {
        super(`检测到循环引用：${chain.join(' -> ')}`);
        this.name = 'ProjectGraphCycleError';
        this.chain = chain;
    }
}

export default class ProjectUtil {

    private static readonly DATA_CONFIG_KEYS = new Set([
        'sourceType',
        'staticData',
        'apiData',
        'database',
        'commonApi',
        'globalVariable',
        'webSocket',
        'mqtt'
    ]);

    /**
     * 兼容桌面端两种资源协议，并把 URL 编码后的本地绝对路径还原成可进一步处理的普通字符串。
     * 如果传入的不是资源协议地址，则原样返回。
     */
    private static decodeAssetPath(url: string) {
        const trimmed = (url || '').trim();
        if (!trimmed) return '';
        const prefixes = ['http://asset.localhost/', 'asset://localhost/'];
        const prefix = prefixes.find((item) => trimmed.startsWith(item));
        if (prefix) {
            const encoded = trimmed.substring(prefix.length);
            try {
                return decodeURIComponent(encoded);
            } catch {
                return encoded;
            }
        }
        return trimmed;
    }

    /**
     * 从绝对资源路径中提取导出依赖使用的相对 key。
     * 优先截取指定资源目录标记位之后的部分，截不到时退化为文件名。
     */
    private static extractAfterMarker(url: string, marker: string) {
        const raw = ProjectUtil.normalizeAssetPath(url.split(/[?#]/, 1)[0]);
        const idx = raw.lastIndexOf(marker);
        if (idx >= 0) {
            return raw.substring(idx + marker.length).replace(/^\/+/, '');
        }
        return raw.substring(raw.lastIndexOf('/') + 1);
    }

    private static normalizeAssetPath(url: string) {
        const raw = ProjectUtil.decodeAssetPath(url).replace(/\\+/g, '/');
        ProjectUtil.requireCurrentStaticPath(raw);
        return raw;
    }

    /**
     * 从图片相关字段中提取静态图片依赖。
     * 仅对包含 `/static/images/` 标记的本地/资源协议地址生效，避免误把远程图片统计为本地依赖。
     */
    private static collectImageDependency(images: Set<string>, value: unknown, depth = 0) {
        if (depth > 2 || value == null) return;
        if (typeof value === 'string') {
            const candidate = value.trim();
            const desktopAsset = candidate.startsWith('http://asset.localhost/') || candidate.startsWith('asset://localhost/');
            if (!desktopAsset && (/^(?:https?:)?\/\//i.test(candidate)
                || (/^[a-z][a-z\d+.-]*:/i.test(candidate) && !/^[a-z]:[\\/]/i.test(candidate)))) return;
            const path = candidate.split(/[?#]/, 1)[0];
            const raw = ProjectUtil.normalizeAssetPath(path);
            if (!raw.includes('/static/images/')) return;
            const filename = ProjectUtil.extractAfterMarker(path, '/static/images/');
            if (filename) images.add(filename);
        } else if (ProjectUtil.isObjectRecord(value)) {
            ['url', 'src', 'data', 'onLineUrl', 'localUrl', 'value'].forEach((key) =>
                ProjectUtil.collectImageDependency(images, value[key], depth + 1));
        }
    }

    /**
     * 判断一个值是否为普通对象记录，排除数组与 null。
     */
    private static isObjectRecord(value: unknown): value is Record<string, any> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /**
     * 归一化项目 id，统一做 trim 并过滤空值。
     */
    private static normalizeProjectId(id: unknown) {
        if (typeof id !== 'string') {
            return '';
        }
        return id.trim();
    }

    /**
     * 将项目元数据写入项目图 Map。
     * 如果同一项目被多次纳入，则复用已有节点，只在入口项目场景下补齐 `isEntry` 标记。
     */
    private static upsertProjectGraphNode(
        nodeMap: Map<string, ProjectGraphNode>,
        project: IProjectMeta,
        isEntry: boolean
    ) {
        const projectId = ProjectUtil.normalizeProjectId(project.id);
        if (!projectId || !project.data) {
            return null;
        }
        const existed = nodeMap.get(projectId);
        if (existed) {
            if (isEntry && !existed.isEntry) {
                existed.isEntry = true;
            }
            return existed;
        }
        const node: ProjectGraphNode = {
            id: projectId,
            name: project.name,
            pid: ProjectUtil.normalizeProjectId(project.pid) || null,
            data: project.data,
            isEntry,
        };
        nodeMap.set(projectId, node);
        return node;
    }

    /**
     * 从单个项目 JSON 中提取全部 `ScreenReference.style.screenId`。
     * 该扫描会递归遍历任意嵌套结构，因此循环容器里的引用也会被覆盖。
     */
    public static collectScreenReferenceIds(projectData: IDesignerManager) {
        const ids = new Set<string>();
        const visited = new WeakSet<object>();

        const walk = (current: unknown) => {
            if (typeof current !== 'object' || current === null) {
                return;
            }
            if (visited.has(current)) {
                return;
            }
            visited.add(current);

            if (Array.isArray(current)) {
                current.forEach((item) => walk(item));
                return;
            }

            const currentRecord = current as Record<string, any>;

            if (currentRecord.base?.type === 'ScreenReference') {
                const screenId = ProjectUtil.normalizeProjectId(currentRecord.style?.screenId);
                if (screenId) {
                    ids.add(screenId);
                }
            }

            Object.values(currentRecord).forEach((child) => walk(child));
        };

        walk(projectData);
        return Array.from(ids);
    }

    /**
     * 读取指定项目的完整祖先链，返回顺序固定为：最顶层主项目 -> ... -> 直接父项目。
     * 返回结果不包含输入的当前项目本身。
     */
    public static async collectProjectAncestorChain(
        projectId: string,
        options: ProjectGraphBuildOptions = {}
    ) {
        const loadProjectMeta = options.loadProjectMeta ?? ((id: string) => baseApi.getProjectMeta(id));
        const chain: IProjectMeta[] = [];
        let currentId = ProjectUtil.normalizeProjectId(projectId);
        const visited = new Set<string>();

        while (currentId) {
            const current = await loadProjectMeta(currentId);
            if (!current) {
                throw new Error(`项目不存在：${currentId}`);
            }
            const parentId = ProjectUtil.normalizeProjectId(current.pid);
            if (!parentId) {
                break;
            }
            if (visited.has(parentId)) {
                throw new Error(`项目层级存在循环：${parentId}`);
            }
            visited.add(parentId);
            const parent = await loadProjectMeta(parentId);
            if (!parent) {
                throw new Error(`项目不存在：${parentId}`);
            }
            chain.unshift(parent);
            currentId = parentId;
        }

        return chain;
    }

    /**
     * 基于入口项目构建导出所需的项目图闭包。
     * 规则：
     * - 自动补齐入口项目和被引用子项目的祖先链；
     * - 仅递归扫描“入口项目 + 被引用项目”的 `ScreenReference`；
     * - 祖先项目只用于恢复结构，不会额外展开它们自己的引用；
     * - 检测到循环引用时直接抛出明确链路错误。
     */
    public static async buildProjectGraph(
        entryProjectId: string,
        options: ProjectGraphBuildOptions = {}
    ): Promise<ProjectGraphBuildResult> {
        const normalizedEntryId = ProjectUtil.normalizeProjectId(entryProjectId);
        if (!normalizedEntryId) {
            throw new Error('项目 id 不能为空');
        }

        const loadProjectMeta = options.loadProjectMeta ?? ((id: string) => baseApi.getProjectMeta(id));
        const metaCache = new Map<string, Promise<IProjectMeta>>();
        const nodeMap = new Map<string, ProjectGraphNode>();
        const scannedProjects = new Set<string>();
        const activeStack: string[] = [];

        const getProjectMeta = async (projectId: string) => {
            const normalizedId = ProjectUtil.normalizeProjectId(projectId);
            if (!normalizedId) {
                throw new Error('项目 id 不能为空');
            }
            const cached = metaCache.get(normalizedId);
            if (cached) {
                return cached;
            }
            const request = (async () => {
                const project = await loadProjectMeta(normalizedId);
                if (!project || !project.data) {
                    throw new Error(`项目不存在或缺少数据：${normalizedId}`);
                }
                return {
                    ...project,
                    id: normalizedId,
                    pid: ProjectUtil.normalizeProjectId(project.pid) || null
                } as IProjectMeta;
            })();
            metaCache.set(normalizedId, request);
            return request;
        };

        const ensureAncestorChain = async (projectId: string) => {
            const project = await getProjectMeta(projectId);
            const parentId = ProjectUtil.normalizeProjectId(project.pid);
            if (!parentId) {
                return;
            }
            await ensureAncestorChain(parentId);
            const parent = await getProjectMeta(parentId);
            ProjectUtil.upsertProjectGraphNode(nodeMap, parent, false);
        };

        const buildCycleChain = async (cycleIds: string[]) => {
            const labels = await Promise.all(cycleIds.map(async (id) => {
                const project = await getProjectMeta(id);
                return `${project.name}(${id})`;
            }));
            return labels;
        };

        const scanProject = async (projectId: string, isEntry: boolean) => {
            const normalizedId = ProjectUtil.normalizeProjectId(projectId);
            await ensureAncestorChain(normalizedId);
            const project = await getProjectMeta(normalizedId);
            ProjectUtil.upsertProjectGraphNode(nodeMap, project, isEntry);

            if (scannedProjects.has(normalizedId)) {
                return;
            }
            activeStack.push(normalizedId);

            for (const referencedId of ProjectUtil.collectScreenReferenceIds(project.data)) {
                const normalizedReferencedId = ProjectUtil.normalizeProjectId(referencedId);
                if (!normalizedReferencedId) {
                    continue;
                }
                const cycleIndex = activeStack.indexOf(normalizedReferencedId);
                if (cycleIndex >= 0) {
                    const cycleIds = [...activeStack.slice(cycleIndex), normalizedReferencedId];
                    throw new ProjectGraphCycleError(await buildCycleChain(cycleIds));
                }
                await scanProject(normalizedReferencedId, false);
            }

            activeStack.pop();
            scannedProjects.add(normalizedId);
        };

        await scanProject(normalizedEntryId, true);

        return {
            entryProjectId: normalizedEntryId,
            nodes: Array.from(nodeMap.values())
        };
    }

    /**
     * 判断当前节点是否可以视为数据源配置节点。
     * 这里通过是否命中数据源关键字段做弱约束识别，便于递归扫描时兼容旧数据结构。
     */
    private static isDataConfigNode(value: unknown): value is DataConfigType {
        if (!ProjectUtil.isObjectRecord(value)) {
            return false;
        }
        return Object.keys(value).some((key) => ProjectUtil.DATA_CONFIG_KEYS.has(key));
    }

    /**
     * 检查遍历路径的段是否存在。数组下标 0 是有效路径段，不能用真值判断。
     */
    private static hasPathSegment(path: ProjectDataConfigVisitContext['path'], index: number) {
        const segment = path[index];
        return segment !== undefined && segment !== '';
    }

    /**
     * 深度遍历项目数据中的所有数据源配置节点，并把命中的节点及其上下文交给回调处理。
     * 该方法会自动跳过循环引用，适合作为公共扫描入口。
     */
    public static walkProjectDataConfigs(
        projectData: IDesignerManager,
        visitor: (config: DataConfigType, context: ProjectDataConfigVisitContext) => void
    ) {
        const visited = new WeakSet<object>();

        const walk = (
            current: unknown,
            path: Array<string | number>,
            parent: Record<string, any> | Array<any> | null,
            key: string | number | null
        ) => {
            if (typeof current !== 'object' || current === null) {
                return;
            }
            if (visited.has(current)) {
                return;
            }
            visited.add(current);

            if (ProjectUtil.isDataConfigNode(current)) {
                visitor(current, {path, parent, key});
            }

            if (Array.isArray(current)) {
                current.forEach((item, index) => walk(item, [...path, index], current, index));
                return;
            }

            Object.entries(current).forEach(([childKey, childValue]) => {
                walk(childValue, [...path, childKey], current, childKey);
            });
        };

        walk(projectData, [], null, null);
    }

    /**
     * 判断当前命中的数据源节点是否位于普通组件的 `data` 配置下。
     */
    private static isComponentDataConfigContext(context: ProjectDataConfigVisitContext) {
        const path = context.path;
        if (context.key !== 'data') return false;
        let index = 0;
        while (index < path.length) {
            if (path[index] !== 'layerManager' || path[index + 1] !== 'elemConfigs' || !ProjectUtil.hasPathSegment(path, index + 2))
                return false;
            index += 3;
            if (path[index] === 'data' && index === path.length - 1)
                return true;
            // LoopContainer persists its nested designer manager at this exact boundary.
            if (path[index] !== 'managerData' || path[index + 1] !== 'layerManager')
                return false;
            index++;
        }
        return false;
    }

    /**
     * 判断当前命中的数据源节点是否位于全局变量的 `triggerSource` 下。
     */
    private static isGlobalVariableTriggerSourceContext(context: ProjectDataConfigVisitContext) {
        const path = context.path;
        if (context.key !== 'triggerSource') return false;
        let index = 0;
        while (index < path.length) {
            if (path[index] === 'globalVariableManager')
                return path.length === index + 4
                    && path[index + 1] === 'globalVariables'
                    && ProjectUtil.hasPathSegment(path, index + 2)
                    && path[index + 3] === 'triggerSource';
            if (path[index] !== 'layerManager' || path[index + 1] !== 'elemConfigs' || !ProjectUtil.hasPathSegment(path, index + 2)
                || path[index + 3] !== 'managerData')
                return false;
            index += 4;
        }
        return false;
    }

    /**
     * 判断当前命中的数据源节点是否位于 GIS source 的 `dataConfig` 下。
     * 是否真的是运行时 GIS 数据源，还要结合父节点的 `sourceType/dataMode` 二次判断。
     */
    private static isGisDataConfigContext(context: ProjectDataConfigVisitContext) {
        const path = context.path;
        if (context.key !== 'dataConfig') return false;
        let index = 0;
        while (index < path.length) {
            if (path[index] !== 'layerManager' || path[index + 1] !== 'elemConfigs' || !ProjectUtil.hasPathSegment(path, index + 2))
                return false;
            index += 3;
            if (path[index] === 'style')
                return path.length === index + 4
                    && path[index + 1] === 'sources'
                    && ProjectUtil.hasPathSegment(path, index + 2)
                    && path[index + 3] === 'dataConfig';
            if (path[index] !== 'managerData' || path[index + 1] !== 'layerManager')
                return false;
            index++;
        }
        return false;
    }

    /**
     * 收集普通组件 `data.commonApi.commonApiId` 中引用到的公共 API id。
     */
    public static collectComponentCommonApiIds(projectData: IDesignerManager) {
        const ids = new Set<string>();

        ProjectUtil.walkProjectDataConfigs(projectData, (config, context) => {
            if (!ProjectUtil.isComponentDataConfigContext(context)) {
                return;
            }
            if (config.sourceType !== 'commonApi') {
                return;
            }
            const commonApiId = config.commonApi?.commonApiId?.trim();
            if (commonApiId) {
                ids.add(commonApiId);
            }
        });

        return Array.from(ids);
    }

    /**
     * 收集普通组件 `data.database.targetDb` 中引用到的数据库数据源 id。
     */
    public static collectComponentDatabaseIds(projectData: IDesignerManager) {
        const ids = new Set<string>();

        ProjectUtil.walkProjectDataConfigs(projectData, (config, context) => {
            if (!ProjectUtil.isComponentDataConfigContext(context)) {
                return;
            }
            if (config.sourceType !== 'database') {
                return;
            }
            const targetDb = config.database?.targetDb?.trim();
            if (targetDb) {
                ids.add(targetDb);
            }
        });

        return Array.from(ids);
    }

    /**
     * 收集全局变量 `triggerSource.commonApi.commonApiId` 中引用到的公共 API id。
     */
    public static collectGlobalVariableCommonApiIds(projectData: IDesignerManager) {
        const ids = new Set<string>();

        ProjectUtil.walkProjectDataConfigs(projectData, (config, context) => {
            if (!ProjectUtil.isGlobalVariableTriggerSourceContext(context)) {
                return;
            }
            if (config.sourceType !== 'commonApi') {
                return;
            }
            const commonApiId = config.commonApi?.commonApiId?.trim();
            if (commonApiId) {
                ids.add(commonApiId);
            }
        });

        return Array.from(ids);
    }

    /**
     * 收集全局变量 `triggerSource.database.targetDb` 中引用到的数据库数据源 id。
     */
    public static collectGlobalVariableDatabaseIds(projectData: IDesignerManager) {
        const ids = new Set<string>();

        ProjectUtil.walkProjectDataConfigs(projectData, (config, context) => {
            if (!ProjectUtil.isGlobalVariableTriggerSourceContext(context)) {
                return;
            }
            if (config.sourceType !== 'database') {
                return;
            }
            const targetDb = config.database?.targetDb?.trim();
            if (targetDb) {
                ids.add(targetDb);
            }
        });

        return Array.from(ids);
    }

    /**
     * 收集 GIS source 的 `dataConfig.commonApi.commonApiId` 中引用到的公共 API id。
     * 仅统计 `geojson + dataConfig` 这种真正会进入运行时拉数链路的 source。
     */
    public static collectGisCommonApiIds(projectData: IDesignerManager) {
        const ids = new Set<string>();

        ProjectUtil.walkProjectDataConfigs(projectData, (config, context) => {
            if (!ProjectUtil.isGisDataConfigContext(context)) {
                return;
            }
            if (!ProjectUtil.isObjectRecord(context.parent)) {
                return;
            }
            const sourceConfig = context.parent as Record<string, any>;
            if (sourceConfig.sourceType !== 'geojson' || sourceConfig.dataMode !== 'dataConfig') {
                return;
            }
            if (config.sourceType !== 'commonApi') {
                return;
            }
            const commonApiId = config.commonApi?.commonApiId?.trim();
            if (commonApiId) {
                ids.add(commonApiId);
            }
        });

        return Array.from(ids);
    }

    /**
     * 收集 GIS source 的 `dataConfig.database.targetDb` 中引用到的数据库数据源 id。
     * 仅统计 `geojson + dataConfig` 这种真正会进入运行时拉数链路的 source。
     */
    public static collectGisDatabaseIds(projectData: IDesignerManager) {
        const ids = new Set<string>();

        ProjectUtil.walkProjectDataConfigs(projectData, (config, context) => {
            if (!ProjectUtil.isGisDataConfigContext(context)) {
                return;
            }
            if (!ProjectUtil.isObjectRecord(context.parent)) {
                return;
            }
            const sourceConfig = context.parent as Record<string, any>;
            if (sourceConfig.sourceType !== 'geojson' || sourceConfig.dataMode !== 'dataConfig') {
                return;
            }
            if (config.sourceType !== 'database') {
                return;
            }
            const targetDb = config.database?.targetDb?.trim();
            if (targetDb) {
                ids.add(targetDb);
            }
        });

        return Array.from(ids);
    }

    /**
     * 汇总项目内所有场景引用到的公共 API id，统一用于导出与风险提示。
     */
    public static collectReferencedCommonApiIds(projectData: IDesignerManager) {
        return Array.from(new Set([
            ...ProjectUtil.collectComponentCommonApiIds(projectData),
            ...ProjectUtil.collectGlobalVariableCommonApiIds(projectData),
            ...ProjectUtil.collectGisCommonApiIds(projectData),
        ]));
    }

    /**
     * 汇总项目内所有场景引用到的数据库数据源 id，统一用于导出与风险提示。
     */
    public static collectReferencedDatabaseIds(projectData: IDesignerManager) {
        return Array.from(new Set([
            ...ProjectUtil.collectComponentDatabaseIds(projectData),
            ...ProjectUtil.collectGlobalVariableDatabaseIds(projectData),
            ...ProjectUtil.collectGisDatabaseIds(projectData),
        ]));
    }

    /**
     * 计算单个项目 JSON 内的静态资源依赖。
     * 该扫描会递归进入循环容器中的嵌套 managerData。
     */
    private static collectStaticProjectDependencies(projectData: IDesignerManager) {
        const fonts = new Set<string>();
        const images = new Set<string>();
        const components = new Set<string>();
        const videos = new Set<string>();
        const models = new Set<string>();

        const collectDeps = (data: IDesignerManager) => {
            if (!data)
                return;

            collectFontFamilies(fonts, data);

            Object.values(data?.layerManager?.elemConfigs ?? {}).forEach((item) => {
                if (!item || !item.base) return;

                if (item.base.type === "BaseImage") {
                    ProjectUtil.collectImageDependency(images, item.style?.localUrl);
                    ProjectUtil.collectImageDependency(images, item.style?.onLineUrl);
                    if (item.data?.sourceType === 'static') {
                        ProjectUtil.collectImageDependency(images, item.data.staticData?.value);
                        ProjectUtil.collectImageDependency(images, item.data.value);
                    }
                }

                if (item.base.type === "BaseVideo") {
                    ProjectUtil.collectImageDependency(images, item.style?.poster);
                    const src = item.style?.src;
                    if (typeof src === 'string') {
                        if (src.startsWith('http://asset.localhost/') || src.startsWith('asset://localhost/')) {
                            const filename = ProjectUtil.extractAfterMarker(src, '/static/videos/');
                            if (filename) videos.add(filename);
                        } else if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:') && !src.startsWith('blob:')) {
                            const filename = ProjectUtil.extractAfterMarker(src, '/static/videos/');
                            if (filename) videos.add(filename);
                        }
                    }
                }

                if (item.base.type === "ThreeModel") {
                    const url = item.style?.source?.url;
                    if (typeof url === 'string') {
                        if (url.startsWith('http://asset.localhost/') || url.startsWith('asset://localhost/')) {
                            const key = ProjectUtil.extractAfterMarker(url, '/static/models/');
                            if (key) models.add(key);
                        } else if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:') && !url.startsWith('blob:')) {
                            const key = ProjectUtil.extractAfterMarker(url, '/static/models/');
                            if (key) models.add(key);
                        }
                    }
                }

                const definition = window.DATAVISOOL_ENV.definitions && window.DATAVISOOL_ENV.definitions[item.base.type];

                if (definition && definition.getBaseInfo().source === "remote") {
                    const remoteScript = window.DATAVISOOL_ENV.remoteScripts?.[item.base.type];
                    if (remoteScript) {
                        const script = remoteScript.script;
                        const key = ProjectUtil.extractAfterMarker(script, '/static/components/');
                        if (key) components.add(key);
                    }
                }

                if (item.base.type === "LoopContainer") {
                    const managerData = item.managerData;
                    if (managerData) {
                        collectDeps(managerData);
                    }
                }
            });
        };

        collectDeps(projectData);

        return {
            fonts: Array.from(fonts),
            images: Array.from(images),
            videos: Array.from(videos),
            models: Array.from(models),
            components: Array.from(components),
        };
    }

    /**
     * 基于任意项目数据计算单项目导出依赖。
     * 该方法不依赖全局 projectId/title，可被多项目导出闭包直接复用。
     */
    public static calculateProjectDependencyByProject(
        projectId: string,
        projectName: string,
        projectData: IDesignerManager
    ): ProjectDependencyPayload {
        ProjectUtil.validateProjectResourcePaths(projectData);
        const staticDeps = ProjectUtil.collectStaticProjectDependencies(projectData);
        return {
            id: projectId,
            name: projectName,
            ...staticDeps,
            commonApiIds: ProjectUtil.collectReferencedCommonApiIds(projectData),
            databaseIds: ProjectUtil.collectReferencedDatabaseIds(projectData),
            projectJson: JSON.stringify(projectData),
        };
    }

    private static requireCurrentStaticPath(value: unknown): void {
        if (typeof value === 'string' && /^static\/(images|videos|models|components|font)\//.test(value))
            throw new Error('静态资源地址必须以 /static/ 开头，请先修正项目中的资源地址');
    }

    private static validateProjectResourcePaths(projectData: IDesignerManager): void {
        const inspectImageValue = (value: unknown, depth = 0): void => {
            if (depth > 2 || value == null) return;
            if (typeof value === 'string') ProjectUtil.requireCurrentStaticPath(value);
            else if (ProjectUtil.isObjectRecord(value))
                ['url', 'src', 'data', 'onLineUrl', 'localUrl', 'value'].forEach((key) => {
                    if (key in value) inspectImageValue(value[key], depth + 1);
                });
        };
        const seen = new WeakSet<object>();
        const walk = (value: unknown): void => {
            if (value == null || typeof value !== 'object' || seen.has(value)) return;
            seen.add(value);
            if (Array.isArray(value)) { value.forEach(walk); return; }
            const item = value as Record<string, any>;
            const style = item.style;
            if (ProjectUtil.isObjectRecord(style)) {
                if (item.base?.type === 'BaseImage') {
                    ProjectUtil.requireCurrentStaticPath(style.localUrl);
                    ProjectUtil.requireCurrentStaticPath(style.onLineUrl);
                } else if (item.base?.type === 'BaseVideo') {
                    ProjectUtil.requireCurrentStaticPath(style.src);
                    ProjectUtil.requireCurrentStaticPath(style.poster);
                } else if (item.base?.type === 'ThreeModel' && ProjectUtil.isObjectRecord(style.source)) {
                    ProjectUtil.requireCurrentStaticPath(style.source.url);
                }
            }
            if (item.base?.type === 'BaseImage' && item.data?.sourceType === 'static') {
                inspectImageValue(item.data.value);
                if (ProjectUtil.isObjectRecord(item.data.staticData)) inspectImageValue(item.data.staticData.value);
            }
            Object.values(item).forEach(walk);
        };
        walk(projectData);
    }

    /**
     * 计算入口项目的完整项目图导出依赖。
     * 返回值同时包含：
     * - 每个项目各自的依赖与原始 JSON；
     * - 全图合并去重后的资源 / 公共数据源清单。
     */
    public static async calculateProjectGraphDependency(
        entryProjectId: string,
        entryProjectData: IDesignerManager,
        options: ProjectGraphBuildOptions & {entryProjectName?: string} = {}
    ): Promise<ProjectGraphDependencyPayload> {
        const normalizedEntryId = ProjectUtil.normalizeProjectId(entryProjectId);
        if (!normalizedEntryId) {
            throw new Error('项目 id 不能为空');
        }

        const baseEntryMeta = await (options.loadProjectMeta ?? ((id: string) => baseApi.getProjectMeta(id)))(normalizedEntryId);
        if (!baseEntryMeta) {
            throw new Error(`项目不存在：${normalizedEntryId}`);
        }

        const entryProjectMeta: IProjectMeta = {
            ...baseEntryMeta,
            id: normalizedEntryId,
            name: options.entryProjectName ?? baseEntryMeta.name,
            data: entryProjectData,
        };

        const graph = await ProjectUtil.buildProjectGraph(normalizedEntryId, {
            loadProjectMeta: async (id: string) => {
                const normalizedId = ProjectUtil.normalizeProjectId(id);
                if (normalizedId === normalizedEntryId) {
                    return entryProjectMeta;
                }
                return (options.loadProjectMeta ?? ((projectId: string) => baseApi.getProjectMeta(projectId)))(normalizedId);
            }
        });

        const fonts = new Set<string>();
        const images = new Set<string>();
        const videos = new Set<string>();
        const models = new Set<string>();
        const components = new Set<string>();
        const commonApiIds = new Set<string>();
        const databaseIds = new Set<string>();

        const projects = graph.nodes.map((node) => {
            const dependency = ProjectUtil.calculateProjectDependencyByProject(node.id, node.name, node.data);
            dependency.fonts.forEach((item) => fonts.add(item));
            dependency.images.forEach((item) => images.add(item));
            dependency.videos.forEach((item) => videos.add(item));
            dependency.models.forEach((item) => models.add(item));
            dependency.components.forEach((item) => components.add(item));
            dependency.commonApiIds.forEach((item) => commonApiIds.add(item));
            dependency.databaseIds.forEach((item) => databaseIds.add(item));
            return {
                ...dependency,
                sourceProjectId: node.id,
                sourcePid: node.pid,
                isEntry: node.isEntry,
            };
        });

        return {
            id: entryProjectMeta.id,
            name: entryProjectMeta.name,
            fonts: Array.from(fonts),
            images: Array.from(images),
            videos: Array.from(videos),
            models: Array.from(models),
            components: Array.from(components),
            commonApiIds: Array.from(commonApiIds),
            databaseIds: Array.from(databaseIds),
            projects,
        };
    }

    /**
     * 计算导出项目所需的依赖清单。
     * 结果既包含静态资源依赖，也包含运行时数据源依赖，供导出接口直接打包使用。
     */
    public static calculateProjectDependency(projectData: IDesignerManager) {
        return ProjectUtil.calculateProjectDependencyByProject(
            window.DATAVISOOL_ENV.projectId,
            document.title,
            projectData
        );
    }

    /**
     * 递归计算项目发布所需依赖项。
     * 主要用于大屏引用场景，把被引用项目的静态资源与项目 JSON 一并纳入发布依赖。
     */
    public static async cyclicBuildReleaseDependencies(project: IProject, dependencies: Array<any>) {
        const completed = new Set(dependencies.map(item => ProjectUtil.normalizeProjectId(item?.id)).filter(Boolean));
        const visiting = new Set<string>();
        const pending: Array<any> = [];
        const visit = async (current: IProject) => {
            const id = ProjectUtil.normalizeProjectId(current.id);
            if (!id || !current.data) throw new Error(`发布项目数据不完整：${id || '未知项目'}`);
            if (visiting.has(id)) throw new Error(`大屏引用存在循环：${id}`);
            if (completed.has(id)) return;
            visiting.add(id);
            const releaseData = cloneDeep(current.data);
            const screenIds = ProjectUtil.collectScreenReferenceIds(releaseData);
            for (const screenId of screenIds) {
                if (visiting.has(screenId)) throw new Error(`大屏引用存在循环：${screenId}`);
                if (completed.has(screenId)) continue;
                const child = await baseApi.getProjectData(screenId);
                if (!child || ProjectUtil.normalizeProjectId(child.id) !== screenId || !child.data)
                    throw new Error(`引用的大屏不存在或无法读取：${screenId}`);
                await visit(child);
            }
            const seen = new WeakSet<object>();
            const replaceReferences = (value: unknown) => {
                if (!value || typeof value !== 'object' || seen.has(value)) return;
                seen.add(value);
                if (Array.isArray(value)) {
                    value.forEach(replaceReferences);
                    return;
                }
                const item = value as Record<string, any>;
                if (item.base?.type === 'ScreenReference' && item.style?.screenId) {
                    const screenId = ProjectUtil.normalizeProjectId(item.style.screenId);
                    if (screenId) item.style.screenId = ProjectUtil.buildScreenIdPlaceholder(screenId);
                }
                Object.values(item).forEach(replaceReferences);
            };
            replaceReferences(releaseData);
            pending.push(ProjectUtil.calculateProjectDependencyByProject(id, current.name ?? id, releaseData));
            visiting.delete(id);
            completed.add(id);
        };
        await visit(project);
        dependencies.push(...pending);
    }


    /**
     * 序列化项目数据。
     * 会把函数配置转成带前缀的字符串，便于后续安全反序列化。
     */
    public static serializeProjectData(proData: any) {
        return JSON.stringify(proData, (_, value) => {
            if (typeof value === 'function')
                return CONFIG_FUNC_PREFIX + value.toString();
            return value;
        })
    }

    /**
     * 反序列化项目数据。
     * 当值命中特定前缀时，会把字符串恢复成函数对象。
     */
    public static deserializeProjectData(jsonStr: string) {
        return JSON.parse(jsonStr, (key, value) => {
            if (typeof value === 'string') {
                if (value.startsWith(CONFIG_FUNC_PREFIX)) {
                    value = value.replace(CONFIG_FUNC_PREFIX, '');
                    try {
                        return eval('(' + value + ')');
                    } catch (e) {
                        console.warn(`反序列化函数失败：${key}`, e);
                    }
                }
            }
            return value;
        })
    }


    /**
     * 在发布时候构建大屏组件的占位符，便于后端直接替换.
     * 后端解析时，占位符的标识或逻辑应该与此处保持一致。
     */
    public static buildScreenIdPlaceholder(screenId: string) {
        if (!screenId) {
            console.log('大屏引用为空，无法替换')
            return null;
        }
        return `__SCREEN_${screenId}__`;
    }
}
