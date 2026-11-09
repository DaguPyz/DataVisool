/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import BaseIframeComponent, {BaseIframeComponentProps} from "./BaseIframeComponent";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import ComponentUtil from "@/util/ComponentUtil.ts";

export class BaseIframeController extends AbstractDesignerController<BaseIframeComponent, BaseIframeComponentProps> {

    async create(container: HTMLElement, config: BaseIframeComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<BaseIframeComponent>(container, BaseIframeComponent, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): BaseIframeComponentProps | null {
        return this.config;
    }

    update(config: BaseIframeComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender)
            this.instance?.setState(this.config);
    }

    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? '';
            const executor = this.bpExecutor;
            this.instance.eventHandlerMap = {
                load: () => executor?.triggerComponentEvent(nodeId!, "load", this.config, this.index)
            }
        }
    }


    setVisible(visible: boolean) {
        this.instance?.changeVisible(visible);
    }
}