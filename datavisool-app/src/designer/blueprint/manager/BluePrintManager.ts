/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, runInAction} from "mobx";
import {ObjectUtil} from "@datavisool/sdk";
import {AbstractBPNodeController} from "@/designer/blueprint/node/core/AbstractBPNodeController";
import bpLeftStore from "@/designer/blueprint/left/BPLeftStore.ts";
import AbstractManager from "@/designer/manager/core/AbstractManager.ts";
import {AnchorPointInfoType, BPNodeLayoutType, IBluePrintManager, IBPLine, IPoint} from "@datavisool/sdk/types";
import {DesignerMode} from "@datavisool/sdk/types";
import {Application, Graphics} from "pixi.js";
import BpCanvasUtil from "@/designer/blueprint/util/BpCanvasUtil.ts";
import BluePrintPageManger from "./BluePrintPageManager.ts";
import BluePrintPageManager from "./BluePrintPageManager.ts";
import bluePrintPageManager from "./BluePrintPageManager.ts";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import {IdGenerate as idGenerate} from "@datavisool/sdk";
import {globalMessage} from "@datavisool/ui";
import {retryWithInterval} from "@/util/Tooles.ts";
import bpRightStore from "@/designer/blueprint/right/BPRightStore.ts";
import {normalizeBlueprintNodeConfig} from "@/designer/blueprint/util/BPNodeEnableUtil.ts";

import type BPViewportController from '../workspace/BPViewportController';

export const MAX_BLUEPRINT_PAGE_COUNT = 2048;

export const sanitizeBluePrintPages = (data?: Array<IBluePrintManager | null | undefined>) => {
    if (!Array.isArray(data) || data.length === 0)
        return [];

    const sanitized: IBluePrintManager[] = [];
    const seenPageIds = new Set<string>();
    let duplicateCount = 0;
    let invalidCount = 0;
    let truncatedCount = 0;

    for (const item of data) {
        if (!item || typeof item !== 'object') {
            invalidCount++;
            continue;
        }

        const pageId = typeof item.pageId === 'string' ? item.pageId.trim() : '';
        if (pageId) {
            if (seenPageIds.has(pageId)) {
                duplicateCount++;
                continue;
            }
            seenPageIds.add(pageId);
        }

        if (sanitized.length >= MAX_BLUEPRINT_PAGE_COUNT) {
            truncatedCount++;
            continue;
        }

        sanitized.push(item);
    }

    if (duplicateCount > 0 || invalidCount > 0 || truncatedCount > 0) {
        console.warn(
            `[BluePrintManager] sanitized blueprint pages: kept=${sanitized.length}, duplicates=${duplicateCount}, invalid=${invalidCount}, truncated=${truncatedCount}`
        );
    }

    return sanitized;
};


class BluePrintManager extends AbstractManager<IBluePrintManager[]> {

    constructor() {
        super();
        makeObservable(this, {
            currentPageManager: observable,
            bpPageMangers: observable,
            selectedNodes: observable,
            selectedNodeIds: observable,
            selectedLines: observable,
            canvasScale: observable,
            viewportController: observable.ref,
            setViewportController: action,
            setSelectedNodes: action,
            setSelectedNodeIds: action,
            setSelectedLines: action,
            addBPNodeLayout: action,
            updBpNodeLayout: action,
            setCanvasScale: action,
            addNewPage: action,
            setCurrentPage: action,
            deleteBptPage: action
        });

    }

    /**
     * 当前编辑的蓝图页面
     */
    currentPageManager: BluePrintPageManger | null = null;

    /**
     * 蓝图子页面信息
     */
    bpPageMangers: BluePrintPageManger[] = [];

    //蓝图节点控制器实例映射
    currPageNodeControllers: Record<string, AbstractBPNodeController> = {};

    //被选中的蓝图节点列表
    selectedNodes: HTMLElement[] = [];

    //被选中的节点id列表
    selectedNodeIds: string[] = [];

    //被选中的线条列表
    selectedLines: string[] = [];

    //节点容器
    nodeContainerRef: HTMLDivElement | null = null;

    //蓝图拖拽容器dom引用
    bpDragContentRef: HTMLDivElement | null = null;

    // 蓝图视口的 client 原点，由挂载后的实际视口测量更新。
    canvasOffset: IPoint = {x: 0, y: 0};

    //蓝图画布拖拽后的偏移量
    canvasTranslate: IPoint = {x: 0, y: 0};

    //蓝图画布缩放比例
    canvasScale: number = 1;

    // 蓝图画布挂载期间使用，不写入项目数据。
    viewportController: BPViewportController | null = null;

    setViewportController = (controller: BPViewportController | null) => {
        this.viewportController = controller;
    };

    //pixijs 线段实例
    lineInstances: Record<string, Graphics> = {};

    //pixijs 应用实例
    pixiApp: Application | null = null;

    private clearRuntimeState = (preserveRefs: boolean) => {
        this.setViewportController(null);
        Object.values(this.lineInstances).forEach((graphic) => {
            if (graphic) {
                graphic.removeAllListeners();
                graphic.clear();
                graphic.destroy();
            }
        });
        this.lineInstances = {};
        this.currPageNodeControllers = {};
        this.selectedNodes = [];
        this.selectedLines = [];
        this.selectedNodeIds = [];
        this.currentPageManager = null;
        this.canvasTranslate = {x: 0, y: 0};
        this.canvasScale = 1;
        this.bpPageMangers.forEach(pageManager => pageManager.destroy());
        runInAction(() => {
            this.bpPageMangers = [];
        });
        bpLeftStore.resetUsedNodes();

        if (this.pixiApp) {
            this.pixiApp.destroy();
            this.pixiApp = null;
        }

        if (!preserveRefs) {
            this.nodeContainerRef = null;
            this.bpDragContentRef = null;
        }
    }

    /**
     * 关闭蓝图视图时使用，只清理运行时实例和交互状态，保留页面数据。
     * 这样重新进入蓝图页面时不需要重新构建数据源。
     */
    public closeView = () => {
        this.setViewportController(null);
        this.collectCurrentPageNodeConfig();
        this.setSelectedNodes([]);
        this.setSelectedLines([]);
        this.setSelectedNodeIds([]);
        this.currPageNodeControllers = {};
        this.lineInstances = {};
        this.canvasTranslate = {x: 0, y: 0};
        this.canvasScale = 1;
        this.nodeContainerRef = null;
        this.bpDragContentRef = null;
    }

    setBpDragContentRef = (ref: HTMLDivElement) => this.bpDragContentRef = ref;

    addBPNodeLayout = (layout: BPNodeLayoutType) => {
        if (!this.currentPageManager)
            return;
        this.currentPageManager.bpNodeLayoutMap[layout.id!] = layout;
    }

    updBpNodeLayout = (layout: BPNodeLayoutType) => {
        if (!this.currentPageManager)
            return;
        const oldLayout = this.currentPageManager.bpNodeLayoutMap[layout.id!];
        if (oldLayout)
            ObjectUtil.merge(oldLayout, layout);
    }

    setSelectedLines = (lines: string[]) => {
        this.selectedLines = lines;
    }

    setSelectedNodeIds = (ids: string[]) => {
        this.selectedNodeIds = ids;
    }

    addAPLineMap = (anchorId: string, lineId: string) => {
        if (!this.currentPageManager)
            return;
        if (!this.currentPageManager.bpAPLineMap[anchorId])
            this.currentPageManager.bpAPLineMap[anchorId] = [];
        this.currentPageManager.bpAPLineMap[anchorId].push(lineId);
    }

    delAPLineMap = (anchorId: string, lineId: string) => {
        if (!this.currentPageManager)
            return;
        if (this.currentPageManager.bpAPLineMap[anchorId]) {
            const index = this.currentPageManager.bpAPLineMap[anchorId].indexOf(lineId);
            if (index !== -1)
                this.currentPageManager.bpAPLineMap[anchorId].splice(index, 1);
            //如果锚点没有连接的线条了，就删除这个锚点
            if (this.currentPageManager.bpAPLineMap[anchorId].length === 0)
                delete this.currentPageManager.bpAPLineMap[anchorId];
        }
    }

    delAPMap = (startAnchorId: string, endAnchorId: string) => {
        if (!this.currentPageManager)
            return;
        if (this.currentPageManager.bpAPMap[startAnchorId]) {
            const index = this.currentPageManager.bpAPMap[startAnchorId].indexOf(endAnchorId);
            if (index !== -1)
                this.currentPageManager.bpAPMap[startAnchorId].splice(index, 1);
            //如果锚点已经没有关联任何其他锚点，就删除这个锚点
            if (this.currentPageManager.bpAPMap[startAnchorId].length === 0)
                delete this.currentPageManager.bpAPMap[startAnchorId];
        }
        BpCanvasUtil.updateAnchorsColor(startAnchorId, endAnchorId, '#333333')
    }

    //更新线段的位置
    updLinePos = (line: IBPLine) => {
        if (!this.currentPageManager)
            return;
        const oldLine = this.currentPageManager.bpLines[line.id!];
        if (oldLine) {
            oldLine.startPoint = line.startPoint;
            oldLine.endPoint = line.endPoint;
        }
    }

    addAPMap = (startAnchorId: string, endAnchorId: string) => {
        if (!this.currentPageManager)
            return;
        if (!this.currentPageManager.bpAPMap[startAnchorId])
            this.currentPageManager.bpAPMap[startAnchorId] = [];
        this.currentPageManager.bpAPMap[startAnchorId].push(endAnchorId);
    }

    /**
     * 判断锚点之间的连线是否已经存在
     * @param startAnchorId 锚点起始点
     * @param endAnchorId 锚点结束点
     */
    isRepeatLine = (startAnchorId: string, endAnchorId: string): boolean => {
        if (!this.currentPageManager)
            throw new Error('当前页面不存在');
        return this.currentPageManager.bpAPMap[startAnchorId] && this.currentPageManager.bpAPMap[startAnchorId].indexOf(endAnchorId) !== -1;
    }

    /**
     * 添加连接线并建立锚点、连线关系
     * @param line
     */
    addLine = (line: IBPLine) => {
        if (!this.currentPageManager)
            return;
        this.currentPageManager.bpLines[line.id!] = line;
    }

    setCanvasScale = (scale: number) => {
        this.canvasScale = scale;
    }

    setCanvasTranslate = (translate: IPoint) => {
        if (translate)
            this.canvasTranslate = translate;
    }

    setSelectedNodes = (nodes: HTMLElement[]) => {
        //清理旧的选中节点的样式
        this.selectedNodes.forEach(node => {
            node.style.border = "2px solid #00000000";
        });
        this.selectedNodes = nodes;
        //设置新的选中节点的样式
        this.selectedNodes.forEach(node => {
            node.style.border = "2px solid #4FB8FF";
        })
    }

    setNodeContainerRef = (ref: HTMLDivElement) => {
        this.nodeContainerRef = ref;
    }

    private deleteNodeFromPage = (pageManager: bluePrintPageManager, nodeId: string, removeController: boolean) => {
        const {bpNodeLayoutMap, bpNodeConfigMap, bpAPMap, bpAPLineMap} = pageManager;

        const controller = this.currPageNodeControllers[nodeId];
        const nodeConfig = controller?.getConfig() || bpNodeConfigMap[nodeId];

        if (!nodeConfig) {
            console.error(`节点${nodeId}不存在配置信息`);
            return;
        }

        const handleAnchorPoints = (aps?: AnchorPointInfoType[]) => {
            if (!aps || aps.length === 0)
                return;

            aps.forEach(ap => {
                const id = ap.id!;
                // 删除锚点映射
                if (bpAPMap[id])
                    delete bpAPMap[id];

                // 删除锚点关联线段
                const lineIds = bpAPLineMap[id];
                if (lineIds && lineIds.length > 0) {
                    this.delLine([...lineIds]); // 保持副本语义
                    delete bpAPLineMap[id];
                }
            });
        };

        // 依次处理 input / output，避免数组合并
        handleAnchorPoints(nodeConfig.input);
        handleAnchorPoints(nodeConfig.output);

        // 删除节点配置
        delete bpNodeConfigMap[nodeId];

        // 删除布局（保持 MobX 语义）
        runInAction(() => delete bpNodeLayoutMap[nodeId]);

        // 删除 controller（仅当前页）
        if (removeController)
            delete this.currPageNodeControllers[nodeId];
    }


    /**
     * 删除节点步骤：
     * 1. 如果节点关联的锚点有连线
     *  1.1 删除锚点与锚点的映射关系
     *  1.2 删除锚点与线段的映射关系
     *  1.3 删除线段
     * 2. 删除节点配置
     * 3. 删除节点布局信息
     * 4. 删除节点controller实例信息
     * @param ids
     */
    delNode = (ids: string[]) => {
        if (!ids?.length || !this.currentPageManager)
            return;
        const {activeNode, setActiveNode} = bpRightStore;
        ids.forEach(id => {
            this.deleteNodeFromPage(this.currentPageManager!, id, true);
            if (activeNode === id)
                setActiveNode(null);
        });
        this.setSelectedNodes([]);
    }

    /**
     * 该用法只用于在主编辑器下删除组件时，需要将使用到的蓝图节点一并删除的场景
     * 删除节点步骤：
     * 1. 如果节点关联的锚点有连线
     *  1.1 删除锚点与锚点的映射关系
     *  1.2 删除锚点与线段的映射关系
     *  1.3 删除线段
     * 2. 删除节点配置
     * 3. 删除节点布局信息
     * 4. 删除节点controller实例信息
     * @param ids
     */
    delNodeEveryPage = (ids: string[]) => {
        if (!ids?.length || !this.bpPageMangers?.length)
            return;
        const {activeNode, setActiveNode} = bpRightStore;
        this.bpPageMangers.forEach(pageManager => {
            const {bpNodeConfigMap, pageName} = pageManager;
            ids.forEach(id => {
                if (!bpNodeConfigMap[id]) {
                    console.error(`页面【${pageName}】不存在节点${id}配置信息`);
                    return;
                }
                this.deleteNodeFromPage(pageManager, id, false);
                if (activeNode === id)
                    setActiveNode(null);
            });
        });
        this.setSelectedNodes([]);
    };

    delLine = (ids: string[]) => {
        if (!ids || ids.length === 0 || !this.currentPageManager)
            return;
        const {bpLines} = this.currentPageManager;
        //先删除该条线段对应的锚点映射关系
        ids.forEach(id => {
            const line = bpLines[id];
            if (line)
                this.delAPMap(line.startAnchorId!, line.endAnchorId!);
            delete bpLines[id];
            //删除锚点与链接线段的映射关系
            this.delAPLineMap(line.startAnchorId!, id);
            this.delAPLineMap(line.endAnchorId!, id);
            const graphic = this.lineInstances[id];
            if (graphic) {
                graphic.removeAllListeners();
                graphic.clear();
                graphic.destroy();
            }
            delete this.lineInstances[id];
        });
        this.setSelectedLines([]);
    }

    /**
     * 收集当前蓝图子页面的节点配置
     * 在切换蓝图子页面和关闭蓝图页面的时候，都应该调用该方法
     */
    collectCurrentPageNodeConfig = () => {
        const nodeControllerKeys = Object.keys(this.currPageNodeControllers);
        if (!this.currentPageManager || nodeControllerKeys.length === 0)
            return;
        if (nodeControllerKeys.length > 0) {
            this.currentPageManager.bpNodeConfigMap = nodeControllerKeys.reduce((acc, id) => {
                acc[id] = normalizeBlueprintNodeConfig(this.currPageNodeControllers[id].getConfig());
                return acc;
            }, {} as Record<string, any>);
        }
    }

    /**
     * 新增页面
     */
    addNewPage = () => {
        const bpPageManger = new BluePrintPageManager();
        bpPageManger.pageId = idGenerate.generateId();
        bpPageManger.pageName = '新建页面';
        this.bpPageMangers.push(bpPageManger);
    }

    /**
     * 切换当前蓝图子页面
     * @param pageId
     */
    setCurrentPage = (pageId: string) => {
        const pageManager = this.bpPageMangers.find(page => page.pageId === pageId);
        if (!pageManager) {
            console.warn(`[BluePrintManager] page not found while switching blueprint page, pageId=${pageId}`);
            return;
        }
        this.currentPageManager = pageManager;
    }

    /**
     * 重置画布
     * 在切换蓝图子页面时使用
     */
    resetCanvas = () => {
        this.currPageNodeControllers = {};
        runInAction(() => this.selectedNodes = [])
        this.selectedLines = [];
        this.selectedNodeIds = [];
        Object.values(this.lineInstances).forEach((graphic) => {
            if (graphic) {
                graphic.removeAllListeners();
                graphic.clear();
                graphic.destroy();
            }
        })
        this.lineInstances = {};
    }

    /**
     * 删除页面
     * @param pageId
     */
    deleteBptPage = (pageId: string) => {
        if (!pageId || pageId === '')
            return;
        if (this.bpPageMangers.length === 1) {
            globalMessage?.messageApi?.warning('请至少保留一个页面');
            return;
        }
        this.bpPageMangers = this.bpPageMangers.filter(page => page.pageId !== pageId);
        this.loadBpPageContent(this.bpPageMangers[0].pageId);
    }

    /**
     * 加载蓝图画布内容
     * 用于点击切换画布、删除时切换画布
     * @param pageId
     */
    loadBpPageContent = (pageId: string) => {
        //1. 收集保存当前页面的节点配置信息
        this.collectCurrentPageNodeConfig();
        //2. 切换currentPageManager为目标PageManger
        const pageManager = this.bpPageMangers.find(page => page.pageId === pageId);
        if (!pageManager) {
            console.warn(`[BluePrintManager] page not found while loading blueprint content, pageId=${pageId}`);
            return;
        }
        this.currentPageManager = pageManager;
        //3. 重置画布效果
        const {resetCanvas} = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        resetCanvas();
        const {currentPageManager, currPageNodeControllers} = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const {bpNodeLayoutMap} = currentPageManager!;
        const nodeCount = Object.keys(bpNodeLayoutMap).length;
        retryWithInterval(() => {
            return Object.keys(currPageNodeControllers).length === nodeCount;
        }, 50, 50).then(() => BpCanvasUtil.reRenderAllLine())
    }

    public init(data: IBluePrintManager[], mode: DesignerMode): void {
        this.clearRuntimeState(true);
        const sanitizedPages = sanitizeBluePrintPages(data);

        if (sanitizedPages.length === 0) {
            const bpPageManger = new BluePrintPageManager();
            bpPageManger.pageId = idGenerate.generateId();
            bpPageManger.pageName = '默认页面';
            this.currentPageManager = bpPageManger;
            this.bpPageMangers.push(bpPageManger);
        } else {
            runInAction(() => {
                sanitizedPages.forEach(pageData => {
                    const pageManger = new BluePrintPageManger();
                    pageManger.init(pageData);
                    this.bpPageMangers.push(pageManger);

                    if (mode === DesignerMode.EDIT) {
                        //初始化蓝图左侧节点列表
                        const {setUsedNodes} = bpLeftStore;
                        Object.keys(pageData?.bpNodeLayoutMap || {}).forEach(key => {
                            setUsedNodes(key, true);
                        })
                    } else {
                        const nodeControllers: Record<string, AbstractBPNodeController> = {};
                        Object.values(pageManger?.bpNodeLayoutMap ?? {}).forEach((layout: BPNodeLayoutType) => {
                            const {type, id} = layout;
                            const NodeController = DesignerLoader.bpControllerMap[type!] as (new (config: any) => AbstractBPNodeController);
                            if (!NodeController) {
                                console.warn(`[BluePrintManager] missing blueprint controller for type="${type}"`);
                                return;
                            }
                            const config = normalizeBlueprintNodeConfig(pageManger?.bpNodeConfigMap![id!]);
                            nodeControllers[id!] = new NodeController!(config)!;
                        })
                        pageManger.bpNodeControllers = nodeControllers;
                    }
                })
            })
            //取第一个页面为当前页面
            this.currentPageManager = (Object.values(this.bpPageMangers)[0]);
        }
    }

    public getData(): IBluePrintManager[] {
        //收集蓝图当前页面的最新配置
        this.collectCurrentPageNodeConfig();
        //获取所有页面数据
        return Object.values(this.bpPageMangers).map(pageManager => pageManager.getData());
    }

    public destroy(): void {
        this.collectCurrentPageNodeConfig();
        this.clearRuntimeState(false);
    }

}

export default BluePrintManager;
