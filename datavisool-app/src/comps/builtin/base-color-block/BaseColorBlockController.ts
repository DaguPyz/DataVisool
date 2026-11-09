/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import BaseColorBlockComponent, {
    BaseColorBlockComponentProps,
    BaseColorBlockComponentRef
} from "./BaseColorBlockComponent";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import {IThemeItem} from "@datavisool/sdk/types";
import ComponentUtil from "@/util/ComponentUtil.ts";

export class BaseColorBlockController extends AbstractDesignerController<BaseColorBlockComponentRef, BaseColorBlockComponentProps> {

    async create(container: HTMLElement, config: BaseColorBlockComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<BaseColorBlockComponentRef>(container, BaseColorBlockComponent, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): BaseColorBlockComponentProps | null {
        return this.config;
    }

    update(config: BaseColorBlockComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender)
            this.instance?.updateConfig(this.config!);
    }


    registerEvent() {
        const nodeId = this.config?.base?.id ?? '';
        const executor = this.bpExecutor;
        this.instance?.setEventHandler({
            click: () => executor?.triggerComponentEvent(nodeId!, "click", this.config, this.index),
        })
    }


    updateTheme(newTheme: IThemeItem) {
        if (!newTheme) return;
        const styleConfig = this.config?.style ?? {};
        const {colors: {background, mainText}} = newTheme;
        //图形
        if (styleConfig?.background)
            styleConfig.background = background;
        if (styleConfig.borderColor)
            styleConfig.borderColor = mainText;
        //重新渲染
        this.update({style: styleConfig}, {reRender: true});
    }
}