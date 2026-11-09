/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {IAddOperateData, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import rightStore from "@/designer/right/RightStore";
import {cloneDeep} from "lodash";
import componentDataGvParser from "@/designer/left/global-variable/parse/ComponentDataGvParser.ts";


export class AddRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        if (!record) return;
        const {layerManager} = window.DATAVISOOL_ENV.currentManager;
        const {next} = record!;
        //执行正向操作添加元素
        const {addItem} = layerManager;
        const compIds: string[] = [];
        (next as IAddOperateData[]).forEach((item) => {
            if ('id' in item) {
                compIds.push(item.id!);
                addItem(cloneDeep(item.layerConfig!));
                if ('elemConfig' in item)
                    layerManager.elemConfigs![item.id!] = cloneDeep(item.elemConfig!);
            }
            if ('layerHeader' in item)
                layerManager.layerHeader = item.layerHeader;
            if ('layerTail' in item)
                layerManager.layerTail = item.layerTail;
        });
        //添加时重新计算全局变量和组件配置的绑定关系
        if (compIds.length > 0) {
            const tempTimer = setTimeout(() => {
                componentDataGvParser.bindConfigToGvById(compIds);
                clearTimeout(tempTimer);
            }, 10);
        }

    }

    undo(record: IHistoryRecord): void {
        if (!record)
            return;
        const {layerManager} = window.DATAVISOOL_ENV.currentManager;
        const {setTargetIds, focusDesignerCanvas} = eventOperateStore;
        const {prev, next} = record!;
        //执行反向操作删除元素
        const {delItem} = layerManager;
        const delIds: string[] = [];
        next && (next! as IAddOperateData[]).forEach((item) => delIds.push(item.id!));
        delItem(delIds);
        prev && (prev as IAddOperateData[]).forEach((item) => {
            if ('layerHeader' in item!)
                layerManager.layerHeader = item.layerHeader;
            if ('layerTail' in item!)
                layerManager.layerTail = item.layerTail;
        });


        //清空框选状态,避免空框选
        setTargetIds([]);
        //如果右侧属性面板展示的设置项对应的组件，正是当前被删除的组件，则卸载属性面板
        const {setContentVisible, activeConfig, activeElem} = rightStore;
        if (delIds.includes(activeElem.id!)) {
            setContentVisible(false);
            activeConfig(null, "");
        }
        //删除元素后重新聚焦画布
        focusDesignerCanvas();
        const tempTimer = setTimeout(() => {
            //删除元素，解绑全局变量
            componentDataGvParser.unbindFromGv(delIds);
            clearTimeout(tempTimer);
        }, 10);
    }

}

const addRollbackImpl = new AddRollbackImpl();
export default addRollbackImpl;
