/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import Component, {BaseButtonComponentProps, BaseButtonComponentRef} from "./component";

import {AbstractDesignerController, BPExecutor} from "@datavisool/sdk";
import {IThemeItem, UpdateOptions} from "@datavisool/sdk/types";
import {ComponentUtil, ObjectUtil} from "@datavisool/sdk";

export class Controller extends AbstractDesignerController<BaseButtonComponentRef, BaseButtonComponentProps> {

    /**
     * 创建组件实例
     * @param container 组件容器
     * @param config 组件配置项
     * @param executor 蓝图执行器
     * @param index 循环渲染索引
     */
    async create(container: HTMLElement, config: BaseButtonComponentProps, executor: BPExecutor, index?: number): Promise<void> {
        this.index = index;
        this.config = config;
        this.container = container;
        this.bpExecutor = executor;
        this.instance = await ComponentUtil.createAndRender<BaseButtonComponentRef>(container, Component, config);
    }

    /**
     * 销毁组件实例
     */
    destroy(): void {
        ComponentUtil.unmount(this.container);
        super.destroy();
    }

    /**
     * 获取组件配置项
     */
    getConfig(): BaseButtonComponentProps | null {
        return this.config;
    }

    /**
     * 更新组件数据
     * @param data
     */
    changeData(data: any) {
        if (this.config?.data?.staticData)
            this.config.data.staticData = data;
        this.update(this.config!)
    }

    /**
     * 更新组件配置项
     * @param config
     * @param upOp
     */
    update(config: BaseButtonComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender)
            this.instance?.updateConfig(this.config!);
    }

    /**
     * 注册蓝图事件
     */
    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? "";
            const executor = this.bpExecutor;
            this.instance.setEventHandler({
                click: () => executor?.triggerComponentEvent(nodeId!, "click", this.config)
            });
        }
    }

    /**
     * 更新主题
     * @param newTheme
     */
    updateTheme(newTheme: IThemeItem) {
        if (!newTheme || !this.config?.style) return;
        const styleConfig = this.config?.style;
        const {colors: {supplementSecond, supplementFirst, background, mainText}} = newTheme;
        if (styleConfig?.color)
            styleConfig.color = mainText ?? '';
        if (styleConfig?.borderColor)
            styleConfig.borderColor = mainText ?? '';
        if (styleConfig?.backgroundColor)
            styleConfig.backgroundColor = background ?? '';
        if (styleConfig?.hoverBackgroundColor)
            styleConfig.hoverBackgroundColor = supplementFirst ?? '';
        if (styleConfig?.hoverShadow)
            styleConfig.hoverShadow = mainText ?? '';
        if (styleConfig?.scannerColor)
            styleConfig.scannerColor = supplementSecond ?? '';
        //重新渲染
        this.update({style: styleConfig}, {reRender: true});
    }
}