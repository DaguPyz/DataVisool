/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {ComponentDocumentInfo} from "@/designer/ai-driven/ComponentAiSelectionDocRegistry.ts";
/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractDesignerDefinition from "@/framework/core/AbstractDesignerDefinition.ts";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {AbstractBPNodeController} from "@/designer/blueprint/node/core/AbstractBPNodeController.ts";
import {DesignerMode, DesignerScene, IDesignerManager} from "@datavisool/sdk/types";
import baseApi from "@/api/engineering/BaseApi.ts";
import {ISelectOption} from "@datavisool/ui";
import {componentCategorize, componentSubCategorize} from "@/designer/left/compoent-lib/ComponentCategorize.ts";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import {action, makeObservable, observable} from "mobx";
import EventUtil from "@/designer/blueprint/util/EventUtil.ts";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";

export default class DesignerLoader {

    constructor(mode: DesignerMode) {
        this.mode = mode;
        makeObservable(this, {
            loaded: observable,
            setLoaded: action,
        });
    }


    //自定义组件信息映射
    public static definitionMap: Record<string, AbstractDesignerDefinition> = {};
    //蓝图节点控制器模板
    public static bpControllerMap: Record<string, ClazzTemplate<AbstractBPNodeController>> = {};
    //服务器组件信息映射
    public static remoteScriptMap: Record<string, { id: string, script: string, documentInfo?: ComponentDocumentInfo }> = {};
    // Component bundles register through one global slot and map resource bases by filename.
    private static remoteScriptQueue: Promise<void> = Promise.resolve();
    //设计器所处模式：编辑、预览、发布
    public mode: DesignerMode = DesignerMode.EDIT;
    //设计器是否已加载完成
    public loaded: boolean = false;
    //字体列表
    public fonts: ISelectOption[] = [];
    //当前loader绑定的项目管理器
    public designerManager: DesignerManager = new DesignerManager(DesignerScene.DEFAULT);
    //项目基础信息
    public projectInfo: { id?: string, name?: string } = {};

    /**
     * 当前加载轮次，用于取消过期的异步加载结果。
     */
    protected loadToken = 0;

    public setLoaded = (loaded: boolean) => this.loaded = loaded;

    protected beginLoadSession = (): number => {
        this.loadToken += 1;
        return this.loadToken;
    }

    protected isLoadSessionActive = (token: number): boolean => token === this.loadToken;

    public cancelLoad() {
        this.beginLoadSession();
        this.setLoaded(false);
    }

    /**
     * 加载服务器组件
     */
    public loadRemoteComponents = async () => {
        const remoteComponentList = await baseApi.getAllRemoteComponents();
        if (remoteComponentList.length === 0) return;

        const results = await Promise.allSettled(
            remoteComponentList.map(script => {
                    script.id = this.getRemoteScriptId(script.url);
                    return this.loadScript(script).catch(err => {
                        console.error(`加载远程组件失败 [${script.id}]:`, err);
                        throw {script, err}; // 抛出自定义对象用于后续识别
                    })
                }
            )
        );

        const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
        if (failed.length > 0)
            console.warn(`有 ${failed.length} 个远程组件加载失败：`, failed.map(f => f.reason.script?.url));
    };


    /**
     * 加载脚本(服务器组件的脚本)
     * @param script
     */
    public loadScript = (script: { id: string; url: string; documentInfo?: ComponentDocumentInfo }): Promise<null> => {
        const result = DesignerLoader.remoteScriptQueue.then(() => this.loadScriptNow(script));
        // A failed component must not prevent subsequent components from loading.
        DesignerLoader.remoteScriptQueue = result.then(() => undefined, () => undefined);
        return result;
    };

    private loadScriptNow = (script: { id: string; url: string; documentInfo?: ComponentDocumentInfo }): Promise<null> => {
        return new Promise((resolve, reject) => {
            const clearRemoteComponentTemp = () => {
                window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = undefined;
            };

            if (!script?.url) {
                clearRemoteComponentTemp();
                return reject(new Error('Script URL is required.'));
            }
            // 防止重复加载
            if (Array.from(document.querySelectorAll('script[data-id]'))
                .some((item) => item.getAttribute('data-id') === script.id))
                return resolve(null);

            clearRemoteComponentTemp();

            const scriptTag = document.createElement('script');
            const loadableUrl = AssetUrlUtil.toLoadableUrl(script.url);
            const entryFileName = this.getRemoteScriptEntryFileName(loadableUrl || script.url);
            const baseUrl = this.getRemoteScriptBaseUrl(loadableUrl);
            window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__ ||= {};
            if (entryFileName && baseUrl) {
                window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__[entryFileName] = baseUrl;
            }

            scriptTag.src = loadableUrl;
            scriptTag.async = true;
            scriptTag.type = 'text/javascript';
            scriptTag.setAttribute('data-id', script.id);
            if (baseUrl) {
                scriptTag.setAttribute('data-datavisool-remote-base-url', baseUrl);
            }

            const rejectWithCleanup = (err: Error) => {
                scriptTag.remove();
                clearRemoteComponentTemp();
                reject(err);
            };

            // 成功加载
            scriptTag.onload = () => {
                try {
                    const Definition = window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ as ClazzTemplate<AbstractDesignerDefinition>;
                    clearRemoteComponentTemp();
                    if (!Definition)
                        return rejectWithCleanup(new Error('Remote component not found on window.'));

                    let componentKey = '';
                    this.initDefinition(Definition, (definition, initialBaseInfo) => {
                        const baseInfo = initialBaseInfo ?? definition.getBaseInfo();
                        if (script.documentInfo && script.documentInfo.componentType !== baseInfo.compKey)
                            throw new Error('组件包声明类型与实际 Definition 不一致');
                        if (!baseInfo.compKey) throw new Error('组件缺少类型标识');
                        componentKey = baseInfo.compKey;
                    });
                    if (!componentKey) throw new Error('组件缺少类型标识');
                    DesignerLoader.remoteScriptMap[componentKey] = {
                        id: script.id,
                        script: script.url,
                        documentInfo: script.documentInfo
                    };
                    resolve(null);
                } catch (err) {
                    console.error('Error initializing definition: ' + (err as Error).message);
                    rejectWithCleanup(new Error('Error initializing definition: ' + (err as Error).message));
                }
            };

            // 加载失败
            scriptTag.onerror = () => {
                console.warn(`Failed to load script: ${script.url}`)
                rejectWithCleanup(new Error('Failed to load script: ' + script.url));
            };

            document.body.appendChild(scriptTag);
        });
    };

    protected getRemoteScriptId = (url: string): string => {
        const normalized = AssetUrlUtil.toLoadableUrl(url).replace(/\\/g, "/").split("#")[0].split("?")[0];
        try {
            return new URL(normalized, document.baseURI).href;
        } catch {
            return normalized;
        }
    };

    private getRemoteScriptEntryFileName = (url: string): string => {
        const path = url.split("#")[0].split("?")[0];
        const decoded = AssetUrlUtil.isAssetLikeUrl(path) ? AssetUrlUtil.decodeAssetLikeUrl(path) : path;
        const normalized = decoded.replace(/\\/g, "/");
        return normalized.substring(normalized.lastIndexOf("/") + 1);
    };

    private getRemoteScriptBaseUrl = (url: string): string => {
        if (!url) return "";
        url = url.split("#")[0].split("?")[0];

        if (AssetUrlUtil.isAssetLikeUrl(url)) {
            const lower = url.toLowerCase();
            const encodedSlashIndex = Math.max(lower.lastIndexOf("%2f"), lower.lastIndexOf("%5c"));
            if (encodedSlashIndex >= 0)
                return url.slice(0, encodedSlashIndex + 3);
        }

        return url.lastIndexOf("/") >= 0 ? url.slice(0, url.lastIndexOf("/") + 1) : "";
    };


    /**
     * 加载服务器字体
     */
    public loadFonts() {
        AuthFetchUtil.get<any>("/api/font/list").then(response => {
            if (response !== null) {
                const options: ISelectOption[] = [{label: "默认字体", value: ""}];
                response.forEach((item: any) => {
                    const {name, url} = item;
                    options.push({label: name, value: name});
                    const fontUrl = AssetUrlUtil.toLoadableUrl(url);
                    const font = new FontFace(name, `url(${fontUrl})`);
                    font.load().then((loadedFont) => {
                        document.fonts.add(loadedFont);
                    }).catch((error) => {
                        console.error(`加载字体 "${name}" 失败: `, error);
                    });
                })
                this.fonts.push(...options);
            } else {
                console.warn("获取服务器字体失败");
            }
        })
    }

    /**
     * 加载动态脚本
     */
    public async loadDynamicScript(projectId?: string): Promise<void> {
        return AuthFetchUtil.get<any>(`/api/dynamicScript/list?projectId=${projectId}`, {})
            .then(response => {
                if (response === null || !Array.isArray(response)) {
                    console.warn("获取动态脚本列表失败");
                    return;
                }

                const loadScript = (url: string) => {
                    return new Promise<void>((resolve) => {
                        const scriptTag = document.createElement('script');
                        scriptTag.src = AssetUrlUtil.toLoadableUrl(url);
                        scriptTag.async = true;
                        scriptTag.onload = () => resolve();
                        scriptTag.onerror = () => {
                            console.error(`动态脚本加载失败: ${url}`);
                            resolve();
                        };
                        document.body.appendChild(scriptTag);
                    });
                };

                const promises = response.map((script: any) => loadScript(script?.url));
                return Promise.all(promises).then(() => {
                    return;
                });
            })
            .catch(err => {
                console.error("动态脚本加载请求失败:", err);
                return;
            });
    }


    /**
     * 初始化各组件的definition定义
     */
    public initDefinition = (Definition: ClazzTemplate<AbstractDesignerDefinition>, initAfter?: (ins: AbstractDesignerDefinition, baseInfo?: ReturnType<AbstractDesignerDefinition['getBaseInfo']>) => void) => {
        if (!Definition) return;
        const definition = new Definition();
        if (!definition) return;
        // Evaluate component metadata before publishing anything to the registry.
        const baseInfo = typeof definition.getBaseInfo === "function" ? definition.getBaseInfo() : undefined;
        const categorize = typeof definition.getCategorize === "function" ? definition.getCategorize() : null;
        const subCategorize = typeof definition.getSubCategorize === "function" ? definition.getSubCategorize() : null;
        initAfter?.(definition, baseInfo);
        const compKey = baseInfo?.compKey;
        if (compKey) DesignerLoader.definitionMap[compKey] = definition;
        //获取自定义分类
        if (categorize) {
            if (!categorize.icon)
                console.error("自定义组件的分类必须指定icon");
            else if (!componentCategorize.some(item => item.key === categorize.key))
                componentCategorize.push(categorize);
        }
        //获取自定义子类型
        if (subCategorize) {
            if (!subCategorize.parentKey)
                console.error("自定义组件的子类型必须指定parentKey");
            else if (!componentSubCategorize.some(item => item.key === subCategorize.key && item.parentKey === subCategorize.parentKey))
                componentSubCategorize.push(subCategorize);
        }
    }

    /**
     * 扫描集成的标准组件
     */
    public scanComponents(): void {
        const glob = import.meta.glob('/src/comps/**/*.ts', {eager: true}) as Record<string, any>;
        for (const key of Object.keys(glob)) {
            const Definition = glob[key]?.default;
            // eslint-disable-next-line no-prototype-builtins
            if (Definition && AbstractDesignerDefinition.isPrototypeOf(Definition)) {
                this.initDefinition(Definition);
            }
        }
    }

    /**
     * 扫描蓝图节点控制器模板
     */
    public scanBPController(): void {
        const glob = import.meta.glob('/src/designer/blueprint/node/core/impl/**/*.ts', {eager: true}) as Record<string, any>;
        for (const key of Object.keys(glob)) {
            const Clazz = glob[key]?.default as ClazzTemplate<AbstractBPNodeController>;
            // eslint-disable-next-line no-prototype-builtins
            if (Clazz && AbstractBPNodeController.isPrototypeOf(Clazz)) {
                const fileName = key.split('/').pop() ?? '';
                const controllerKey = fileName.replace(/\.tsx?$/, '').replace(/Controller$/, '');
                if (!controllerKey) {
                    console.warn(`[DesignerLoader] skip blueprint controller registration: invalid file name "${key}"`);
                    continue;
                }
                DesignerLoader.bpControllerMap[controllerKey] = Clazz;
            }
        }
    }

    /**
     * 获取项目数据
     * @param id 项目id
     */
    public getProjectData(id: string): Promise<IDesignerManager | null> {
        throw new Error(`Please implement the method in a subclass: ${id}`);
    }

    /**
     * 初始化项目运行环境
     * @param projectId 项目id
     * @param manager 项目管理器
     */
    public initializeRuntimeEnv(projectId: string, manager: DesignerManager): void {
        throw new Error(`Please implement the method in a subclass: ${projectId} ===> ${manager}`);
    }

    /**
     * 触发组件加载完成事件、蓝图全局节点加载完成事件、蓝图定时器节点定时出发事件
     */
    public triggerGlobalEvent = (manager: DesignerManager) => {
        if (this.mode === DesignerMode.EDIT)
            return;
        EventUtil.triggerGlobalEvent(manager);
    }

    public async initDesignerManager(designerManager?: IDesignerManager) {
        if (!designerManager)
            throw new Error('未加载到项目数据...', designerManager);
        this.designerManager.init(designerManager, this.mode);
    }

    /**
     * 加载整个设计器的所有资源，模板方法模式
     */
    public async load(id: string) {
        const loadToken = this.beginLoadSession();
        this.setLoaded(false);
        //加载服务器字体
        this.loadFonts();
        if (!this.isLoadSessionActive(loadToken))
            return;
        //加载三方扩展脚本
        await this.loadDynamicScript(id);
        if (!this.isLoadSessionActive(loadToken))
            return;
        //加载服务器组件
        await this.loadRemoteComponents();
        if (!this.isLoadSessionActive(loadToken))
            return;
        //扫描标准组件
        this.scanComponents();
        if (!this.isLoadSessionActive(loadToken))
            return;
        //扫描蓝图
        this.scanBPController();
        if (!this.isLoadSessionActive(loadToken))
            return;
        //加载数据
        const projectData = await this.getProjectData(id);
        if (!this.isLoadSessionActive(loadToken))
            return;
        //创建designerManager
        await this.initDesignerManager(projectData ?? undefined)
        if (!this.isLoadSessionActive(loadToken))
            return;
        //初始化运行环境
        this.initializeRuntimeEnv(id, this.designerManager);
        if (!this.isLoadSessionActive(loadToken))
            return;
        //触发全局事件
        this.triggerGlobalEvent(this.designerManager);
    }

    /**
     * 精简加载，适用于大屏应用场景下的加载过程，只加载必要字段，
     * 1. 不需要重复扫描标准组件
     * 2. 不需要重复扫描蓝图
     * 2. 不做环境变量的初始化操作
     * @param id 项目id
     */
    public async simpleLoad(id: string): Promise<void> {
        const loadToken = this.beginLoadSession();
        this.setLoaded(false);
        //加载服务器字体
        this.loadFonts();
        if (!this.isLoadSessionActive(loadToken))
            return;
        //加载三方扩展脚本
        await this.loadDynamicScript(id);
        if (!this.isLoadSessionActive(loadToken))
            return;
        //加载服务器组件
        await this.loadRemoteComponents();
        if (!this.isLoadSessionActive(loadToken))
            return;
        //扫描标准组件
        this.scanComponents();
        if (!this.isLoadSessionActive(loadToken))
            return;
        //加载数据
        const projectData = await this.getProjectData(id);
        if (!this.isLoadSessionActive(loadToken))
            return;
        //创建designerManager
        await this.initDesignerManager(projectData ?? undefined)
        if (!this.isLoadSessionActive(loadToken))
            return;
        //触发全局事件
        this.triggerGlobalEvent(this.designerManager);
    }
}
