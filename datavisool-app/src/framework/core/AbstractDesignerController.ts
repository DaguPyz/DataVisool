/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractDesignerController as SdkDesignerController} from "@datavisool/sdk/core";
import type {ComponentBaseProps} from "@datavisool/sdk/types";
import type {ComponentDataUpdater, HostDataUpdaterOptions} from '@datavisool/sdk/core';
import ComponentUtil from "@/util/ComponentUtil";

/** Web host implements data loading against Web services. */
type RuntimeDataAdapter = {
    createUpdater(success: (data?: any) => void, fail: () => void): ComponentDataUpdater;
    isLayerHidden?(id: string): boolean;
};
type HostControllerState = {
    errMsgDom: HTMLElement | null;
    loadVersion: number;
    dataUpdaters: Set<ComponentDataUpdater>;
};
const hostState = new WeakMap<SdkDesignerController, HostControllerState>();
const runtimeDataAdapters = new WeakMap<SdkDesignerController, RuntimeDataAdapter>();

function readHostState(controller: SdkDesignerController): HostControllerState {
    const current = hostState.get(controller);
    if (current) return current;
    const state = {errMsgDom: null, loadVersion: 0, dataUpdaters: new Set<ComponentDataUpdater>()};
    hostState.set(controller, state);
    return state;
}

abstract class AbstractDesignerController<I = any, C = any> extends SdkDesignerController<I, C> {
    /** Temporary legacy component surface; the concrete manager type stays runtime-private. */
    public designerManager?: any;

    public setRuntimeDataAdapter(adapter?: RuntimeDataAdapter): void {
        if (adapter) runtimeDataAdapters.set(this, adapter);
        else runtimeDataAdapters.delete(this);
    }

    public override createHostDataUpdater(
        success: (data?: any) => void,
        fail: () => void,
        options?: HostDataUpdaterOptions,
    ): ComponentDataUpdater | null {
        const adapter = runtimeDataAdapters.get(this);
        const updater = adapter?.createUpdater(success, fail);
        if (!updater) return null;
        const signal = options?.signal;
        const state = readHostState(this);
        let disposed = false;
        let wrapped: ComponentDataUpdater;
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            signal?.removeEventListener('abort', dispose);
            state.dataUpdaters.delete(wrapped);
            const errors: unknown[] = [];
            try { updater.destroy(); } catch (error) { errors.push(error); }
            try { options?.onDispose?.(); } catch (error) { errors.push(error); }
            if (errors.length) throw new AggregateError(errors, 'Failed to dispose a host data updater.');
        };
        wrapped = {
            run(config, singleTrigger) {
                if (!disposed) updater.run(config, singleTrigger);
            },
            pauseRuntimeEffects() {
                if (!disposed) updater.pauseRuntimeEffects?.();
            },
            resumeRuntimeEffects() {
                if (!disposed) updater.resumeRuntimeEffects?.();
            },
            destroy: dispose,
        };
        state.dataUpdaters.add(wrapped);
        if (signal) {
            if (signal.aborted) {
                dispose();
                return null;
            }
            signal.addEventListener('abort', dispose, {once: true});
            if (signal.aborted) {
                dispose();
                return null;
            }
        }
        return wrapped;
    }

    /** Backward-compatible internal alias used by legacy host loading. */
    public createRuntimeDataUpdater(success: (data?: any) => void, fail: () => void): ComponentDataUpdater | null {
        return this.createHostDataUpdater(success, fail);
    }

    public pauseRuntimeEffects(): void {
        this.componentDataUpdater?.pauseRuntimeEffects?.();
    }

    public resumeRuntimeEffects(): void {
        this.componentDataUpdater?.resumeRuntimeEffects?.();
    }


    public override loadComponentData(): void {
        const state = readHostState(this);
        const loadVersion = ++state.loadVersion;
        this.componentDataUpdater?.destroy();
        this.componentDataUpdater = null;
        const reportFailure = () => {
            if (loadVersion !== state.loadVersion || !this.container) return;
            this.lastReqState = false;
            const layerId = (this.config as any)?.base?.id;
            const hide = layerId ? runtimeDataAdapters.get(this)?.isLayerHidden?.(layerId) : false;
            if (!state.errMsgDom && !hide) {
                state.errMsgDom = document.createElement("div");
                state.errMsgDom.classList.add("view-error-message");
                state.errMsgDom.innerText = "数据加载失败...";
                this.container.appendChild(state.errMsgDom);
            }
        };
        if (loadVersion !== state.loadVersion || !this.container || !this.config) return;
        try {
            const updater = this.createRuntimeDataUpdater(
                (data: any) => {
                    if (loadVersion !== state.loadVersion || !this.container) return;
                    if (!this.lastReqState) {
                        this.lastReqState = true;
                        state.errMsgDom?.remove();
                        state.errMsgDom = null;
                    }
                    this.changeData(data);
                },
                reportFailure,
            );
            if (!updater) {
                reportFailure();
                return;
            }
            this.componentDataUpdater = updater;
            updater.run((this.config as ComponentBaseProps).data!);
        } catch (error) {
            console.error("加载组件数据失败", error);
            const updater = this.componentDataUpdater;
            this.componentDataUpdater = null;
            try { updater?.destroy(); } catch (cleanupError) { console.error("清理组件数据失败", cleanupError); }
            reportFailure();
        }
    }

    public override destroy(): void {
        const errors: unknown[] = [];
        try { ComponentUtil.release(this.container); } catch (error) { errors.push(error); }
        const state = hostState.get(this);
        if (state) {
            state.loadVersion += 1;
            try { state.errMsgDom?.remove(); } catch (error) { errors.push(error); }
            state.errMsgDom = null;
            [...state.dataUpdaters].forEach(updater => {
                try { updater.destroy(); } catch (error) { errors.push(error); }
            });
            state.dataUpdaters.clear();
        }
        try { super.destroy(); } catch (error) { errors.push(error); }
        runtimeDataAdapters.delete(this);
        hostState.delete(this);
        this.designerManager = undefined;
        if (errors.length) throw new AggregateError(errors, 'Failed to release component controller resources.');
    }
}

export default AbstractDesignerController;
