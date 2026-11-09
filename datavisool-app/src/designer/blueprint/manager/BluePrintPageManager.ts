/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, runInAction} from "mobx";
import AbstractManager from "../../manager/core/AbstractManager.ts";
import {BPNodeLayoutType, IBluePrintManager, IBPLine} from "@datavisool/sdk/types";
import {IdGenerate as idGenerate} from "@datavisool/sdk";
import {AbstractBPNodeController} from "../node/core/AbstractBPNodeController.ts";

/**
 * 蓝图页面管理器（用于管理存储每一个蓝图页面的数据信息）
 */
class BluePrintPageManger extends AbstractManager<IBluePrintManager> {

    constructor() {
        super();
        makeObservable(this, {
            pageName: observable,
            bpNodeLayoutMap: observable,
            setPageName: action,
        });
    }

    pageId: string = '';

    pageName: string = '';

    //蓝图节点上锚点与锚点的映射关系，一个起始点可以链接多个终点（入库）
    bpAPMap: Record<string, string[]> = {};

    //蓝图节点锚点间连接的线条列表(入库）
    bpLines: Record<string, IBPLine> = {};

    //锚点与线条的对应关系（入库），一个锚点可以连接多条线，用于位置更新时，快速找到线条并更新线条位置
    bpAPLineMap: Record<string, string[]> = {};

    //蓝图节点布局信息映射（入库）
    bpNodeLayoutMap: Record<string, BPNodeLayoutType> = {};

    /**
     * 蓝图节点的配置信息（入库）
     * 注意：该属性存储的配置信息并不是实时更新的。bpNodeConfigMap更像是一个临时缓存。只有在蓝图设计器首次加载时候才会被赋值。
     * 用于优化在非必要情况下，无需遍历蓝图中所有的节点配置信息，而是直接从缓存中获取。
     */
    bpNodeConfigMap: Record<string, any> = {};

    /**
     * 只在非编辑模式下赋值，实际蓝图事件执行的过程中使用该属性执行各个节点的逻辑
     */
    bpNodeControllers: Record<string, AbstractBPNodeController> = {};

    setPageName = (name: string) => {
        this.pageName = name;
    }

    public init(data: IBluePrintManager): void {
        let pageId = data?.pageId;
        if (!pageId)
            pageId = idGenerate.generateId();
        this.pageId = pageId;
        this.pageName = data?.pageName || '新建页面';
        this.bpAPMap = data.bpAPMap || {};
        this.bpLines = data.bpLines || {};
        this.bpAPLineMap = data.bpAPLineMap || {};
        this.bpNodeConfigMap = data.bpNodeConfigMap || {};
        runInAction(() => {
            this.bpNodeLayoutMap = data.bpNodeLayoutMap || {};
        })
    }

    public getData(): IBluePrintManager {
        return {
            pageId: this.pageId,
            pageName: this.pageName,
            bpAPMap: this.bpAPMap,
            bpLines: this.bpLines,
            bpAPLineMap: this.bpAPLineMap,
            bpNodeConfigMap: this.bpNodeConfigMap,
            bpNodeLayoutMap: this.bpNodeLayoutMap,
        }
    }

    public destroy(): void {
        this.bpAPMap = {};
        this.bpLines = {};
        this.bpAPLineMap = {};
        this.bpNodeConfigMap = {};
        this.bpNodeControllers = {};
        runInAction(() => {
            this.bpNodeLayoutMap = {};
        });
    }

}

export default BluePrintPageManger;
