/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {IDelOperateData, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import {cloneDeep} from "lodash";
import componentDataGvParser from "@/designer/left/global-variable/parse/ComponentDataGvParser.ts";

export class DelRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        if (!record) return;
        const {layerManager} = window.DATAVISOOL_ENV.currentManager;
        const {prev, next} = record!;
        const layerData: IDelOperateData[] = [];
        (prev as IDelOperateData[]).forEach((item) => {
            if ('id' in item)
                layerData.push(item);
        });

        //执行正向操作删除元素
        const {delItem} = layerManager;
        const delIds: string[] = [];
        layerData.forEach((item) => delIds.push(item.id!));
        delItem(delIds);
        //恢复下一个状态的头尾指针指向
        next && (next as IDelOperateData[]).forEach((item) => {
            if ('layerHeader' in item)
                layerManager.layerHeader = item.layerHeader;
            if ('layerTail' in item)
                layerManager.layerTail = item.layerTail;
        });

        const {setTargetIds, focusDesignerCanvas} = eventOperateStore;
        //清空框选状态,避免空框选
        setTargetIds([]);
        //删除元素后重新聚焦画布
        focusDesignerCanvas();
        const tempTimer = setTimeout(() => {
            //删除元素，解绑全局变量
            componentDataGvParser.unbindFromGv(delIds);
            clearTimeout(tempTimer);
        }, 10);
    }

    undo(record: IHistoryRecord): void {
        if (!record) return;
        const {layerManager} = window.DATAVISOOL_ENV.currentManager;
        const {setTargetIds} = eventOperateStore;
        const {prev} = record!;
        //区分开图层数据和指针数据
        const layerData: IDelOperateData[] = [];
        const pointerData: IDelOperateData[] = [];
        (prev as IDelOperateData[]).forEach((item) => {
            if ('id' in item)
                layerData.push(item);
            else
                pointerData.push(item);
        });

        //执行反向操作添加元素
        const {addItem, elemConfigs} = layerManager;
        const targetIds: string[] = [];
        layerData.forEach((item) => {
            addItem(cloneDeep(item.layerConfig!));
            elemConfigs![item.id!] = item.elemConfig;
            targetIds.push(item.id!);
        });

        //恢复上一个状态的头尾指针指向
        pointerData.forEach((item) => {
            if ('layerHeader' in item)
                layerManager.layerHeader = item.layerHeader;
            if ('layerTail' in item)
                layerManager.layerTail = item.layerTail;
        });

        //选中目标元素，React18推出了新的批处理和并发执行机制，导致之前17版本中部分逻辑代码的执行顺序发生了变化，因此这里需要将反向执行操作放到下一个事件循环中执行
        Promise.resolve().then(() => setTargetIds(targetIds));

        const tempTimer = setTimeout(() => {
            //添加元素,重新计算组件配置和全局变量的绑定关系,由于此时controller对象还没创建完毕，因此将这个操作放到下一次事件循环中。
            componentDataGvParser.bindConfigToGvById(targetIds);
            clearTimeout(tempTimer);
        }, 10);
    }

}

const delRollbackImpl = new DelRollbackImpl();
export default delRollbackImpl;
