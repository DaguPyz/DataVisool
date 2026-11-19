/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import type {EventOperateStore} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import {IHideOperateData, IHistoryRecord} from "@/plugins/editor-canvas/history/OperateType";

/**
 * hide, lock, order的撤销与回滚操作实现
 */
export class HideRollbackImpl extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }

    redo(record: IHistoryRecord): void {
        if (!record || !this.eventOperateStore.isActive()) return;
        const {next} = record;
        const {updateLayer} = this.eventOperateStore.readLegacyModel()!.layerManager
        if (next)
            updateLayer(next as IHideOperateData[]);
        this.refreshSelection();
    }

    undo(record: IHistoryRecord): void {
        if (!record || !this.eventOperateStore.isActive()) return;
        const {prev} = record;
        const {updateLayer} = this.eventOperateStore.readLegacyModel()!.layerManager
        if (prev)
            updateLayer(prev as IHideOperateData[]);
        this.refreshSelection();
    }

    private refreshSelection = () => {
        this.eventOperateStore.setTargetIds(this.eventOperateStore.targetIds, this.eventOperateStore.selectionSource);
        this.eventOperateStore.interactionRef?.refreshOverlay?.();
    };

}

