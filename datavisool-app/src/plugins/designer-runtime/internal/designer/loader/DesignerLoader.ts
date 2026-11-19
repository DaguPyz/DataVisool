/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {ComponentDocumentInfo} from "@/shared/components/ComponentDocumentationTypes.ts";
/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractDesignerDefinition from "@/framework/core/AbstractDesignerDefinition.ts";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {DesignerMode, DesignerScene, IDesignerManager} from "@datavisool/sdk/types";
import baseApi from "@/api/engineering/BaseApi.ts";
import {ISelectOption} from "@datavisool/ui";
import DesignerManager from "@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts";
import {action, makeObservable, observable} from "mobx";
import EventUtil from "@/plugins/designer-runtime/internal/designer/blueprint/util/EventUtil.ts";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";
import GroupLayerDefinition from '@/plugins/designer-runtime/internal/builtin/group-layer/GroupLayerDefinition.ts';
import LoopContainerDefinition from '@/plugins/designer-runtime/internal/builtin/loop-container/LoopContainerDefinition.ts';
import ScreenReferenceDefinition from '@/plugins/designer-runtime/internal/builtin/screen-reference/ScreenReferenceDefinition.ts';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import {clearRemoteComponentRegistration, serializeRemoteComponentRegistration} from '@/plugins/designer-runtime/internal/legacy-global/RemoteComponentRegistrationBridge.ts';

export default class DesignerLoader {
    constructor(mode: DesignerMode, public readonly runtimeContext = new DesignerRuntimeContext()) {
        this.mode = mode;
        this.designerManager = new DesignerManager(DesignerScene.DEFAULT, runtimeContext);
        makeObservable(this, {
            loaded: observable,
            setLoaded: action,
        });
    }


    //设计器所处模式：编辑、预览、发布
    public mode: DesignerMode = DesignerMode.EDIT;
    //设计器是否已加载完成
    public loaded: boolean = false;
    //字体列表
    public fonts: ISelectOption[] = [];
    //当前loader绑定的项目管理器
    public designerManager: DesignerManager;
    //项目基础信息
    public projectInfo: { id?: string, name?: string } = {};

    /**
     * 当前加载轮次，用于取消过期的异步加载结果。
     */
    protected loadToken = 0;
    private loadController?: AbortController;
    private readonly dynamicScriptTags = new Set<HTMLScriptElement>();
    private readonly remoteScriptCancelers = new Set<() => void>();
    private readonly remoteBaseUrlOwner = {};
    private readonly activeRemoteScriptIds = new Set<string>();
    private readonly registeredFonts = new Set<FontFace>();

    public setLoaded = (loaded: boolean) => this.loaded = loaded;

    protected beginLoadSession = (): number => {
        this.loadToken += 1;
        const errors: unknown[] = [];
        try { this.loadController?.abort(); } catch (error) { errors.push(error); }
        try { this.releaseLoadResources(); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'Failed to replace the previous designer load session.');
        this.loadController = new AbortController();
        return this.loadToken;
    }

    protected get loadSignal() {
        return this.loadController?.signal;
    }

    protected isLoadSessionActive = (token: number): boolean => token === this.loadToken;

    public cancelLoad() {
        this.loadToken += 1;
        const errors: unknown[] = [];
        try { this.loadController?.abort(); } catch (error) { errors.push(error); }
        this.loadController = undefined;
        try { this.setLoaded(false); } catch (error) { errors.push(error); }
        try { this.releaseLoadResources(); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'Failed to release designer load resources.');
    }

    private releaseLoadResources(): void {
        const errors: unknown[] = [];
        [...this.remoteScriptCancelers].forEach(cancel => {
            try { cancel(); } catch (error) { errors.push(error); }
        });
        this.remoteScriptCancelers.clear();
        this.registeredFonts.forEach(font => {
            try { document.fonts.delete(font); } catch (error) { errors.push(error); }
        });
        this.registeredFonts.clear();
        this.dynamicScriptTags.forEach(tag => {
            try { tag.onload = null; } catch (error) { errors.push(error); }
            try { tag.onerror = null; } catch (error) { errors.push(error); }
            try { tag.remove(); } catch (error) { errors.push(error); }
        });
        this.dynamicScriptTags.clear();
        try { this.fonts.splice(0, this.fonts.length); } catch (error) { errors.push(error); }
        try { this.runtimeContext.releaseRemoteBaseUrls(this.remoteBaseUrlOwner); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'Failed to release individual designer load resources.');
    }

    /**
     * 加载服务器组件
     */
    public loadRemoteComponents = async () => {
        const signal = this.loadSignal;
        const remoteComponentList = await baseApi.getAllRemoteComponents({signal});
        if (signal?.aborted || remoteComponentList.length === 0) return;

        const results = await Promise.allSettled(
            remoteComponentList.map(script => {
                    script.id = this.getRemoteScriptId(script.url);
                    return this.loadScript(script, signal).catch(err => {
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
    public loadScript = (script: { id: string; url: string; documentInfo?: ComponentDocumentInfo }, signal?: AbortSignal): Promise<null> => {
        return serializeRemoteComponentRegistration(token => signal?.aborted ? Promise.resolve(null) : this.loadScriptNow(script, signal, token));
    };

    private loadScriptNow = (script: { id: string; url: string; documentInfo?: ComponentDocumentInfo }, signal: AbortSignal | undefined, token: object): Promise<null> => {
        return new Promise((resolve, reject) => {
            let settled = false;
            const clearRemoteComponentTemp = () => {
                clearRemoteComponentRegistration(token);
            };

            if (!script?.url) {
                clearRemoteComponentTemp();
                return reject(new Error('Script URL is required.'));
            }
            if (signal?.aborted) return resolve(null);
            // 防止重复加载
            if (Array.from(document.querySelectorAll('script[data-id]'))
                .some((item) => item.getAttribute('data-id') === script.id))
                return resolve(null);

            clearRemoteComponentTemp();

            const scriptTag = document.createElement('script');
            const loadableUrl = AssetUrlUtil.toLoadableUrl(script.url);
            const entryFileName = this.getRemoteScriptEntryFileName(loadableUrl || script.url);
            const baseUrl = this.getRemoteScriptBaseUrl(loadableUrl);
            if (entryFileName && baseUrl) {
                this.runtimeContext.registerRemoteBaseUrl(this.remoteBaseUrlOwner, entryFileName, baseUrl);
            }

            scriptTag.src = loadableUrl;
            scriptTag.async = true;
            scriptTag.type = 'text/javascript';
            scriptTag.setAttribute('data-id', script.id);
            this.dynamicScriptTags.add(scriptTag);
            if (baseUrl) {
                scriptTag.setAttribute('data-datavisool-remote-base-url', baseUrl);
            }

            const rejectWithCleanup = (err: Error) => {
                if (settled) return;
                settled = true;
                const cleanupErrors: unknown[] = [];
                try { signal?.removeEventListener('abort', abortLoad); } catch (error) { cleanupErrors.push(error); }
                this.remoteScriptCancelers.delete(abortLoad);
                this.activeRemoteScriptIds.delete(script.id);
                this.dynamicScriptTags.delete(scriptTag);
                try { scriptTag.onload = null; } catch (error) { cleanupErrors.push(error); }
                try { scriptTag.onerror = null; } catch (error) { cleanupErrors.push(error); }
                try { scriptTag.remove(); } catch (error) { cleanupErrors.push(error); }
                try { clearRemoteComponentTemp(); } catch (error) { cleanupErrors.push(error); }
                reject(cleanupErrors.length ? new AggregateError([err, ...cleanupErrors], 'Remote component script cleanup failed.') : err);
            };
            const abortLoad = () => rejectWithCleanup(Object.assign(new Error('Remote component load aborted.'), {name: 'AbortError'}));
            this.remoteScriptCancelers.add(abortLoad);
            signal?.addEventListener('abort', abortLoad, {once: true});

            // 成功加载
            scriptTag.onload = () => {
                if (signal?.aborted) return abortLoad();
                try {
                    const Definition = window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ as ClazzTemplate<AbstractDesignerDefinition>;
                    clearRemoteComponentTemp();
                    this.activeRemoteScriptIds.delete(script.id);
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
                    this.runtimeContext.registry.remoteComponents[componentKey] = {
                        id: script.id,
                        script: script.url,
                        documentInfo: script.documentInfo
                    };
                    signal?.removeEventListener('abort', abortLoad);
                    this.remoteScriptCancelers.delete(abortLoad);
                    settled = true;
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

            this.activeRemoteScriptIds.add(script.id);
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
        const signal = this.loadSignal;
        void AuthFetchUtil.get<any>("/api/font/list", {signal}).then(response => {
            if (signal?.aborted) return;
            if (response !== null) {
                const options: ISelectOption[] = [{label: "默认字体", value: ""}];
                response.forEach((item: any) => {
                    const {name, url} = item;
                    options.push({label: name, value: name});
                    this.registerFont(name, url, signal);
                })
                this.fonts.push(...options);
            } else {
                console.warn("获取服务器字体失败");
            }
        }).catch(error => {
            if (!signal?.aborted) console.error('获取服务器字体失败', error);
        });
    }

    protected registerFont(name: string, url: string, signal = this.loadSignal): void {
        const fontUrl = AssetUrlUtil.toLoadableUrl(url);
        const font = new FontFace(name, `url(${fontUrl})`);
        void font.load().then(loadedFont => {
            if (signal?.aborted) return;
            document.fonts.add(loadedFont);
            this.registeredFonts.add(loadedFont);
        }).catch(error => {
            if (!signal?.aborted) console.error(`加载字体 "${name}" 失败`, error);
        });
    }

    /**
     * 加载动态脚本
     */
    public async loadDynamicScript(projectId?: string): Promise<void> {
        const signal = this.loadSignal;
        try {
            const response = await AuthFetchUtil.get<{url: string}[] | null>(
                `/api/dynamicScript/list?projectId=${projectId}`, {signal},
            );
            if (signal?.aborted) return;
            if (!Array.isArray(response)) {
                console.warn("获取动态脚本列表失败");
                return;
            }
            await Promise.all(response.map(script => this.appendDynamicScript(script?.url)));
        } catch (error) {
            if (!signal?.aborted) console.error("动态脚本加载请求失败:", error);
        }
    }

    protected appendDynamicScript(url: string): Promise<void> {
        const signal = this.loadSignal;
        return new Promise(resolve => {
            const tag = document.createElement('script');
            tag.src = AssetUrlUtil.toLoadableUrl(url);
            tag.async = true;

            const complete = () => {
                tag.onload = null;
                tag.onerror = null;
                signal?.removeEventListener('abort', remove);
                resolve();
            };
            const remove = () => {
                tag.remove();
                this.dynamicScriptTags.delete(tag);
                complete();
            };

            tag.onload = complete;
            tag.onerror = () => {
                console.error(`动态脚本加载失败: ${tag.src}`);
                remove();
            };
            signal?.addEventListener('abort', remove, {once: true});
            this.dynamicScriptTags.add(tag);
            document.body.appendChild(tag);
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
        if (compKey) this.runtimeContext.registry.definitions[compKey] = definition;
        //获取自定义分类
        if (categorize) {
            if (!categorize.icon)
                console.error("自定义组件的分类必须指定icon");
            else if (!this.runtimeContext.registry.categories.some(item => item.key === categorize.key))
                this.runtimeContext.registry.categories.push(categorize);
        }
        //获取自定义子类型
        if (subCategorize) {
            if (!subCategorize.parentKey)
                console.error("自定义组件的子类型必须指定parentKey");
            else if (!this.runtimeContext.registry.subCategories.some(item => item.key === subCategorize.key && item.parentKey === subCategorize.parentKey))
                this.runtimeContext.registry.subCategories.push(subCategorize);
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
        [GroupLayerDefinition, LoopContainerDefinition, ScreenReferenceDefinition].forEach(definition => this.initDefinition(definition));
    }

    /**
     * 扫描蓝图节点控制器模板
     */
    public async scanBPController(loadToken = this.loadToken): Promise<void> {
        const {blueprintControllerConstructors} = await import('@/plugins/designer-runtime/internal/designer/blueprint/node/BlueprintNodeRegistry.ts');
        if (!this.isLoadSessionActive(loadToken))
            return;
        Object.assign(this.runtimeContext.registry.blueprintControllers, blueprintControllerConstructors);
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
        this.designerManager.init(designerManager, this.mode, this.runtimeContext.registry.blueprintControllers);
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
        await this.scanBPController(loadToken);
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
