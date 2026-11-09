/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import BaseVideoComponent, {BaseVideoComponentRef, BaseVideoComponentStyle} from "./BaseVideoComponent.tsx";
import ComponentUtil from "@/util/ComponentUtil.ts";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {ObjectUtil} from "@datavisool/sdk";
import {ComponentInfoType} from "@datavisool/sdk/types";
import {IFilterConfigType} from "@datavisool/sdk/types";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";

export interface BaseVideoComponentProps {
    base?: ComponentInfoType;
    style?: BaseVideoComponentStyle;
    filter?: IFilterConfigType;
}


export default class BaseVideoController extends AbstractDesignerController<BaseVideoComponentRef, BaseVideoComponentProps> {

    public async create(container: HTMLElement, config: BaseVideoComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<BaseVideoComponentRef>(container, BaseVideoComponent, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): BaseVideoComponentProps | null {
        return this.config;
    }

    update(config: BaseVideoComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender) {
            this.instance?.updateConfig(this.config!);
        }
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


    setVisible(visible: boolean) {
        this.instance?.changeVisible(visible);
    }
}