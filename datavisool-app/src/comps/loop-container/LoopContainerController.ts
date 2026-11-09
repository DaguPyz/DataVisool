/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import LoopContainer, {ILoopContainerStyle, LoopContainerInstance} from "./LoopContainer.tsx";
import AbstractDesignerController from "@/framework/core/AbstractDesignerController";
import {ComponentInfoType} from "@datavisool/sdk/types";
import {DesignerMode, DesignerScene, IDesignerManager} from "@datavisool/sdk/types";
import {IFilterConfigType} from "@datavisool/sdk/types";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {DataConfigType} from "@datavisool/sdk/types";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {cloneDeep} from "lodash";
import {ObjectUtil} from "@datavisool/sdk";
import ComponentUtil from "@/util/ComponentUtil.ts";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import DataUtil from "@/util/DataUtil.ts";
import loopContainerSampleDataStore from "@/designer/store/LoopContainerSampleDataStore.ts";

type CarouselDirection = 'row' | 'column';

interface CarouselRuntime {
    enabled: boolean;
    direction: CarouselDirection;
    step: number;
    durationMs: number;
    pauseMs: number;
    dataLength: number;
}

export interface LoopContainerProps {
    base: ComponentInfoType;
    filter?: IFilterConfigType;
    style?: ILoopContainerStyle;
    data?: DataConfigType;
    managerData?: IDesignerManager;
    manager?: DesignerManager;
}

const safeChangeData = (
    controller: AbstractDesignerController<any, any>,
    data: any,
    context: string
) => {
    try {
        controller.changeData(data);
        return true;
    } catch (error) {
        const base = controller?.config?.base;
        console.error(`[LoopContainerController] ${context} changeData failed`, {
            componentId: base?.id,
            componentType: base?.type,
            error,
        });
        return false;
    }
};

const resolveLoopContainerGaps = (style?: ILoopContainerStyle | null) => {
    const horizontalGap = Number(style?.horizontalGap ?? 0) || 0;
    const verticalGap = Number(style?.verticalGap ?? 0) || 0;
    return {horizontalGap, verticalGap};
};

const normalizeLoopContainerStyle = (style?: ILoopContainerStyle | null): ILoopContainerStyle => {
    const {horizontalGap, verticalGap} = resolveLoopContainerGaps(style);
    const normalizedStyle = {
        ...(style ?? {}),
        horizontalGap,
        verticalGap,
    } as ILoopContainerStyle;
    return normalizedStyle;
};

export default class LoopContainerController extends AbstractDesignerController<LoopContainerInstance, LoopContainerProps> {

    public manager: DesignerManager = new DesignerManager(DesignerScene.LOOP_CONTAINER);
    //循环容器是否已经完整初始化完毕（此属性帮助循环容器在首次渲染时正确的获取初始化配置）
    private initialized = false;
    //当前循环容器是否可见
    private isVisible = true;
    //轮播控制定时器
    private carouselTimer: number | null = null;
    private carouselFrameTimer: number | null = null;
    //数据同步延迟定时器
    private dataSyncTimer: number | null = null;
    private dataSyncVersion = 0;

    private clearCarouselTimers() {
        if (this.carouselTimer != null) {
            clearTimeout(this.carouselTimer);
            this.carouselTimer = null;
        }
        if (this.carouselFrameTimer != null) {
            cancelAnimationFrame(this.carouselFrameTimer);
            this.carouselFrameTimer = null;
        }
    }

    private stopCarousel(resetView = true) {
        this.clearCarouselTimers();
        if (resetView)
            this.instance?.resetCarouselSlots?.(this.config?.data?.value?.length ?? 0);
    }

    private getCarouselRuntime(): CarouselRuntime {
        const style = normalizeLoopContainerStyle(this.config?.style);
        const data = this.config?.data?.value;
        const dataLength = Array.isArray(data) ? data.length : 0;
        const direction = (style.carouselDirection ?? style.flexDirection ?? 'column') as CarouselDirection;
        const {horizontalGap, verticalGap} = resolveLoopContainerGaps(style);
        const {width = 0, height = 0} = this.manager?.canvasManager?.canvasConfig ?? {};
        const step = direction === 'row' ? width + horizontalGap : height + verticalGap;
        const speed = Number(style.carouselSpeed ?? 3);
        const durationMs = speed > 0 ? Math.max(120, Math.round(1000 / speed)) : 0;
        const pauseSeconds = Number(style.carouselPauseSeconds ?? 0.08);
        const pauseMs = Math.max(0, Math.round((Number.isFinite(pauseSeconds) ? pauseSeconds : 0) * 1000));
        const enabled = window.DATAVISOOL_ENV.mode !== DesignerMode.EDIT
            && this.isVisible
            && Boolean(style.enableCarousel)
            && dataLength > 1
            && step > 0
            && durationMs > 0;
        return {enabled, direction, step, durationMs, pauseMs, dataLength};
    }

    private getSyncableLayerIds() {
        return Object.values(this.manager?.layerManager?.layerConfigs ?? {})
            .filter((layer) => layer?.id && layer.type !== 'group')
            .map((layer) => layer.id!);
    }

    private async syncControllersWithData(data: any[], startIndex = 0, syncVersion = this.dataSyncVersion) {
        if (!this.manager || !Array.isArray(data) || data.length === 0)
            return true;
        const {controllers} = this.manager.layerManager;
        const layerIds = this.getSyncableLayerIds();
        let pendingController = false;
        for (let slotIndex = 0; slotIndex < data.length; slotIndex++) {
            if (syncVersion !== this.dataSyncVersion || !this.initialized)
                return false;
            const sourceIndex = (startIndex + slotIndex) % data.length;
            const sourceItem = cloneDeep(data[sourceIndex]);
            const slotKeys = layerIds.map((layerId) => `${layerId}_${slotIndex}`);
            for (const key of slotKeys) {
                if (syncVersion !== this.dataSyncVersion || !this.initialized)
                    return false;
                const controller = controllers[key] as any;
                if (!controller) {
                    pendingController = true;
                    continue;
                }
                if (!controller?.config?.data || typeof controller.changeData !== 'function')
                    continue;
                if (controller instanceof LoopContainerController) {
                    if (controller.config.data.staticData)
                        controller.config.data.staticData.value = cloneDeep(sourceItem);
                    else
                        controller.config.data.staticData = {value: cloneDeep(sourceItem)};
                    const itemVal = await DataUtil.getStaticDataAsync(controller.config.data?.staticData);
                    if (syncVersion !== this.dataSyncVersion || !this.initialized)
                        return false;
                    safeChangeData(controller, itemVal, `syncControllersWithData[${slotIndex}]`);
                    continue;
                }
                if (controller.config.data.staticData)
                    controller.config.data.staticData.value = cloneDeep(sourceItem);
                else
                    controller.config.data.staticData = {value: cloneDeep(sourceItem)};
                const itemVal = await DataUtil.getStaticDataAsync(controller.config.data?.staticData);
                if (syncVersion !== this.dataSyncVersion || !this.initialized)
                    return false;
                safeChangeData(controller, itemVal, `syncControllersWithData[${slotIndex}]`);
            }
        }
        return !pendingController;
    }

    private refreshCarouselRuntime() {
        if (!this.initialized || !this.instance)
            return;
        const runtime = this.getCarouselRuntime();
        this.stopCarousel(true);
        if (!runtime.enabled)
            return;
        this.runCarouselCycle(runtime);
    }

    private runCarouselCycle(runtime: CarouselRuntime) {
        if (!runtime.enabled || !this.instance) {
            this.stopCarousel(true);
            return;
        }
        if (this.carouselTimer != null) {
            clearTimeout(this.carouselTimer);
            this.carouselTimer = null;
        }
        this.instance?.setCarouselState?.({
            direction: runtime.direction,
            offset: -runtime.step,
            transitionMs: runtime.durationMs,
        });
        this.carouselTimer = window.setTimeout(() => {
            this.carouselTimer = null;
            if (!this.getCarouselRuntime().enabled || !this.instance) {
                this.stopCarousel(true);
                return;
            }
            const data = this.config?.data?.value;
            if (!Array.isArray(data) || data.length <= 1) {
                this.stopCarousel(true);
                return;
            }
            this.instance?.advanceCarouselSlots?.(1);
            this.carouselFrameTimer = window.requestAnimationFrame(() => {
                this.carouselFrameTimer = null;
                if (!this.getCarouselRuntime().enabled || !this.instance) {
                    this.stopCarousel(true);
                    return;
                }
                this.runCarouselCycle(this.getCarouselRuntime());
            });
        }, runtime.durationMs + runtime.pauseMs);
    }

    async create(container: HTMLElement, config: LoopContainerProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        const normalizedConfig = {
            ...config,
            style: normalizeLoopContainerStyle(config?.style),
        };
        await super.create(container, normalizedConfig, bpExecutor, index);
        if (!normalizedConfig.managerData)
            return;
        this.manager.variableOwner = this.designerManager?.variableOwner ?? this.designerManager;
        this.manager.init(normalizedConfig.managerData, window.DATAVISOOL_ENV.mode);
        this.manager.id = normalizedConfig.base.id;
        this.manager.name = normalizedConfig.base.name;
        this.instance = await ComponentUtil.createAndRender<LoopContainerInstance>(container, LoopContainer, {...normalizedConfig, manager: this.manager});
        if (!this.instance || this.container !== container) return;
        this.registerEvent();
        this.initialized = true;
        if (this.config?.data?.value)
            this.changeData(this.config?.data?.value)
        if (window.DATAVISOOL_ENV.mode !== DesignerMode.EDIT)
            bpExecutor.triggerComponentEvent(normalizedConfig.base.id, "loaded", normalizedConfig, index);
    }

    public getConfig(): LoopContainerProps | null {
        if (this.config?.style)
            this.config.style = normalizeLoopContainerStyle(this.config.style);
        if (this.initialized)
            this.config!.managerData = this.manager?.getData();
        return this.config;
    }

    update(config: LoopContainerProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        if (this.config?.style)
            this.config.style = normalizeLoopContainerStyle(this.config.style);
        upOp = upOp || {reRender: true};
        if (upOp.reRender) {
            //更新组件数据
            this.instance?.updateConfig(this.config!);
            this.refreshCarouselRuntime();
        }
    }

    public setVisible(visible: boolean) {
        this.isVisible = visible;
        this.instance?.updateVisible(visible);
        if (!visible)
            this.stopCarousel(true);
        else
            this.refreshCarouselRuntime();
    }

    private getEditSampleData() {
        const data = this.config?.data?.value;
        if (!Array.isArray(data) || data.length === 0)
            return undefined;
        return cloneDeep(data[0]);
    }

    public seedEditSampleData() {
        const loopContainerId = this.config?.base?.id ?? '';
        if (!loopContainerId)
            return false;
        const sampleData = this.getEditSampleData();
        loopContainerSampleDataStore.setSampleData(loopContainerId, sampleData);
        return sampleData !== undefined;
    }

    public applyEditSampleData() {
        return this.seedEditSampleData();
    }

    changeData(data: any) {
        if (!Array.isArray(data)) {
            console.warn('循环容器的数据源必须是数组: ', data);
            return;
        }
        this.stopCarousel(true);
        if (this.config?.data)
            this.config.data.value = data;
        this.instance?.updateConfig(this.config!);
        this.instance?.resetCarouselSlots?.(data.length);
        if (this.dataSyncTimer != null) {
            clearTimeout(this.dataSyncTimer);
            this.dataSyncTimer = null;
        }
        const syncVersion = ++this.dataSyncVersion;
        const scheduleSync = (attempt = 0) => {
            const timerId = window.setTimeout(async () => {
                if (this.dataSyncTimer === timerId)
                    this.dataSyncTimer = null;
                if (!this.manager)
                    return;
                const completed = await this.syncControllersWithData(data, 0, syncVersion);
                if (syncVersion !== this.dataSyncVersion || !this.initialized)
                    return;
                if (!completed && attempt < 20) {
                    scheduleSync(attempt + 1);
                    return;
                }
                this.refreshCarouselRuntime();
            }, attempt === 0 ? 10 : 50)
            this.dataSyncTimer = timerId;
        };
        scheduleSync();

    }

    public destroy(): void {
        this.stopCarousel(true);
        this.dataSyncVersion += 1;
        if (this.dataSyncTimer != null) {
            clearTimeout(this.dataSyncTimer);
            this.dataSyncTimer = null;
        }
        loopContainerSampleDataStore.removeSampleData(this.config?.base?.id ?? '');
        this.initialized = false;
        super.destroy();
    }

    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? '';
            const executor = this.bpExecutor;
            this.instance.setEventHandler({
                click: () => executor?.triggerComponentEvent(nodeId!, "click", this.config, this.index),
            })
        }
    }
}
