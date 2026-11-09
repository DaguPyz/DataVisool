/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {GroupLayerInstance} from "./GroupLayer";
import AbstractDesignerController from "../../framework/core/AbstractDesignerController";
import {ComponentInfoType} from "@datavisool/sdk/types";
import {DesignerMode} from "@datavisool/sdk/types";
import {IFilterConfigType} from "@datavisool/sdk/types";
import BPExecutor from "../../designer/blueprint/core/BPExecutor.ts";

export interface GroupLayerProps {
    base: ComponentInfoType;
    filter?: IFilterConfigType;
}

export default class GroupLayerController extends AbstractDesignerController<GroupLayerInstance, GroupLayerProps> {

    async createGroupLayerInstance(container: HTMLElement, config: GroupLayerProps, instance: GroupLayerInstance, executor: BPExecutor, index?: number): Promise<void> {
        this.container = container;
        this.index = index;
        this.config = config;
        this.bpExecutor = executor;
        this.instance = instance;
        this.registerEvent();
        if (window.DATAVISOOL_ENV.mode !== DesignerMode.EDIT)
            executor.triggerComponentEvent(config.base.id, "loaded", config, this.index);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async create(container: HTMLElement, config: GroupLayerProps): Promise<void> {

    }

    public getConfig(): GroupLayerProps | null {
        return this.config;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public update(config: GroupLayerProps): void {
    }


    public setVisible(visible: boolean) {
        this.instance?.updateVisible(visible);
    }

    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? '';
            const executor = this.bpExecutor;
            this.instance.setEventHandler({
                click: () => executor?.triggerComponentEvent(nodeId!, "click", this.config, this.index)
            })
        }
    }
}