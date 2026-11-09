/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import type {HlsPlayerComponentProps, HlsPlayerComponentRef} from "./HlsPlayerComponent.tsx";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import ComponentUtil from "@/util/ComponentUtil.ts";

export class HlsPlayerController extends AbstractDesignerController<HlsPlayerComponentRef, HlsPlayerComponentProps> {

    private createVersion = 0;
    private configVersion = 0;

    async create(container: HTMLElement, config: HlsPlayerComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        const version = ++this.createVersion;
        await super.create(container, config, bpExecutor, index);
        if (version !== this.createVersion) return;
        let HlsPlayerComponent: typeof import("./HlsPlayerComponent.tsx").default;
        try {
            ({default: HlsPlayerComponent} = await import("./HlsPlayerComponent.tsx"));
        } catch (error) {
            if (version !== this.createVersion) return;
            throw error;
        }
        if (version !== this.createVersion) return;
        const configVersion = this.configVersion;
        const instance = await ComponentUtil.createAndRender<HlsPlayerComponentRef>(container, HlsPlayerComponent, this.config ?? config);
        if (version !== this.createVersion) return;
        this.instance = instance;
        if (configVersion !== this.configVersion && this.config) instance?.updateConfig(this.config);
    }

    destroy(): void {
        this.createVersion += 1;
        this.instance?.destroy();
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    getConfig(): HlsPlayerComponentProps | null {
        return this.config;
    }

    update(config: HlsPlayerComponentProps, upOp?: UpdateOptions | undefined): void {
        this.configVersion += 1;
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