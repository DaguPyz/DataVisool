/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import AbstractRollback from "./AbstractRollback";
import {IBPAddPageOperateData, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import BluePrintPageManager from "@/designer/blueprint/manager/BluePrintPageManager";
import {runInAction} from "mobx";

class BPAddPageRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const next = record?.next as IBPAddPageOperateData | null;
        if (!next?.page?.pageId) return;
        const restored = new BluePrintPageManager();
        restored.init(next.page);
        runInAction(() => {
            bpManager.bpPageMangers.splice(next.index, 0, restored);
        });
        const activeId = next.activePageId;
        if (activeId)
            bpManager.setCurrentPage(activeId);
    }

    undo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const next = record?.next as IBPAddPageOperateData | null;
        if (!next?.page?.pageId) return;
        const pageId = next.page.pageId;
        const index = bpManager.bpPageMangers.findIndex((p) => p.pageId === pageId);
        if (index < 0) return;
        runInAction(() => {
            bpManager.bpPageMangers.splice(index, 1);
        });
        const activeId = next.activePageId;
        if (activeId)
            bpManager.loadBpPageContent(activeId);
        else if (bpManager.bpPageMangers[0]?.pageId)
            bpManager.loadBpPageContent(bpManager.bpPageMangers[0].pageId);
    }
}

const bpAddPageRollbackImpl = new BPAddPageRollbackImpl();
export default bpAddPageRollbackImpl;
