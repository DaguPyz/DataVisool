/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import {IHistoryRecord, IOrderOperateData} from "@/designer/operate-provider/undo-redo/OperateType";

/**
 * hide, lock, order的撤销与回滚操作实现
 */
export class OrderRollBackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const {next} = record;
        const {updateLayer} = window.DATAVISOOL_ENV.currentManager.layerManager
        if (next) updateLayer(next as IOrderOperateData[]);
    }

    undo(record: IHistoryRecord): void {
        const {prev} = record;
        const {updateLayer} = window.DATAVISOOL_ENV.currentManager.layerManager
        if (prev) updateLayer(prev as IOrderOperateData[]);
    }

}

const orderRollBackImpl = new OrderRollBackImpl();
export default orderRollBackImpl;
