/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import ComponentUtil from "@/util/ComponentUtil.ts";
import BaseTextComponent, {BaseTextComponentProps, BaseTextComponentRef} from "./BaseTextComponent";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import {URLUtil} from "@datavisool/sdk";
import {DesignerMode} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

export class BaseTextController extends AbstractDesignerController<BaseTextComponentRef, BaseTextComponentProps> {

    async create(container: HTMLElement, config: BaseTextComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<BaseTextComponentRef>(container, BaseTextComponent, config);
        if (!this.instance || this.container !== container) return;
        const {mode} = URLUtil.parseUrlParams();
        //基础文本在编辑模式下放开事件，以实现双击直接进入编辑状态
        if (mode === DesignerMode.EDIT)
            this.container!.style!.pointerEvents = "auto";
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): BaseTextComponentProps | null {
        return this.config;
    }

    update(config: BaseTextComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender)
            this.instance?.updateConfig(this.config!);

    }


    changeData(data: any) {
        if (this.config?.data)
            this.config.data.value = data;
        this.instance?.updateConfig(this.config!);
    }

    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? "";
            const executor = this.bpExecutor;
            this.instance.setEventHandler({
                click: () => executor?.triggerComponentEvent(nodeId!, "click", this.config, this.index)
            });
        }
    }


    updateTheme(newTheme: IThemeItem) {
        if (!newTheme) return;
        const styleConfig = this.config?.style ?? {};
        const {colors: {main}} = newTheme;
        //图形
        if (styleConfig?.color)
            styleConfig.color = main;
        //重新渲染
        this.update({style: styleConfig}, {reRender: true});
    }
}
