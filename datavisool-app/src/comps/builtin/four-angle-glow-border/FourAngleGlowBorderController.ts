/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import FourAngleGlowBorder, {FourAngleGlowBorderRef, FourAngleGlowBorderStyle} from "./FourAngleGlowBorder";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {ComponentInfoType} from "@datavisool/sdk/types";
import {IFilterConfigType} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

export interface FourAngleGlowProps {
    base?: ComponentInfoType;
    style?: FourAngleGlowBorderStyle;
    filter?: IFilterConfigType;
}

export class FourAngleGlowBorderController extends AbstractDesignerController<FourAngleGlowBorderRef, FourAngleGlowProps> {

    async create(container: HTMLElement, config: FourAngleGlowProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<FourAngleGlowBorderRef>(container, FourAngleGlowBorder, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): FourAngleGlowProps | null {
        return this.config;
    }

    update(config: FourAngleGlowProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender)
            this.instance?.updateConfig(this.config!.style!);
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
        const {colors: {main}} = newTheme;
        //图形
        if (styleConfig?.color)
            styleConfig.color = main;
        //重新渲染
        this.update({style: styleConfig}, {reRender: true});
    }
}