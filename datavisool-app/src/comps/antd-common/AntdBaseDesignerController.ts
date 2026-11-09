/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractDesignerController from "@/framework/core/AbstractDesignerController";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {Options, Plot} from "@antv/g2plot";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "@/designer/blueprint/core/BPExecutor";
import {ComponentBaseProps} from "@datavisool/sdk/types";

export abstract class AntdBaseDesignerController<I extends Plot<any> = Plot<Options>,
    C extends ComponentBaseProps = ComponentBaseProps> extends AbstractDesignerController<I, C> {

    private ClazzTemplate: (new (...args: any[]) => I) | undefined;

    private clearContainerChildren(): void {
        while (this.container?.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    }

    private destroyInstance(): void {
        try {
            this.instance?.destroy?.();
        } catch (error) {
            console.error("antd component destroy failed", error);
        } finally {
            this.instance = null;
        }
    }

    public override destroy(): void {
        this.destroyInstance();
        super.destroy();
    }

    /**
     * 将组件数据配置同步到 G2Plot 初始化 options 中。
     */
    private syncStyleDataFromDataConfig(config: C | null): void {
        const dataValue = config?.data?.value;
        if (!Array.isArray(dataValue))
            return;
        // G2Plot 图表初始化只读取 style，因此静态数组数据必须写入 style.data。
        if (!config!.style || typeof config!.style !== "object" || Array.isArray(config!.style))
            config!.style = {data: dataValue};
        else
            config!.style.data = dataValue;
    }

    changeData(data: any) {
        //data.value是LC表中组件属性存储静态数据的地方，也作为其他数据源存储结果的中转站，更新数据时应该同时更新data.value属性
        if (this.config?.data)
            this.config.data.value = data;
        //g2plot系列图表，style.data是其内部存储图表数据的地方，因此每次更新数据，该属性可以主动更新
        if (this.config?.style)
            this.config!.style!.data = data;
        this.instance?.changeData(data);
    }

    registerEvent(): void {
        const nodeId = this.config?.base?.id ?? '';
        const _config = this.config;
        const executor = this.bpExecutor;
        this.instance?.on('plot:click', () => {
            executor?.triggerComponentEvent(nodeId!, "globalClick", _config, this.index)
        });
        this.instance?.on('element:click', (params: any) => {
            const data = {selectedData: params?.data?.data, ..._config};
            executor?.triggerComponentEvent(nodeId!, "elementClick", data, this.index)
        });
        // 图例添加点击事件
        this.instance?.on('legend-item:click', () => {
            executor?.triggerComponentEvent(nodeId!, "legendClick", _config, this.index)
        });
        // 图例名称添加点击事件
        this.instance?.on('legend-item-name:click', () => {
            executor?.triggerComponentEvent(nodeId!, "elementNameClick", _config, this.index)
        });
        // axis-label 添加点击事件
        this.instance?.on('axis-label:click', () => {
            executor?.triggerComponentEvent(nodeId!, "axisLabelClick", _config, this.index)
        });
    }

    public commonCreate(container: HTMLElement, Clazz: new (...args: any[]) => I, config: C, executor: BPExecutor, index?: number): void {
        this.index = index;
        this.config = config;
        this.container = container;
        this.bpExecutor = executor;
        this.ClazzTemplate = Clazz;
        this.clearContainerChildren();
        this.syncStyleDataFromDataConfig(this.config);
        this.instance = new Clazz(container, this.config?.style ?? {} as C);
        this.instance?.render();
    }

    public commonUpdate(config: C, Clazz: new (...args: any[]) => I, upOp?: UpdateOptions,): void {
        this.config = ObjectUtil.merge(this.config, config);
        this.syncStyleDataFromDataConfig(this.config);
        upOp = upOp || {reRender: true};
        if (!upOp.reRender)
            return;
        this.instance?.update(this.config?.style ?? {});
    }


    setVisible(visible: boolean) {
        if (visible) {
            //显示
            if (!this.ClazzTemplate || this.instance)
                return;
            this.clearContainerChildren();
            this.syncStyleDataFromDataConfig(this.config);
            this.instance = new this.ClazzTemplate(this.container, this.config?.style ?? {} as C);
            this.instance?.render();
        } else {
            //隐藏
            this.destroyInstance();
            this.clearContainerChildren();
        }

    }

}
