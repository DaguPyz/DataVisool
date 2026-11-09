/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import AbstractRollback from "./AbstractRollback";
import {IBPMoveNodeOperateData, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import BpCanvasUtil from "@/designer/blueprint/util/BpCanvasUtil";
import {rerenderBpLinesAfterNodeReady, syncBpAnchorColorsFromLines} from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";

class BPMoveNodeRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const next = record?.next as IBPMoveNodeOperateData | null;
        if (!next?.pageId || !next.nodes?.length) return;
        if (bpManager.currentPageManager?.pageId !== next.pageId)
            bpManager.loadBpPageContent(next.pageId);
        next.nodes.forEach(({ id, x, y }) => BpCanvasUtil.updNodeAndLinePos(id, { x, y }), { applyDom: true });
        rerenderBpLinesAfterNodeReady(next.pageId);
        syncBpAnchorColorsFromLines(Object.values(bpManager.currentPageManager!.bpLines));
    }

    undo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const prev = record?.prev as IBPMoveNodeOperateData | null;
        if (!prev?.pageId || !prev.nodes?.length) return;
        if (bpManager.currentPageManager?.pageId !== prev.pageId)
            bpManager.loadBpPageContent(prev.pageId);
        prev.nodes.forEach(({ id, x, y }) => BpCanvasUtil.updNodeAndLinePos(id, { x, y }, { applyDom: true }));
        rerenderBpLinesAfterNodeReady(prev.pageId);
        syncBpAnchorColorsFromLines(Object.values(bpManager.currentPageManager!.bpLines));
    }
}

const bpMoveNodeRollbackImpl = new BPMoveNodeRollbackImpl();
export default bpMoveNodeRollbackImpl;
