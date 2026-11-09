/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import {IHistoryRecord, IUpdStyleOperateData} from "@/designer/operate-provider/undo-redo/OperateType";
import rightStore from "@/designer/right/RightStore";
import {cloneDeep} from "lodash";
import componentDataGvParser from "@/designer/left/global-variable/parse/ComponentDataGvParser.ts";
import {ObjectUtil} from "@datavisool/sdk";

export class StyleRollbackImpl extends AbstractRollback {
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
        const {layerManager} = window.DATAVISOOL_ENV.currentManager;
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
        if (replaceKeys?.includes('data') || Object.prototype.hasOwnProperty.call(data, 'data')) {
            componentDataGvParser.unbindFromGv([id]);
            if (instance.getConfig()?.data)
                componentDataGvParser.bindConfigToGv(instance);
        }
    }

    private remountConfigPanel(): void {
        const {visible, setContentVisible} = rightStore;
        //回滚时，若配置项开启，则关闭
        if (visible) {
            setContentVisible(false)
            const tempTimer = setTimeout(() => {
                setContentVisible(true);
                clearTimeout(tempTimer);
            }, 1)
        }
    }

    redo(record: IHistoryRecord): void {
        const {next} = record;
        if (next) {
            this.applyConfig(next as IUpdStyleOperateData);
            this.remountConfigPanel();
        }
    }

    undo(record: IHistoryRecord): void {
        const {prev} = record;
        if (prev) {
            this.applyConfig(prev as IUpdStyleOperateData);
            this.remountConfigPanel();
        }
    }

}

const styleRollbackImpl = new StyleRollbackImpl();
export default styleRollbackImpl;
