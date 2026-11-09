/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {IGlobalVariable} from "@datavisool/sdk/types";
import {DataConfigType} from "@datavisool/sdk/types";
import {DesignerMode} from "@datavisool/sdk/types";
import ComponentDataUpdater from "@/framework/core/tools/ComponentDataUpdater.ts";
import AbstractDesignerController from "@/framework/core/AbstractDesignerController.ts";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import DataUtil from "@/util/DataUtil.ts";
import type DesignerManager from "@/designer/manager/DesignerManager.ts";

type IGvDependency = {
    controllers: Record<string, AbstractDesignerController>
    manager?: DesignerManager;
}

class GlobalVariable {
    /**
     * 全局变量唯一id
     */
    id: string;
    /**
     * 全局变量的key
     */
    key: string;
    /**
     * 值
     */
    value: any;
    /**
     * 触发来源
     */
    triggerSource?: DataConfigType;
    /**
     * 绑定的组件id
     */
    bindTarget: string[];
    /**
     * 修改变量的数据后绑定的组件是否重新渲染
     */
    reRender?: boolean;

    private updater: ComponentDataUpdater[] = [];
    private starterUpdater: ComponentDataUpdater | null = null;
    private dependency: IGvDependency = {controllers: {}};
    private bpExecutor: BPExecutor | null = null;
    private lifecycleVersion = 0;
    private active = false;

    constructor(id: string, key: string, value: any, reRender: boolean, bindTarget?: string[], triggerSource?: DataConfigType) {
        this.id = id;
        this.key = key;
        this.value = value;
        this.reRender = reRender;
        this.bindTarget = bindTarget ?? [];
        this.triggerSource = triggerSource;
    }

    getGlobalVariable = (): IGlobalVariable => {
        return {
            id: this.id,
            key: this.key,
            value: this.value,
            triggerSource: this.triggerSource,
            bindTarget: this.bindTarget,
            reRender: this.reRender
        }
    }

    /**
     * 用于编辑全局变量时的更新操作
     * @param gv
     */
    update = (gv: IGlobalVariable) => {
        if (!gv || !gv.id || gv.id !== this.id)
            return;
        gv.key && (this.key = gv.key);
        if (gv.value !== undefined)
            this.value = gv.value;
        if (gv.reRender != null)
            this.reRender = gv.reRender;
        if (gv.triggerSource) {
            this.triggerSource = gv.triggerSource;
            //如果全局变量取的静态数据的值，更新全局变量配置应该立即更新全局变量的value值。确保静态数据始终为最新
            if (gv.triggerSource?.sourceType === 'static')
                this.value = gv.value !== undefined ? gv.value : DataUtil.getStaticData(gv.triggerSource?.staticData);
        }
    }

    /**
     * 设置全局变量的值
     */
    setValue = (value: any) => {
        this.value = value;
        if (window.DATAVISOOL_ENV.mode !== DesignerMode.EDIT && this.active) {
            const lifecycleVersion = ++this.lifecycleVersion;
            if (this.reRender && this.bindTarget && this.bindTarget.length > 0) {
                const previousUpdaters = this.updater;
                this.updater = [];
                previousUpdaters.forEach(updater => updater.destroy());
                if (this.lifecycleVersion !== lifecycleVersion) return;
                //主动触发组件数据更新
                for (const id of this.bindTarget) {
                    if (this.lifecycleVersion !== lifecycleVersion) break;
                    const controller = this.dependency?.controllers[id];
                    const updater = new ComponentDataUpdater(
                        (data: any) => {
                            if (this.lifecycleVersion !== lifecycleVersion) return;
                            controller?.changeData(data);
                        },
                        () => {
                            console.log("全局变量驱动组件更新失败");
                        }, this.dependency.manager);
                    this.updater.push(updater);
                    updater.run(controller?.getConfig().data, true);
                }
            }
            //主动触发蓝图事件
            if (this.lifecycleVersion === lifecycleVersion)
                this.bpExecutor?.triggerComponentEvent(this.id, "gvDataChange", this.value);
        }
    }

    /**
     * 启动全局变量的配置，如果设置了定时触发的数据源，则启动定时器
     */
    start = (dependency: IGvDependency, bpExecutor: BPExecutor) => {
        // A project reload may start the same variable again. Replace its old
        // subscriptions before installing the new dependency and executor.
        this.stop();
        this.dependency = dependency;
        this.bpExecutor = bpExecutor;
        this.active = true;
        if (this.triggerSource) {
            const starterUpdater = new ComponentDataUpdater(
                (data: any) => {
                    this.setValue(data);
                },
                () => {
                    console.log("全局变量数据更新失败");
                }, dependency.manager);
            this.starterUpdater = starterUpdater;
            starterUpdater.run(this.triggerSource!);
        }
    }

    /**
     * 停止运行的全局变量依赖，停止建立的数据连接（mqtt，websocket）
     */
    stop = () => {
        this.lifecycleVersion += 1;
        this.active = false;
        const updaters = this.updater;
        this.updater = [];
        updaters.forEach(updater => updater.destroy());
        const starterUpdater = this.starterUpdater;
        this.starterUpdater = null;
        starterUpdater?.destroy();
        this.dependency = {controllers: {}};
        this.bpExecutor = null;
    }

}

export default GlobalVariable;
