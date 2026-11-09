/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";

/**
 * 撤销回滚抽象接口定义
 */
export default abstract class AbstractRollback {
    /**
     * 撤销
     */
    public abstract undo(record: IHistoryRecord): void;

    /**
     * 重做
     */
    public abstract redo(record: IHistoryRecord): void;
}
