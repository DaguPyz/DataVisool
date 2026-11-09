/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import SwitchComponent, {SwitchComponentProps, SwitchComponentRef} from "./BaseSwitchComponent.tsx";
import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import {IThemeItem} from "@datavisool/sdk/types";

export class SwitchController extends AbstractDesignerController<SwitchComponentRef, SwitchComponentProps> {

    async create(container: HTMLElement, config: SwitchComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<SwitchComponentRef>(container, SwitchComponent, {...config, controller: this});
    }

    setVisible(visible: boolean): void {
        this.instance?.changeVisible(visible);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): SwitchComponentProps | null {
        return this.config;
    }

    changeData(data: any, emitValueChange = true) {
        if (this.config?.data)
            this.config.data.value = data;
        if (emitValueChange && typeof data === "boolean")
            this.instance?.setValue(data);
    }

    update(config: SwitchComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender)
            this.instance?.updateConfig({...this.config!, controller: this});
    }

    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? "";
            const executor = this.bpExecutor;
            this.instance.setEventHandler({
                change: (value: boolean) => executor?.triggerComponentEvent(nodeId!, "change", value, this.index),
                click: (value: boolean) => executor?.triggerComponentEvent(nodeId!, "click", value, this.index),
                on: () => executor?.triggerComponentEvent(nodeId!, "on", this.config, this.index),
                off: () => executor?.triggerComponentEvent(nodeId!, "off", this.config, this.index),
                toggle: (value: boolean) => executor?.triggerComponentEvent(nodeId!, "toggle", value, this.index),
                valueChange: (value: boolean) => executor?.triggerComponentEvent(nodeId!, "valueChange", value, this.index),
            });
        }
    }

    updateTheme(newTheme: IThemeItem) {
        // 1. 基础校验
        if (!newTheme?.colors || !this.config?.style) return;

        const styleConfig = this.config.style;
        const {main, mainText, background, supplementFirst} = newTheme.colors;

        // 2. 更新 token 层级 (基础变量)
        if (styleConfig.token) {
            const token = styleConfig.token;
            // 主色映射
            if (main) {
                token.colorPrimary = main;
                token.colorPrimaryBorder = main;
                // 这里的 Hover 暂时设为 main，如果需要亮度变化可在此处理
                token.colorPrimaryHover = main;
            }
            // 文字颜色映射
            if (mainText) {
                token.colorText = mainText;
                token.colorTextLightSolid = mainText;
            }
        }

        // 3. 更新 components 层级 (组件局部变量)
        if (styleConfig.components) {
            const comp = styleConfig.components;
            // 容器背景通常对应 supplementFirst 或 background
            if (supplementFirst || background) {
                comp.colorBgContainer = supplementFirst ?? background;
            }
            // 把手背景可根据主题色微调，默认白色，也可映射为 mainText 的反色
            comp.handleBg = "#FFFFFF";
        }

        // 4. 更新 label 层级 (标签样式)
        if (styleConfig.label) {
            const label = styleConfig.label;
            if (mainText) label.color = mainText;
            // 如果存在 subText，可以考虑将其应用到 label 的 content 或次级说明上
        }

        // 5. 提交更新并重绘
        this.update({style: styleConfig}, {reRender: true});
    }
}
