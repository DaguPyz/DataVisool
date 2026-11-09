/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import ComponentUtil from "@/util/ComponentUtil.ts";
import type {ThreeModelComponentProps, ThreeModelComponentRef} from "./ThreeModelComponent";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor.ts";

export class ThreeModelController extends AbstractDesignerController<ThreeModelComponentRef, ThreeModelComponentProps> {
    private createGeneration = 0;
    private configVersion = 0;
    private visible: boolean | null = null;

    public async create(container: HTMLElement, config: ThreeModelComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        const generation = ++this.createGeneration;
        await super.create(container, config, bpExecutor, index);
        if (generation !== this.createGeneration || this.container !== container) return;
        let componentModule: typeof import("./ThreeModelComponent");
        try {
            componentModule = await import("./ThreeModelComponent");
        } catch (error) {
            if (generation !== this.createGeneration || this.container !== container) return;
            throw error;
        }
        if (generation !== this.createGeneration || this.container !== container) return;
        const {ThreeModelComponent} = componentModule;
        // 使用 ComponentUtil 创建并渲染 React 组件
        // Capture the latest config after import(); update() may have run while the chunk was loading.
        const renderConfig = this.config ?? config;
        const renderConfigVersion = this.configVersion;
        const instance = await ComponentUtil.createAndRender<ThreeModelComponentRef>(container, ThreeModelComponent, renderConfig);
        if (generation === this.createGeneration && this.container === container) {
            this.instance = instance;
            if (instance && this.visible !== null) {
                instance.changeVisible(this.visible);
            }
            // update() may also run while React is waiting for the forwarded ref.
            if (instance && renderConfigVersion !== this.configVersion && this.config) {
                instance.updateConfig(this.config);
            }
        }
    }

    destroy(): void {
        this.createGeneration += 1;
        this.instance = null;
        this.config = null;
        this.visible = null;
        super.destroy();
    }

    getConfig(): ThreeModelComponentProps | null {
        return this.config;
    }

    update(config: ThreeModelComponentProps, upOp?: UpdateOptions | undefined): void {
        this.configVersion += 1;
        // 合并配置
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender) {
            // 更新 React 组件的状态
            // 使用 updateConfig 方法更新组件配置
            this.instance?.updateConfig(this.config!);
        }
    }

    // 实现注册事件，例如点击事件
    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? '';
            const executor = this.bpExecutor;
            // 绑定点击事件，触发蓝图中的事件
            this.instance.setEventHandler({
                click: () => executor?.triggerComponentEvent(nodeId!, "click", this.config, this.index)
            });
        }
    }

    setVisible(visible: boolean) {
        // Keep the latest visibility while the lazy chunk or forwarded ref is pending.
        this.visible = visible;
        this.instance?.changeVisible(visible);
    }
}
