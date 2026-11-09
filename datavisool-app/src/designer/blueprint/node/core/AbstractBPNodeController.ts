/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractController} from "@datavisool/sdk/core";
import type {UpdateOptions} from "@datavisool/sdk/types";
import React from "react";
import {IBPTaskInfo} from "@/designer/blueprint/IBPTyps.ts";
import {NodeInfoType} from "@datavisool/sdk/types";
import {ObjectUtil} from "@datavisool/sdk";


/**
 * 抽象蓝图节点控制器
 */
export abstract class AbstractBPNodeController<C = any> extends AbstractController<any, C> {
    /**
     * 定义统一构造器，子类不需要再定义构造器
     * @param config
     */
    constructor(config?: C) {
        super();
        if (config)
            this.config = config;
    }

    /**
     * 蓝图节点执行器，当执行蓝图节点构建的逻辑路径时，不同的节点根据该方法执行自己内部对应的逻辑解析方案，并产生对应的输出
     * @param taskInfo 当前任务信息
     * @param params 节点间传递的参数
     */
    public abstract execute(taskInfo: IBPTaskInfo, params: any): void;

    /**
     * 获取蓝图节点的配置信息
     */
    public abstract getNodeInfo(nodeId?: string): NodeInfoType | null;

    /**
     * 获取节点配置组件
     */
    public abstract getConfigComponent(): React.ComponentType | null;

    /**
     * 蓝图节点更新模板方法。
     * 统一处理配置合并、启用状态同步，子类只需要覆写 afterUpdate 扩展额外逻辑。
     */
    public update(config: C, upOp?: UpdateOptions): void {
        this.config = ObjectUtil.merge(this.config, config);
        this.syncNodeEnabledState();
        this.afterUpdate(config, upOp);
    }

    /**
     * 子类更新后的扩展钩子。
     * 默认空实现，避免各个节点重复写同样的 update 入口。
     */
    protected afterUpdate(_config: C, _upOp?: UpdateOptions): void {
    }

    /**
     * 判断当前节点是否启用。
     * 默认启用，只有 enabled === false 时才视为关闭。
     */
    public isEnabled(): boolean {
        return (this.config as { enabled?: boolean } | null)?.enabled !== false;
    }

    /**
     * 同步节点启用状态到渲染层。
     * 蓝图节点壳子是独立挂载的，需要手动把配置变更推回去。
     */
    protected syncNodeEnabledState(): void {
        (this.instance as { setEnabled?: (enabled: boolean) => void } | null)?.setEnabled?.(this.isEnabled());
    }
}
