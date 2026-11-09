/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";
import DesignerManager from "./DesignerManager.ts";
import {DesignerScene} from "@datavisool/sdk/types";

/**
 * 记录当前编辑器中正在使用的项目管理器
 */
class ManagerStore {
    constructor() {
        makeObservable(this, {
            pushManager: action,
            popManager: action,
            resetManagerStack: action,
            isMainManager: observable,
            currentManager: observable,
            setCurrentManager: action
        })
    }

    designerScene: DesignerScene = DesignerScene.DEFAULT;

    /**
     * 用于存储多层级管理器，用于循环组件的嵌套场景
     */
    managerStack: DesignerManager[] = [];

    /**
     * 当前管理器是否是主项目管理器
     */
    isMainManager: boolean = true;

    /**
     * 当前管理器
     * 用于切换当前编辑的项目内容
     */
    currentManager: DesignerManager | null = null;

    /**
     * 当前场景下的最终有效管理器
     * 在编辑循环容器、子项目、默认主要项目时都有属于自己的管理器
     * 但循环容器的manger并不独立保存，而是依赖跟随主项目进行保存
     * 主项目、子项目的manger均可独立进行保存
     * 此属性的目的是保留当前的可独立保存的manager
     * 针对在子项目或循环容器中继续嵌套循环容器的时候，可以通过该属性精准获取到可独立保存的manager
     */
    currentFinalManager: DesignerManager | null = null;

    setCurrentManager(
        manager: DesignerManager,
        isMainManager?: boolean,
        designerScene?: DesignerScene
    ) {
        const nextIsMainManager = isMainManager ?? manager.scene === DesignerScene.DEFAULT;
        const nextDesignerScene = designerScene ?? manager.scene ?? this.designerScene;
        this.currentManager = manager;
        this.isMainManager = nextIsMainManager;
        this.designerScene = nextDesignerScene;
        if (manager.scene !== DesignerScene.LOOP_CONTAINER)
            this.currentFinalManager = manager;
    }

    /**
     * 重置当前活跃路径为单个根管理器。
     * 用于主项目、子项目之间切换时，避免历史 manager 残留污染后续进入的循环容器路径。
     */
    resetManagerStack(
        manager: DesignerManager,
        isMainManager?: boolean,
        designerScene?: DesignerScene
    ) {
        this.managerStack = [manager];
        this.setCurrentManager(manager, isMainManager, designerScene);
    }

    /**
     * 管理器入栈
     * 用于循环容器的嵌套场景
     * @param manager
     */
    pushManager(manager: DesignerManager) {
        const lastManager = this.managerStack[this.managerStack.length - 1];
        if (lastManager === manager)
            return;
        this.managerStack.push(manager);
        if (this.managerStack.length > 1)
            this.isMainManager = false;
    }

    /**
     * 管理器出栈
     * 用于循环容器的嵌套场景
     */
    popManager() {
        if (this.managerStack.length === 0)
            return null;
        if (this.managerStack.length === 1) {
            this.isMainManager = this.managerStack[0].scene === DesignerScene.DEFAULT;
            return this.managerStack[0];
        }
        const manager = this.managerStack.pop();
        if (this.managerStack.length === 1)
            this.isMainManager = this.managerStack[0].scene === DesignerScene.DEFAULT;
        return manager ?? null;
    }
}

const managerStore = new ManagerStore();
export default managerStore;
