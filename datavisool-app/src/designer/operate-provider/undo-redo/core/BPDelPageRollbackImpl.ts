/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import AbstractRollback from "./AbstractRollback";
import {IBPDelPageOperateData, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import BluePrintPageManager from "@/designer/blueprint/manager/BluePrintPageManager";
import {runInAction} from "mobx";
import bpLeftStore from "@/designer/blueprint/left/BPLeftStore";

const UNIQUE_NODE_TYPES = new Set(["BPLayerNode", "BPGlobalVariableNode"]);

class BPDelPageRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const prev = record?.prev as IBPDelPageOperateData | null;
        if (!prev?.page?.pageId) return;
        Object.values(prev.page.bpNodeLayoutMap || {}).forEach((layout) => {
            if (layout?.id && layout.type && UNIQUE_NODE_TYPES.has(layout.type))
                bpLeftStore.setUsedNodes(layout.id, false);
        });
        bpManager.deleteBptPage(prev.page.pageId);
    }

    undo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const prev = record?.prev as IBPDelPageOperateData | null;
        if (!prev?.page?.pageId) return;
        const restored = new BluePrintPageManager();
        restored.init(prev.page);
        runInAction(() => {
            bpManager.bpPageMangers.splice(prev.index, 0, restored);
        });
        Object.values(prev.page.bpNodeLayoutMap || {}).forEach((layout) => {
            if (layout?.id && layout.type && UNIQUE_NODE_TYPES.has(layout.type))
                bpLeftStore.setUsedNodes(layout.id, true);
        });
        const activeId = prev.activePageId;
        if (activeId)
            bpManager.loadBpPageContent(activeId);
    }
}

const bpDelPageRollbackImpl = new BPDelPageRollbackImpl();
export default bpDelPageRollbackImpl;
