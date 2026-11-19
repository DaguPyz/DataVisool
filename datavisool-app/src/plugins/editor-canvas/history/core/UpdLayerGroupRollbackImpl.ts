/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import {IHistoryRecord} from "@/plugins/editor-canvas/history/OperateType";
import {cloneDeep} from "lodash";
import {ILayerItem} from "@datavisool/sdk/types";
import type {EventOperateStore} from '@/plugins/editor-canvas/state/EventOperateStore.ts';


/**
 * 图层编组和解除编组不能简单的认为只需要调用doGrouping和doUnGrouping即可。撤销和重做的额过程中，图层对应的设置项也要完整的撤销和重做
 */
export class UpdLayerGroupRollbackImpl extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }

    redo(record: IHistoryRecord): void {
        if (!this.eventOperateStore.isActive()) return;
        const {next} = record;
        if (next) {
            const {layerManager} = this.eventOperateStore.readLegacyModel()!;
            const updData: ILayerItem[] = [];
            (next as ILayerItem[]).forEach((item) => {
                if ('id' in item)
                    updData.push(cloneDeep(item));
                if ('layerHeader' in item)
                    layerManager.layerHeader = item.layerHeader as string;
                if ('layerTail' in item)
                    layerManager.layerTail = item.layerTail as string;
            });
            const {updateLayer} = layerManager;
            updateLayer(updData);
            updData.forEach(item => {
                if (Object.prototype.hasOwnProperty.call(item, 'name'))
                    layerManager.controllers?.[item.id!]?.update({base: {name: item.name}}, {reRender: false});
            });
        }
    }

    undo(record: IHistoryRecord): void {
        if (!this.eventOperateStore.isActive()) return;
        const {prev} = record;
        if (prev) {
            const {layerManager} = this.eventOperateStore.readLegacyModel()!;
            const updData: ILayerItem[] = [];
            (prev as ILayerItem[]).forEach((item) => {
                if ('id' in item)
                    updData.push(cloneDeep(item));
                if ('layerHeader' in item)
                    layerManager.layerHeader = item.layerHeader as string;
                if ('layerTail' in item)
                    layerManager.layerTail = item.layerTail as string;

            });
            const {updateLayer} = layerManager;
            updateLayer(updData);
            updData.forEach(item => {
                if (Object.prototype.hasOwnProperty.call(item, 'name'))
                    layerManager.controllers?.[item.id!]?.update({base: {name: item.name}}, {reRender: false});
            });
        }
    }

}

