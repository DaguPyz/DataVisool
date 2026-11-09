/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import BaseButtonComponent, {BaseButtonComponentProps, BaseButtonComponentRef} from "./BaseButtonComponent.tsx";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import {IThemeItem} from "@datavisool/sdk/types";
import ComponentUtil from "@/util/ComponentUtil.ts";

export class BaseButtonController extends AbstractDesignerController<BaseButtonComponentRef, BaseButtonComponentProps> {

    async create(container: HTMLElement, config: BaseButtonComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<BaseButtonComponentRef>(container, BaseButtonComponent, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): BaseButtonComponentProps | null {
        return this.config;
    }

    update(config: BaseButtonComponentProps, upOp?: UpdateOptions | undefined): void {
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
                click: () => executor?.triggerComponentEvent(nodeId!, "click", this.config, this.index)
            });
        }
    }


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