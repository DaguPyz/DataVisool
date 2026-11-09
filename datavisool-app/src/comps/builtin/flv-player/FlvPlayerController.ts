/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import FlvPlayerComponent, {FlvPlayerComponentProps, FlvPlayerComponentRef} from "./FlvPlayerComponent.tsx";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import ComponentUtil from "@/util/ComponentUtil.ts";

export class FlvPlayerController extends AbstractDesignerController<FlvPlayerComponentRef, FlvPlayerComponentProps> {

    async create(container: HTMLElement, config: FlvPlayerComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<FlvPlayerComponentRef>(container, FlvPlayerComponent, config);
    }

    destroy(): void {
        this.instance?.destroy();
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): FlvPlayerComponentProps | null {
        return this.config;
    }

    update(config: FlvPlayerComponentProps, upOp?: UpdateOptions | undefined): void {
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