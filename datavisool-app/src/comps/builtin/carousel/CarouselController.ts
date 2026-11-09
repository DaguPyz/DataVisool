/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import ComponentUtil from "@/util/ComponentUtil.ts";
import CarouselComponent, {CarouselComponentProps, CarouselComponentRef} from "./CarouselComponent.tsx";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";

export class CarouselController extends AbstractDesignerController<CarouselComponentRef, CarouselComponentProps> {

    async create(container: HTMLElement, config: CarouselComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<CarouselComponentRef>(container, CarouselComponent, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): CarouselComponentProps | null {
        return this.config;
    }


    changeData(data: string[]) {
        if (this.config?.data)
            this.config.data.value = data;
        this.instance?.updateConfig(this.config!);
    }

    update(config: CarouselComponentProps, upOp?: UpdateOptions | undefined): void {
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


    setVisible(visible: boolean) {
        this.instance?.changeVisible(visible);
    }
}