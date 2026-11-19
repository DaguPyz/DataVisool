/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, runInAction, toJS} from "mobx";
import {isEqual} from "lodash";
import AbstractDesignerController from "@/framework/core/AbstractDesignerController.ts";
import {ObjectUtil} from "@datavisool/sdk";
import AbstractManager from "./core/AbstractManager.ts";
import {
    CanvasContentUpdateMode,
    ICanvasContentUpdatePayload,
    ICanvasContentUpdateResult,
    ILayerItem,
    ILayerManager
} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";
import canvasContentUpdater from "@/plugins/designer-runtime/internal/designer/manager/util/CanvasContentUpdater.ts";

interface ComponentControllerBinding {
    readonly layerId: string;
    readonly renderKey: string;
    readonly entityToken: object;
    readonly definition: object;
    readonly bpExecutor: object | null;
    readonly index?: number;
}

interface LayerEntityToken {
    readonly renderGeneration: number;
    readonly token: object;
}

/**
 * 设计器核心状态管理类，记录了设计器中的核心数据。包括组件配置，组件布局。 全局设置等。
 */
class LayerManager extends AbstractManager<ILayerManager> {
    private nextRenderGeneration = 0;
    private readonly renderGenerations = new Map<string, number>();
    private readonly destroyedControllers = new WeakSet<object>();
    private readonly nestedEditingControllers = new WeakSet<object>();
    private readonly componentControllerBindings = new WeakMap<object, ComponentControllerBinding>();
    private readonly layerEntityTokens = new Map<string, LayerEntityToken>();

    constructor() {
        super();
        makeObservable(this, {
            layerConfigs: observable.shallow,
            controllers: observable.shallow,
            enableAdsorption: observable,
            setEnableAdsorption: action,
            init: action,
            destroy: action,
            addItem: action,
            delItem: action,
            updateLayer: action,
            flashGlobalTheme: action,
            delLayout: action,
        });
    }

    /**
     * 每个图层元素的配置数据
     */
    elemConfigs: Record<string, any> | null = {};

    /**
     * 画布上图层组件id与其实例对象的映射
     */
    controllers: Record<string, AbstractDesignerController> = {};

    /**
     * 布局配置
     */
    layerConfigs: Record<string, ILayerItem> = {};

    /**
     * 图层头指针
     */
    layerHeader: string | undefined = undefined;

    /**
     * 图层尾指针
     */
    layerTail: string | undefined = undefined;

    /**
     * 是否开启图层原有事件
     */
    enableEvent: boolean = false;

    /**
     * 是否开启吸附效果
     */
    enableAdsorption: boolean = true;

    setEnableAdsorption = (enable: boolean) => {
        this.enableAdsorption = enable;
    }

    setEnableEvent = (enable: boolean) => {
        this.enableEvent = enable;
        //重新渲染所有图层
        this.reRenderLayer();
    };

    /**
     * 添加元素
     */
    addItem = (layer: ILayerItem) => {
        const id = String(layer.id);
        const renderGeneration = ++this.nextRenderGeneration;
        this.renderGenerations.set(id, renderGeneration);
        this.layerConfigs[id] = layer;
        this.layerEntityTokens.set(id, {renderGeneration, token: {}});
        return layer;
    };

    /** A restored layer with the same persisted ID still needs a fresh component instance. */
    getRenderKey = (id: string) => `${id}:${this.renderGenerations.get(id) ?? 0}`;

    /** Runtime-only identity for a layer entity, independent of its React render generation. */
    getRuntimeEntityToken(id: string): object | undefined {
        if (!Object.prototype.hasOwnProperty.call(this.layerConfigs, id)) {
            this.layerEntityTokens.delete(id);
            return undefined;
        }
        const renderGeneration = this.renderGenerations.get(id) ?? 0;
        const current = this.layerEntityTokens.get(id);
        if (current?.renderGeneration === renderGeneration) return current.token;
        const token = {};
        this.layerEntityTokens.set(id, {renderGeneration, token});
        return token;
    }

    /** Restore entity tokens only while replaying a validated runtime history snapshot. */
    restoreRuntimeHistoryEntityTokens(target: ReadonlyMap<string, object | undefined>): boolean {
        for (const [id, token] of target) {
            const exists = Object.prototype.hasOwnProperty.call(this.layerConfigs, id);
            if (exists !== Boolean(token)) return false;
        }
        target.forEach((token, id) => {
            if (token)
                this.layerEntityTokens.set(id, {renderGeneration: this.renderGenerations.get(id) ?? 0, token});
            else
                this.layerEntityTokens.delete(id);
        });
        return true;
    }

    /** A controller can be detached from the map before its pending React mount settles. */
    destroyController = (controller: AbstractDesignerController | undefined | null) => {
        if (!controller) return;
        this.nestedEditingControllers.delete(controller);
        if (this.destroyedControllers.has(controller)) return;
        this.destroyedControllers.add(controller);
        controller.destroy();
    };

    /** Retain only the LoopContainer owner whose manager is still on the active editor path. */
    retainNestedEditingController(
        controller: AbstractDesignerController,
        layerId: string,
        managerStack: readonly unknown[],
    ): boolean {
        const candidate = controller as AbstractDesignerController & {manager?: object; config?: {base?: {id?: string; type?: string}}};
        return Boolean(this.layerConfigs[layerId]
            && this.layerConfigs[layerId].type === 'LoopContainer'
            && this.controllers[layerId] === controller
            && candidate.config?.base?.id === layerId
            && candidate.config?.base?.type === 'LoopContainer'
            && candidate.manager
            && managerStack.includes(candidate.manager)
            && this.nestedEditingControllers.add(controller));
    }

    isNestedEditingController(controller: AbstractDesignerController | undefined): boolean {
        return Boolean(controller && this.nestedEditingControllers.has(controller));
    }

    /** Drop a retained navigation owner after its persisted manager snapshot has been copied. */
    releaseNestedEditingController(controller: AbstractDesignerController): boolean {
        if (!this.nestedEditingControllers.has(controller)) return false;
        this.destroyController(controller);
        return true;
    }

    /** Record the framework-owned binding for a rendered component controller. */
    registerComponentControllerBinding(
        controller: AbstractDesignerController,
        layerId: string,
        renderKey: string,
        definition: object,
        bpExecutor: object | null,
        index?: number,
    ): void {
        if (renderKey !== this.getRenderKey(layerId)) return;
        const entityToken = this.getRuntimeEntityToken(layerId);
        if (!entityToken) return;
        this.componentControllerBindings.set(controller, {layerId, renderKey, entityToken, definition, bpExecutor, index});
    }

    /**
     * Recognize only a replacement created by ComponentContainer for the same rendered entity.
     * Manually supplied controllers have no binding record and remain strict identity mismatches.
     */
    isControllerContinuation(
        layerId: string,
        previous: object | undefined,
        current: object | undefined,
    ): boolean {
        if (!previous || !current || previous === current) return false;
        if (!this.destroyedControllers.has(previous) || this.destroyedControllers.has(current)) return false;
        const before = this.componentControllerBindings.get(previous);
        const after = this.componentControllerBindings.get(current);
        const currentEntityToken = this.getRuntimeEntityToken(layerId);
        return Boolean(before && after
            && before.layerId === layerId && after.layerId === layerId
            && before.entityToken === after.entityToken
            && after.entityToken === currentEntityToken
            && before.definition === after.definition
            && before.bpExecutor === after.bpExecutor
            && before.index === after.index);
    }

    /**
     * 删除元素
     */
    delItem = (ids: string[]) => {
        for (const id of ids) {
            // LoopContainer renders one controller instance per row. Besides
            // the canonical id, ComponentContainer registers each instance as
            // `${id}_${index}`. Deleting only the canonical entry leaves the
            // remaining row controllers and their subscriptions alive.
            const controllerEntries = Object.entries(this.controllers).filter(
                ([key, controller]) => key === id || controller?.config?.base?.id === id
            );
            const controllers = new Set(controllerEntries.map(([, controller]) => controller));
            controllers.forEach((controller) => this.destroyController(controller));
            controllerEntries.forEach(([key]) => delete this.controllers[key]);
            delete this.layerConfigs[id];
            this.renderGenerations.delete(id);
            this.layerEntityTokens.delete(id);
        }
    };

    /**
     * 更新布局
     */
    updateLayer = (items: ILayerItem[], reRender: boolean = true) => {
        for (const item of items) {
            const oldItem = this.layerConfigs[item.id + ""];
            if (!isEqual(oldItem, item))
                this.layerConfigs[item.id + ""] = reRender ? {...ObjectUtil.merge(oldItem, item)} : ObjectUtil.merge(oldItem, item);
        }
    };

    /**
     * 直接更新当前画布内容。
     * payload 数组的顺序就是最终的链表顺序。
     * 如果需要在同一批次里表达分组或层级关系，可以把 layer.id 作为批次内引用键使用；
     * 最终写入画布的 id 仍由 updater 内部统一生成。
     * replace: 全量替换当前画布内容
     * append: 以追加方式将新批次插入当前画布前端
     * patch: 仅更新画布中已存在图层；传 layer 时更新布局，传 config 时合并配置，不调整链表关系
     */
    updateCanvasContent  = (
        payload: ICanvasContentUpdatePayload[],
        mode: CanvasContentUpdateMode = "replace"
    ): ICanvasContentUpdateResult => {
        const result = canvasContentUpdater.updateCanvasContent(this, payload, mode);
        return result;
    };

    reRenderLayer = () => runInAction(() => this.layerConfigs = {...this.layerConfigs});

    /**
     * 直接删除只能删除type = group的图层数据，要同时删除组件布局数据，需要调用delItem
     * @param ids
     */
    delLayout = (ids: string[]) => {
        for (const id of ids) {
            if (this.layerConfigs[id] && this.layerConfigs[id].type === "group") {
                delete this.layerConfigs[id];
                this.renderGenerations.delete(id);
                this.layerEntityTokens.delete(id);
            }
        }
    }

    flashGlobalTheme = (newTheme: IThemeItem) => {
        this.controllers && Object.keys(this.controllers).forEach((key: string) => {
            const instance = this.controllers[key];
            if (instance)
                instance.updateTheme(newTheme);
        });
    };


    /**
     * 获取store数据
     */
    getData(): ILayerManager {
        return {
            layerHeader: this.layerHeader,
            layerTail: this.layerTail,
            layerConfigs: toJS(this.layerConfigs),
            elemConfigs: Object.keys(this.layerConfigs).reduce((pre, key) => {
                const controllerConfig = this.controllers[key]?.getConfig?.();
                if (controllerConfig != null) {
                    pre[key] = controllerConfig;
                    return pre;
                }
                const cachedConfig = this.elemConfigs?.[key];
                if (cachedConfig != null)
                    pre[key] = toJS(cachedConfig);
                return pre;
            }, {} as Record<string, any>),
        };
    }

    public init(data: ILayerManager): void {
        this.layerEntityTokens.clear();
        this.elemConfigs = data.elemConfigs || this.elemConfigs;
        this.layerConfigs = data.layerConfigs || this.layerConfigs;
        this.layerHeader = data.layerHeader || this.layerHeader;
        this.layerTail = data.layerTail || this.layerTail;
    }

    public destroy(): void {
        const errors: unknown[] = [];
        new Set(Object.values(this.controllers)).forEach((controller) => {
            try { this.destroyController(controller); } catch (error) { errors.push(error); }
        });
        this.controllers = {};
        this.elemConfigs = {};
        this.layerConfigs = {};
        this.renderGenerations.clear();
        this.layerEntityTokens.clear();
        this.layerHeader = undefined;
        this.layerTail = undefined;
        if (errors.length) throw new AggregateError(errors, 'Failed to destroy layer controllers.');
    }
}

export default LayerManager;
