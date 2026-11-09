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
import canvasContentUpdater from "@/designer/manager/util/CanvasContentUpdater.ts";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import rightStore from "@/designer/right/RightStore.ts";

/**
 * 设计器核心状态管理类，记录了设计器中的核心数据。包括组件配置，组件布局。 全局设置等。
 */
class LayerManager extends AbstractManager<ILayerManager> {

    constructor() {
        super();
        makeObservable(this, {
            layerConfigs: observable.shallow,
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
    addItem = (layer: ILayerItem) => this.layerConfigs[layer.id + ""] = layer;

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
            controllers.forEach((controller) => controller.destroy());
            controllerEntries.forEach(([key]) => delete this.controllers[key]);
            delete this.layerConfigs[id];
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
        if (mode === "replace") {
            eventOperateStore.setTargetIds([]);
            rightStore.activeConfig(null, "");
            eventOperateStore.focusDesignerCanvas();
        }
        return result;
    };

    reRenderLayer = () => runInAction(() => this.layerConfigs = {...this.layerConfigs});

    /**
     * 直接删除只能删除type = group的图层数据，要同时删除组件布局数据，需要调用delItem
     * @param ids
     */
    delLayout = (ids: string[]) => {
        for (const id of ids) {
            if (this.layerConfigs[id] && this.layerConfigs[id].type === "group")
                delete this.layerConfigs[id];
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
        this.elemConfigs = data.elemConfigs || this.elemConfigs;
        this.layerConfigs = data.layerConfigs || this.layerConfigs;
        this.layerHeader = data.layerHeader || this.layerHeader;
        this.layerTail = data.layerTail || this.layerTail;
    }

    public destroy(): void {
        Object.values(this.controllers).forEach((c) => c.destroy());
        this.controllers = {};
        this.elemConfigs = {};
        this.layerConfigs = {};
        this.layerHeader = undefined;
        this.layerTail = undefined;
    }
}

export default LayerManager;
