/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractManager from "./core/AbstractManager.ts";
import CanvasManager from "../header/items/canvas/CanvasManager.ts";
import ThemeManager from "../header/items/theme/ThemeManager.ts";
import BluePrintManager, {type RuntimeBlueprintControllerRegistry} from "../blueprint/manager/BluePrintManager.ts";
import LayerManager from "./LayerManager.ts";
import BPExecutor from "../blueprint/core/BPExecutor.ts";
import GlobalVariableManager from "./GlobalVariableManager.ts";
import GlobalFilterManger from "./GlobalFilterManger.ts";
import {DesignerMode, DesignerScene, IDesignerManager} from "@datavisool/sdk/types";
import {ISelectOption} from "@datavisool/ui";
import {cloneDeep} from "lodash";
import EventUtil from "@/plugins/designer-runtime/internal/designer/blueprint/util/EventUtil.ts";
import {disposeBlueprintRuntimeResources} from '@/plugins/designer-runtime/internal/designer/blueprint/core/BlueprintRuntimeResources.ts';
import {makeObservable, observable} from 'mobx';
import type DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';

/**
 * 整个设计器的所有数据初始化和数据聚合，统一通过该管理器进行分发和处理
 */
export default class DesignerManager extends AbstractManager<IDesignerManager> {
    private runtimeGeneration = 0;
    private runtimeActive = true;
    public runtimeContext?: DesignerRuntimeContext;

    constructor(scene: DesignerScene, runtimeContext?: DesignerRuntimeContext) {
        super();
        this.scene = scene;
        this.attachRuntimeContext(runtimeContext);
        makeObservable(this, {name: observable});
    }

    public attachRuntimeContext(runtimeContext?: DesignerRuntimeContext): void {
        if (this.runtimeContext === runtimeContext) return;
        this.runtimeContext?.unregisterManager(this);
        this.runtimeContext = runtimeContext;
        runtimeContext?.registerManager(this);
    }

    //项目id
    public id: string | null = null;
    //项目名称
    public name: string | null = null;
    //场景
    public scene: DesignerScene | null = null;
    //画布管理器
    public canvasManager = new CanvasManager();
    //图层管理器
    public layerManager = new LayerManager();
    //主题管理器
    public themeManager = new ThemeManager();
    //蓝图管理器
    public bluePrintManager = new BluePrintManager();
    //全局滤镜管理器
    public globalFilterManger = new GlobalFilterManger();
    //全局变量管理器
    public globalVariableManager = new GlobalVariableManager();
    // 循环容器共享其所属页面的变量作用域。
    public variableOwner?: DesignerManager;
    //蓝图事件执行器
    public bpExecutor: BPExecutor = new BPExecutor(this);
    //字体列表
    public fonts: ISelectOption[] = [];
    //总计需要创建的组件数量
    public total: number = 0;

    public getRuntimeGeneration = (): number => this.runtimeGeneration;

    public isRuntimeActive = (generation = this.runtimeGeneration): boolean =>
        this.runtimeActive && generation === this.runtimeGeneration;

    public isRuntimeEffectActive = (generation = this.runtimeGeneration): boolean =>
        this.isRuntimeActive(generation) && !this.runtimeContext?.effectsPaused;

    public destroy = (): void => {
        if (!this.runtimeActive) return;
        this.runtimeActive = false;
        this.runtimeGeneration++;
        const errors: unknown[] = [];
        [
            () => EventUtil.cancelGlobalEvent(this),
            () => disposeBlueprintRuntimeResources(this),
            () => this.canvasManager.destroy(),
            () => this.layerManager.destroy(),
            () => this.themeManager.destroy(),
            () => this.bluePrintManager.destroy(),
            () => this.globalFilterManger.destroy(),
            () => this.globalVariableManager.destroy(),
        ].forEach(cleanup => {
            try { cleanup(); } catch (error) { errors.push(error); }
        });
        this.runtimeContext?.unregisterManager(this);
        if (errors.length) throw new AggregateError(errors, 'Failed to destroy designer manager resources.');
    }

    public getData = (): IDesignerManager => {
        const data = {
            canvasManager: this.canvasManager.getData(),
            themeManager: this.themeManager.getData(),
            layerManager: this.layerManager.getData(),
            bluePrintManager: this.bluePrintManager.getData(),
            globalFilterManger: this.globalFilterManger.getData(),
            globalVariableManager: this.globalVariableManager.getData(),
        };
        return cloneDeep(data);
    }

    public init(data: IDesignerManager, mode: DesignerMode, blueprintControllers?: RuntimeBlueprintControllerRegistry): void {
        this.runtimeActive = true;
        this.runtimeGeneration++;
        const clonedData = cloneDeep(data ?? {}) as IDesignerManager;
        clonedData.id && (this.id = clonedData.id);
        clonedData.name && (this.name = clonedData.name);
        clonedData.canvasManager && this.canvasManager.init(clonedData.canvasManager!);
        clonedData.themeManager && this.themeManager.init(clonedData.themeManager!);
        clonedData.layerManager && this.layerManager.init(clonedData.layerManager!);
        this.globalFilterManger.init(clonedData.globalFilterManger);
        clonedData.globalVariableManager && this.globalVariableManager.init(clonedData.globalVariableManager!);
        const blueprints = Array.isArray(clonedData?.bluePrintManager)
            ? clonedData.bluePrintManager
            : (clonedData.bluePrintManager ? [clonedData.bluePrintManager] : []);
        this.bluePrintManager.init(blueprints, mode, blueprintControllers ?? this.runtimeContext?.registry.blueprintControllers);
    }
}
