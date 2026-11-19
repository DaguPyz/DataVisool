/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import {IBPTaskInfo} from "@/plugins/designer-runtime/internal/designer/blueprint/IBPTyps.ts";
import {NodeInfoType} from "@datavisool/sdk/types";
import {ObjectUtil} from "@datavisool/sdk";
import type {DesignerBlueprintNodeMetadataContext} from '@datavisool/sdk/plugin/contracts/editorBlueprint';


/**
 * 抽象蓝图节点控制器
 */
export abstract class AbstractBPNodeController<C = any> {
    public config: C | null = null;
    private readonly configListeners = new Set<() => void>();
    private metadataContext?: DesignerBlueprintNodeMetadataContext;

    /**
     * 定义统一构造器，子类不需要再定义构造器
     * @param config
     */
    constructor(config?: C, metadataContext?: DesignerBlueprintNodeMetadataContext) {
        if (config)
            this.config = config;
        this.metadataContext = metadataContext;
    }

    protected readSceneNodeInfo(type: 'BPLayerNode' | 'BPGlobalVariableNode', nodeId: string): NodeInfoType | null {
        const context = this.metadataContext;
        if (!context?.isActive()) return null;
        return context.readNodeInfo(type, nodeId);
    }

    /**
     * 蓝图节点执行器，当执行蓝图节点构建的逻辑路径时，不同的节点根据该方法执行自己内部对应的逻辑解析方案，并产生对应的输出
     * @param taskInfo 当前任务信息
     * @param params 节点间传递的参数
     */
    public abstract execute(taskInfo: IBPTaskInfo, params: any): void;

    public abstract getConfig(): C | null;

    /**
     * 获取蓝图节点的配置信息
     */
    public abstract getNodeInfo(nodeId?: string): NodeInfoType | null;

    /**
     * 蓝图节点更新模板方法。
     * 统一处理配置合并与订阅通知，子类只需要覆写 afterUpdate 扩展额外逻辑。
     */
    public update(config: object, upOp?: UpdateOptions): void {
        this.config = ObjectUtil.merge(this.config, config) as C;
        this.afterUpdate(config as Partial<C>, upOp);
        for (const listener of [...this.configListeners]) {
            try {
                listener();
            } catch (error) {
                console.error('蓝图节点配置订阅更新失败', error);
            }
        }
    }

    public subscribe(listener: () => void): () => void {
        this.configListeners.add(listener);
        return () => {
            this.configListeners.delete(listener);
        };
    }

    /**
     * 子类更新后的扩展钩子。
     * 默认空实现，避免各个节点重复写同样的 update 入口。
     */
    protected afterUpdate(_config: Partial<C>, _upOp?: UpdateOptions): void {
    }

    /**
     * 判断当前节点是否启用。
     * 默认启用，只有 enabled === false 时才视为关闭。
     */
    public isEnabled(): boolean {
        return (this.config as { enabled?: boolean } | null)?.enabled !== false;
    }

    public destroy(): void {
        this.configListeners.clear();
        this.metadataContext = undefined;
        this.config = null;
    }
}
