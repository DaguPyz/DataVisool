/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractDesignerController as SdkDesignerController} from "@datavisool/sdk/core";
import type {ComponentBaseProps} from "@datavisool/sdk/types";
import type DesignerManager from "@/designer/manager/DesignerManager.ts";
import ComponentUtil from "@/util/ComponentUtil";

/** Web host implements data loading against Web services. */
const hostState = new WeakMap<SdkDesignerController, {errMsgDom: HTMLElement | null, loadVersion: number}>();

abstract class AbstractDesignerController<I = any, C = any> extends SdkDesignerController<I, C> {
    public designerManager?: DesignerManager;


    public override loadComponentData(): void {
        const state = hostState.get(this) ?? {errMsgDom: null, loadVersion: 0};
        hostState.set(this, state);
        const loadVersion = ++state.loadVersion;
        this.componentDataUpdater?.destroy();
        this.componentDataUpdater = null;
        const reportFailure = () => {
            if (loadVersion !== state.loadVersion || !this.container) return;
            this.lastReqState = false;
            const layerConfigs = (this.designerManager ?? window.DATAVISOOL_ENV?.currentManager)?.layerManager?.layerConfigs;
            const hide = layerConfigs?.[(this.config as any)?.base?.id]?.hide;
            if (!state.errMsgDom && !hide) {
                state.errMsgDom = document.createElement("div");
                state.errMsgDom.classList.add("view-error-message");
                state.errMsgDom.innerText = "数据加载失败...";
                this.container.appendChild(state.errMsgDom);
            }
        };
        import("./tools/ComponentDataUpdater.ts").then(module => {
            if (loadVersion !== state.loadVersion || !this.container || !this.config) return;
            const ComponentDataUpdater = module.default;
            this.componentDataUpdater = new ComponentDataUpdater(
                (data: any) => {
                    if (loadVersion !== state.loadVersion || !this.container) return;
                    if (!this.lastReqState) {
                        this.lastReqState = true;
                        state.errMsgDom?.remove();
                        state.errMsgDom = null;
                    }
                    this.changeData(data);
                },
                reportFailure, this.designerManager?.variableOwner ?? this.designerManager);
            this.componentDataUpdater.run((this.config as ComponentBaseProps).data!);
        }).catch(error => {
            if (loadVersion !== state.loadVersion || !this.container) return;
            console.error("加载组件数据失败", error);
            const updater = this.componentDataUpdater;
            this.componentDataUpdater = null;
            try { updater?.destroy(); } catch (cleanupError) { console.error("清理组件数据失败", cleanupError); }
            reportFailure();
        });
    }

    public override destroy(): void {
        ComponentUtil.release(this.container);
        const state = hostState.get(this);
        if (state) {
            state.loadVersion += 1;
            state.errMsgDom?.remove();
            state.errMsgDom = null;
        }
        super.destroy();
    }
}

export default AbstractDesignerController;
