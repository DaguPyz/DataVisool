/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import HistoryQueue from "./HistoryQueue";
import {IHistoryRecords} from "./OperateType";
import {getHistorySelectionIds} from "@/designer/operate-provider/selection/SelectionHistoryContext.ts";

export default class HistoryOperator {
    private queue: HistoryQueue<IHistoryRecords> = new HistoryQueue<IHistoryRecords>(100);

    public put(record: IHistoryRecords): void {
        const selectionIds = getHistorySelectionIds();
        this.queue.enqueue({
            ...record,
            actions: record.actions.map((item) => ({...item, selectionIds})),
        });
    }

    public backoff(): IHistoryRecords | null {
        return this.queue.backoff();
    }

    public forward(): IHistoryRecords | null {
        return this.queue.forward();
    }

    public reset(): void {
        this.queue.reset();
    }
}

const historyOperator = new HistoryOperator();
window.DATAVISOOL_ENV = {...window.DATAVISOOL_ENV, historyOperator}
export {historyOperator}
