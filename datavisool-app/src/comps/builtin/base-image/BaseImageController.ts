/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import BaseImageComponent, {BaseImageComponentStyle} from "./BaseImageComponent";
import ComponentUtil from "@/util/ComponentUtil.ts";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {ObjectUtil} from "@datavisool/sdk";
import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor.ts";

export interface BaseImageComponentProps extends ComponentBaseProps {
    style?: BaseImageComponentStyle;
}


export default class BaseImageController extends AbstractDesignerController<BaseImageComponent, BaseImageComponentProps> {

    public async create(container: HTMLElement, config: BaseImageComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<BaseImageComponent>(container, BaseImageComponent, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): BaseImageComponentProps | null {
        return this.config;
    }

    update(config: BaseImageComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender) {
            this.instance?.setState(this.config!);
        }
    }

    changeData(data: any) {
        if (!this.config)
            this.config = {};
        if (!this.config.data)
            this.config.data = {sourceType: 'static'};
        this.config.data.value = data;
        this.instance?.setState(this.config);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    updateTheme(newTheme: IThemeItem): void {

    }

    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? '';
            const executor = this.bpExecutor;
            this.instance.eventHandlerMap = {
                click: () => executor?.triggerComponentEvent(nodeId!, "click", this.config, this.index)
            }
        }
    }

    setVisible(visible: boolean) {
        this.instance?.changeVisible(visible);
    }
}
