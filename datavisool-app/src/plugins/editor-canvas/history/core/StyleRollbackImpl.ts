/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import {IHistoryRecord, IUpdStyleOperateData} from "@/plugins/editor-canvas/history/OperateType";
import {cloneDeep} from "lodash";
import {ObjectUtil} from "@datavisool/sdk";
import type {EventOperateStore} from '@/plugins/editor-canvas/state/EventOperateStore.ts';

export class StyleRollbackImpl extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }
    private applyStatusConfig(instance: any, dataRecord: IUpdStyleOperateData): void {
        const {status} = dataRecord;
        if (!status?.id)
            return;
        const statusItem = instance.config?.status?.[status.id];
        if (!statusItem)
            return;
        if (status.replaceAll) {
            statusItem.config = cloneDeep(status.data);
            return;
        }
        const statusConfig = statusItem.config;
        if (!statusConfig)
            return;
        if (status.replaceKeys?.length) {
            status.replaceKeys.forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(status.data, key))
                    statusConfig[key] = cloneDeep(status.data[key]);
                else
                    delete statusConfig[key];
            });
            return;
        }
        ObjectUtil.merge(statusConfig, status.data);
    }

    private applyConfig(dataRecord: IUpdStyleOperateData): void {
        const {layerManager} = this.eventOperateStore.readLegacyModel()!;
        const {id, data, replaceKeys} = dataRecord;
        const {controllers} = layerManager;
        const instance = controllers[id];
        if (!instance)
            return;
        if (replaceKeys?.length && instance.config) {
            const currentConfig = instance.config as Record<string, any>;
            replaceKeys.forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(data, key))
                    currentConfig[key] = cloneDeep(data[key]);
                else
                    delete currentConfig[key];
            });
        }
        instance.update(data);
        this.applyStatusConfig(instance, dataRecord);
        if (replaceKeys?.includes('filter') || Object.prototype.hasOwnProperty.call(data, 'filter'))
            instance.updateFilter(Object.prototype.hasOwnProperty.call(data, 'filter') ? data.filter : undefined);
    }

    redo(record: IHistoryRecord): void {
        if (!this.eventOperateStore.isActive()) return;
        const {next} = record;
        if (next) {
            this.applyConfig(next as IUpdStyleOperateData);
            this.eventOperateStore.emitInspectorChange({kind: 'configs-restored', ids: [(next as IUpdStyleOperateData).id]});
        }
    }

    undo(record: IHistoryRecord): void {
        if (!this.eventOperateStore.isActive()) return;
        const {prev} = record;
        if (prev) {
            this.applyConfig(prev as IUpdStyleOperateData);
            this.eventOperateStore.emitInspectorChange({kind: 'configs-restored', ids: [(prev as IUpdStyleOperateData).id]});
        }
    }

}

