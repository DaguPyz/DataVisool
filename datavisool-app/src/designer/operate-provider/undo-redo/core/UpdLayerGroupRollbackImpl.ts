/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import {IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import {cloneDeep} from "lodash";
import {ILayerItem} from "@datavisool/sdk/types";


/**
 * 图层编组和解除编组不能简单的认为只需要调用doGrouping和doUnGrouping即可。撤销和重做的额过程中，图层对应的设置项也要完整的撤销和重做
 */
export class UpdLayerGroupRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const {next} = record;
        if (next) {
            const {layerManager} = window.DATAVISOOL_ENV.currentManager;
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
        }
    }

    undo(record: IHistoryRecord): void {
        const {prev} = record;
        if (prev) {
            const {layerManager} = window.DATAVISOOL_ENV.currentManager;
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
        }
    }

}

const updLayerGroupRollbackImpl = new UpdLayerGroupRollbackImpl();
export default updLayerGroupRollbackImpl;
