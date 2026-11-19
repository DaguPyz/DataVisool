/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import {IHistoryRecord, IOrderOperateData} from "@/plugins/editor-canvas/history/OperateType";
import type {EventOperateStore} from '@/plugins/editor-canvas/state/EventOperateStore.ts';

/**
 * hide, lock, order的撤销与回滚操作实现
 */
export class OrderRollBackImpl extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }

    redo(record: IHistoryRecord): void {
        if (!this.eventOperateStore.isActive()) return;
        const {next} = record;
        const {updateLayer} = this.eventOperateStore.readLegacyModel()!.layerManager
        if (next) updateLayer(next as IOrderOperateData[]);
    }

    undo(record: IHistoryRecord): void {
        if (!this.eventOperateStore.isActive()) return;
        const {prev} = record;
        const {updateLayer} = this.eventOperateStore.readLegacyModel()!.layerManager
        if (prev) updateLayer(prev as IOrderOperateData[]);
    }

}

