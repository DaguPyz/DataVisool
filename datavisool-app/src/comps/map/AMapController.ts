/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AMapComponent, {AMapComponentProps, AMapComponentRef} from "./AMapComponent.tsx";
import AbstractDesignerController from "../../framework/core/AbstractDesignerController.ts";
import {ObjectUtil} from "@datavisool/sdk";
import type {UpdateOptions} from "@datavisool/sdk/types";
import BPExecutor from "../../designer/blueprint/core/BPExecutor.ts";
import ComponentUtil from "@/util/ComponentUtil.ts";

export class AMapController extends AbstractDesignerController<AMapComponentRef, AMapComponentProps> {

    async create(container: HTMLElement, config: AMapComponentProps, executor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, executor, index);
        this.instance = await ComponentUtil.createAndRender<AMapComponentRef>(container, AMapComponent, config);
        if (!this.instance || this.container !== container) return;
        if (window.AMap) {
            if (window.AMap_Key)
                this.config!.style!.key = window.AMap_Key;
            if (window.AMap_securityJsCode)
                this.config!.style!.securityJsCode = window.AMap_securityJsCode;
        }
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): AMapComponentProps | null {
        return this.config;
    }

    update(config: AMapComponentProps, upOp?: UpdateOptions | undefined): void {
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
}
