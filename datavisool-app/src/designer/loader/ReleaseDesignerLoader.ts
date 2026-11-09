/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import DesignerLoader from "./DesignerLoader.ts";
import {DesignerMode, IDesignerManager} from "@datavisool/sdk/types";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import {EncryptResult, HybridCryptoUtil} from "@/util/HybridCryptoUtil.ts";
import FetchUtil from "@/util/FetchUtil.ts";
import ProjectDataCodecUtil from "@/util/ProjectDataCodecUtil.ts";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";

export default class ReleaseDesignerLoader extends DesignerLoader {

    /**
     * 查看项目所需密码
     */
    public pwd: string | null = null;
    public releasePassword: EncryptResult | null = null;

    /**
     * 项目依赖 + 项目数据
     */
    public projectBundle: any = null;

    /**
     * 获取发布模式下项目数据
     * @param id
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getProjectData(id: string): Promise<IDesignerManager | null> {
        if (this.projectBundle) {
            const {projectJson} = this.projectBundle;
            const decoded = ProjectDataCodecUtil.decompressIfNeeded(projectJson);
            const manager = JSON.parse(decoded);
            manager.id = this.projectInfo?.id;
            manager.name = this.projectInfo?.name;
            return manager;
        }
        return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async loadDynamicScript(projectId?: string): Promise<void> {
        const scripts = this.projectBundle?.dynamicScripts ?? [];
        if (!Array.isArray(scripts)) throw new Error('发布项目的动态脚本配置无效');
        const promises = scripts.map((script: any) => {
            return new Promise<void>((resolve) => {
                const scriptTag = document.createElement('script');
                scriptTag.src = AssetUrlUtil.toLoadableUrl(script.value);
                scriptTag.async = true;
                scriptTag.onload = () => resolve();
                scriptTag.onerror = () => {
                    console.error(`动态脚本加载失败: ${scriptTag.src}`);
                    resolve();
                };
                document.body.appendChild(scriptTag);
            })
        })
        return Promise.all(promises).then(() => {
            return;
        });

    }

    loadFonts() {
        if (this.projectBundle?.fonts) {
            this.projectBundle.fonts.forEach((item: any) => {
                const {name, value} = item;
                const fontUrl = AssetUrlUtil.toLoadableUrl(value);
                const font = new FontFace(name, `url(${fontUrl})`);
                font.load().then((loadedFont) => {
                    document.fonts.add(loadedFont);
                }).catch((error) => {
                    console.error(`Failed to load font "${name}":`, error);
                });
            })
        }
    }

    loadRemoteComponents = async () => {
        if (this.projectBundle?.components) {
            // 使用 Promise.all 等待所有脚本加载完毕
            await Promise.all(this.projectBundle?.components.map((item: any) => {
                const {value} = item;
                const scriptUrl = AssetUrlUtil.toLoadableUrl(value);
                const id = this.getRemoteScriptId(scriptUrl);
                return this.loadScript({id, url: scriptUrl})
            }));
        }
    }

    initializeRuntimeEnv(projectId: string, manager: DesignerManager) {
        if (manager) {
            this.mode = DesignerMode.RELEASE;
            //暴露必要的环境到 window
            window.DATAVISOOL_ENV = {
                ...window.DATAVISOOL_ENV,
                projectId,
                mode: DesignerMode.RELEASE,
                releasePassword: this.releasePassword,
                controllers: manager.layerManager.controllers,
                definitions: DesignerLoader.definitionMap,
                currentManager: manager
            }
            this.setLoaded(true);
        } else {
            console.error(`未获取到项目数据==> id:${projectId}, manager: ${manager}`);
        }
    }

    public async load(id: string): Promise<void> {
        const loadToken = this.beginLoadSession();
        this.setLoaded(false);
        this.projectBundle = null;
        this.projectInfo = {};
        this.releasePassword = null;
        let password: EncryptResult | null = null;
        if (this.pwd)
            password = await HybridCryptoUtil.encryptRequest(this.pwd!)
        if (!this.isLoadSessionActive(loadToken)) return;
        this.releasePassword = password;
        const res = await FetchUtil.post<any>("/api/release/getReleaseData", {id, password});
        if (!this.isLoadSessionActive(loadToken)) return;
        if (res !== null) {
            this.projectBundle = JSON.parse(res.dataJson);
            this.projectInfo = {id, name: res.name}
            await super.load(id);
        }
    }

    async simpleLoad(id: string): Promise<void> {
        const loadToken = this.beginLoadSession();
        this.setLoaded(false);
        this.projectBundle = null;
        this.projectInfo = {};
        const res = await FetchUtil.post<any>("/api/release/getReleaseData", {id});
        if (!this.isLoadSessionActive(loadToken)) return;
        if (res == null) throw new Error('未获取到引用的发布项目数据');
        this.projectBundle = JSON.parse(res.dataJson);
        this.projectInfo = {id, name: res.name};
        await super.simpleLoad(id);
    }
}
