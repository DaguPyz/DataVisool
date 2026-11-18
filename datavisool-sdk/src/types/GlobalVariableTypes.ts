/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {DataConfigType} from "./DataSourceTypes.ts";

export interface IGlobalVariableManager {
    globalVariables: Record<string, IGlobalVariable>;
}

export interface IGlobalVariable {
    /**
     * 全局变量id
     */
    id?: string;
    /**
     * 全局变量key
     */
    key?: string;
    /**
     * 全局变量值
     */
    value?: any;
    /**
     * 触发源，支持设计器自带的所有数据源触发修改全局变量的值
     */
    triggerSource?: DataConfigType;
    /**
     * 绑定目标，记录当前变量已经绑定了那些目标，比如组件的数据源中使用了全局变量
     */
    bindTarget?: string[];
    /**
     * 更新全局变量数据时，是否主动触发绑定该变量的组件重新渲染
     */
    reRender?: boolean;
}