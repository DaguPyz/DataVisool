/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import BaseTabComponent, {TabComponentProps, TabComponentRef} from "./BaseTabComponent.tsx";
import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import {IThemeItem} from "@datavisool/sdk/types";

export class BaseTabController extends AbstractDesignerController<TabComponentRef, TabComponentProps> {

    async create(container: HTMLElement, config: TabComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        // 创建并渲染组件实例
        this.instance = await ComponentUtil.createAndRender<TabComponentRef>(container, BaseTabComponent, config);
    }

    // 控制组件显示/隐藏
    setVisible(visible: boolean): void {
        this.instance?.changeVisible(visible);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): TabComponentProps | null {
        return this.config;
    }

    // 响应数据源变化
    changeData(data: any) {
        // 如果传入的是数组或原始值，尝试直接作为 Value 设置
        // 实际场景中可能需要根据数据源格式解析出 options，此处暂定为设置值
        if (this.config?.data != undefined)
            this.config.data.value = data;
        this.instance?.setOptions(data);
    }

    update(config: TabComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender)
            this.instance?.updateConfig(this.config!);
    }

    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? "";
            const executor = this.bpExecutor;
            this.instance.setEventHandler({
                change: (value: any) => executor?.triggerComponentEvent(nodeId!, "change", value, this.index),
                valueChange: (value: any) => executor?.triggerComponentEvent(nodeId!, "valueChange", value, this.index),
                click: (option: any, value: any) => executor?.triggerComponentEvent(nodeId!, "click", {option, value}, this.index),
            });
        }
    }

    // 响应全局主题切换
    updateTheme(newTheme: IThemeItem) {
        if (!newTheme || !this.config?.style) return;
        const styleConfig = this.config.style;
        const {
            colors: {
                main,             // 主高亮色 #4FB8FF
                mainText,         // 主要文字 #FFFFFF
                subText,          // 次级文字 #A0A0B2
                background,       // 整体背景 #1E1E2F
                supplementFirst,  // 容器背景 #2C2C3E
            }
        } = newTheme;

        // 1. 容器整体样式赋值
        if (supplementFirst || background) {
            styleConfig.containerBgColor = supplementFirst ?? background;
        }
        styleConfig.containerBorderColor = "#3A3A4E"; // 遵循输入框/容器边框规范

        // 2. 未选中项样式 (默认态)
        styleConfig.itemBgColor = "transparent";      // 默认项背景通常透明或与容器一致
        styleConfig.itemColor = subText ?? "#A0A0B2"; // 默认使用次级文字颜色
        styleConfig.itemBorderColor = "transparent";

        // 3. 选中项样式 (激活态)
        if (main) {
            styleConfig.activeBgColor = main;           // 主高亮背景
            styleConfig.activeBorderColor = main;
        }
        styleConfig.activeColor = "#FFFFFF";          // 激活态文字固定为白色以保证对比度

        // 4. 悬停样式 (Hover 态)
        // 根据要求：悬停背景高亮 10% 亮度提升，通常表现为微亮处理
        styleConfig.itemHoverBgColor = "rgba(255, 255, 255, 0.08)";
        styleConfig.itemHoverColor = mainText ?? "#FFFFFF";
        styleConfig.itemHoverBorderColor = main;

        // 重新渲染
        this.update({style: styleConfig}, {reRender: true});
    }
}