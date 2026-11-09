/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import AbstractRollback from "./AbstractRollback";
import {IHistoryRecord, IBPAddNodeOperateData} from "@/designer/operate-provider/undo-redo/OperateType";
import bpLeftStore from "@/designer/blueprint/left/BPLeftStore";
import {rebuildBpAnchorIndexFromLines, rerenderBpLinesAfterNodeReady, syncBpAnchorColorsFromLines} from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";

const UNIQUE_NODE_TYPES = new Set(["BPLayerNode", "BPGlobalVariableNode"]);

class BPAddNodeRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const next = record?.next as IBPAddNodeOperateData | null;
        if (!next?.pageId || !next.layout?.id) return;
        if (bpManager.currentPageManager?.pageId !== next.pageId)
            bpManager.loadBpPageContent(next.pageId);
        bpManager.addBPNodeLayout(next.layout);
        if (next.layout.type && UNIQUE_NODE_TYPES.has(next.layout.type))
            bpLeftStore.setUsedNodes(next.layout.id, true);
        rebuildBpAnchorIndexFromLines(bpManager.currentPageManager!);
        rerenderBpLinesAfterNodeReady(next.pageId);
    }

    undo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const next = record?.next as IBPAddNodeOperateData | null;
        if (!next?.pageId || !next.layout?.id) return;
        if (bpManager.currentPageManager?.pageId !== next.pageId)
            bpManager.loadBpPageContent(next.pageId);
        bpManager.delNode([next.layout.id]);
        if (next.layout.type && UNIQUE_NODE_TYPES.has(next.layout.type))
            bpLeftStore.setUsedNodes(next.layout.id, false);
        rebuildBpAnchorIndexFromLines(bpManager.currentPageManager!);
        rerenderBpLinesAfterNodeReady(next.pageId);
        syncBpAnchorColorsFromLines(Object.values(bpManager.currentPageManager!.bpLines));
    }
}

const bpAddNodeRollbackImpl = new BPAddNodeRollbackImpl();
export default bpAddNodeRollbackImpl;
