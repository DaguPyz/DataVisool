/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import AbstractRollback from "./AbstractRollback";
import {IBPAddLineOperateData, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import BpCanvasUtil from "@/designer/blueprint/util/BpCanvasUtil";
import {rebuildBpAnchorIndexFromLines, rerenderBpLinesAfterNodeReady, syncBpAnchorColorsFromLines} from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";

const USED_ANCHOR_COLOR = "#4ba6ff";

class BPAddLineRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const next = record?.next as IBPAddLineOperateData | null;
        if (!next?.pageId || !next.line?.id) return;
        if (bpManager.currentPageManager?.pageId !== next.pageId)
            bpManager.loadBpPageContent(next.pageId);

        const line = next.line;
        BpCanvasUtil.createLine({...line});
        bpManager.addLine(line);
        bpManager.addAPMap(line.startAnchorId!, line.endAnchorId!);
        bpManager.addAPLineMap(line.startAnchorId!, line.id!);
        bpManager.addAPLineMap(line.endAnchorId!, line.id!);
        BpCanvasUtil.updateAnchorsColor(line.startAnchorId!, line.endAnchorId!, USED_ANCHOR_COLOR);
        rebuildBpAnchorIndexFromLines(bpManager.currentPageManager!);
        rerenderBpLinesAfterNodeReady(next.pageId);
        syncBpAnchorColorsFromLines(Object.values(bpManager.currentPageManager!.bpLines));
    }

    undo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const next = record?.next as IBPAddLineOperateData | null;
        if (!next?.pageId || !next.line?.id) return;
        if (bpManager.currentPageManager?.pageId !== next.pageId)
            bpManager.loadBpPageContent(next.pageId);
        bpManager.delLine([next.line.id]);
        rebuildBpAnchorIndexFromLines(bpManager.currentPageManager!);
        rerenderBpLinesAfterNodeReady(next.pageId);
        syncBpAnchorColorsFromLines(Object.values(bpManager.currentPageManager!.bpLines));
    }
}

const bpAddLineRollbackImpl = new BPAddLineRollbackImpl();
export default bpAddLineRollbackImpl;
