/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {IThemeItem} from "@datavisool/sdk/types";
import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import ComponentUtil from "@/util/ComponentUtil.ts";
import BaseInputComponent, {BaseInputComponentProps, BaseInputComponentRef} from "./BaseInputComponent.tsx";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";

export class BaseInputController extends AbstractDesignerController<BaseInputComponentRef, BaseInputComponentProps> {

    async create(container: HTMLElement, config: BaseInputComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<BaseInputComponentRef>(container, BaseInputComponent, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): BaseInputComponentProps | null {
        return this.config;
    }

    update(config: BaseInputComponentProps, upOp?: UpdateOptions | undefined): void {
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
                click: () => executor?.triggerComponentEvent(nodeId!, "click", this.config, this.index),
                valueChange: (value: string) => executor?.triggerComponentEvent(nodeId!, "valueChange", value, this.index),
            });
        }
    }


    updateTheme(newTheme: IThemeItem) {
        if (!newTheme || !this.config?.style) return;
        const styleConfig = this.config?.style;
        const {colors: {supplementSecond, main, supplementFirst, background, mainText}} = newTheme;
        if (styleConfig?.color)
            styleConfig.color = mainText ?? '';
        if (styleConfig?.borderColor)
            styleConfig.borderColor = mainText ?? '';
        if (styleConfig?.backgroundColor)
            styleConfig.backgroundColor = background ?? '';
        if (styleConfig?.borderStyle)
            styleConfig.borderStyle = supplementFirst ?? '';
        if (styleConfig?.backgroundColorHover)
            styleConfig.backgroundColorHover = supplementSecond ?? '';
        if (styleConfig?.borderColorHover)
            styleConfig.borderColorHover = main ?? '';
        //重新渲染
        this.update({style: styleConfig}, {reRender: true});
    }
}