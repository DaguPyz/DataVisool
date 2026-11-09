/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {IThemeItem} from "@datavisool/sdk/types";
import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import ComponentUtil from "@/util/ComponentUtil.ts";
import BaseSelectComponent, {BaseSelectComponentProps, BaseSelectComponentRef} from "./BaseSelectComponent.tsx";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";

export class BaseSelectController extends AbstractDesignerController<BaseSelectComponentRef, BaseSelectComponentProps> {

    async create(container: HTMLElement, config: BaseSelectComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<BaseSelectComponentRef>(container, BaseSelectComponent, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): BaseSelectComponentProps | null {
        return this.config;
    }

    changeData(data: any) {
        if (this.config?.data)
            this.config.data.value = data;
        this.update(this.config!)
    }

    update(config: BaseSelectComponentProps, upOp?: UpdateOptions | undefined): void {
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
                selectedChange: (value: string) => executor?.triggerComponentEvent(nodeId!, "selectedChange", value, this.index),
            });
        }
    }


    setVisible(visible: boolean) {
        this.instance?.changeVisible(visible);
    }

    updateTheme(newTheme: IThemeItem) {
        if (!newTheme || !this.config?.style) return;
        const styleConfig = this.config?.style;
        const {colors: {supplementSecond, subText, supplementFirst, background, mainText}} = newTheme;
        if (styleConfig?.selectorBg)
            styleConfig.selectorBg = background ?? '';
        if (styleConfig?.colorText)
            styleConfig.colorText = mainText ?? '';
        if (styleConfig?.colorBorder)
            styleConfig.colorBorder = supplementFirst ?? '';
        if (styleConfig?.colorPrimaryHover)
            styleConfig.colorPrimaryHover = supplementSecond ?? '';
        if (styleConfig?.controlOutline)
            styleConfig.controlOutline = supplementFirst ?? '';
        if (styleConfig?.optionSelectedBg)
            styleConfig.optionSelectedBg = background ?? '';
        if (styleConfig?.optionSelectedColor)
            styleConfig.optionSelectedColor = subText ?? '';
        if (styleConfig?.optionActiveBg)
            styleConfig.optionActiveBg = subText ?? '';
        if (styleConfig?.colorBgElevated)
            styleConfig.colorBgElevated = background ?? '';
        //重新渲染
        this.update({style: styleConfig}, {reRender: true});
    }
}