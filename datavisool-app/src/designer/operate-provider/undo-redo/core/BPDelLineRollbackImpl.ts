/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import AbstractRollback from "./AbstractRollback";
import {IBPDelLineOperateData, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import BpCanvasUtil from "@/designer/blueprint/util/BpCanvasUtil";
import {rebuildBpAnchorIndexFromLines, rerenderBpLinesAfterNodeReady, syncBpAnchorColorsFromLines} from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";

const USED_ANCHOR_COLOR = "#4ba6ff";

class BPDelLineRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const prev = record?.prev as IBPDelLineOperateData | null;
        if (!prev?.pageId || !prev.lines?.length) return;
        if (bpManager.currentPageManager?.pageId !== prev.pageId)
            bpManager.loadBpPageContent(prev.pageId);
        const ids = prev.lines.map((l) => l.id).filter((id) => !!id) as string[];
        if (ids.length === 0) return;
        bpManager.delLine(ids);
        rebuildBpAnchorIndexFromLines(bpManager.currentPageManager!);
        rerenderBpLinesAfterNodeReady(prev.pageId);
        syncBpAnchorColorsFromLines(Object.values(bpManager.currentPageManager!.bpLines));
    }

    undo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const prev = record?.prev as IBPDelLineOperateData | null;
        if (!prev?.pageId || !prev.lines?.length) return;
        if (bpManager.currentPageManager?.pageId !== prev.pageId)
            bpManager.loadBpPageContent(prev.pageId);
        const pageManager = bpManager.currentPageManager!;
        prev.lines.forEach((line) => {
            if (!line?.id) return;
            pageManager.bpLines[line.id] = line;
        });
        rebuildBpAnchorIndexFromLines(pageManager);
        prev.lines.forEach((line) => {
            if (!line?.startAnchorId || !line?.endAnchorId) return;
            BpCanvasUtil.updateAnchorsColor(line.startAnchorId, line.endAnchorId, USED_ANCHOR_COLOR);
        });
        rerenderBpLinesAfterNodeReady(prev.pageId);
        syncBpAnchorColorsFromLines(Object.values(pageManager.bpLines));
    }
}

const bpDelLineRollbackImpl = new BPDelLineRollbackImpl();
export default bpDelLineRollbackImpl;
