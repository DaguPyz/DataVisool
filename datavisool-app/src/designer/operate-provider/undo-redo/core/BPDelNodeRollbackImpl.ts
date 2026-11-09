/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import AbstractRollback from "./AbstractRollback";
import {IBPDelNodeOperateData, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import bpLeftStore from "@/designer/blueprint/left/BPLeftStore";
import {rebuildBpAnchorIndexFromLines, rerenderBpLinesAfterNodeReady, syncBpAnchorColorsFromLines} from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";
import {runInAction} from "mobx";

const UNIQUE_NODE_TYPES = new Set(["BPLayerNode", "BPGlobalVariableNode"]);

class BPDelNodeRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const prev = record?.prev as IBPDelNodeOperateData | null;
        if (!prev?.pageId || !prev.nodes?.length) return;
        if (bpManager.currentPageManager?.pageId !== prev.pageId)
            bpManager.loadBpPageContent(prev.pageId);
        const nodeIds = prev.nodes.map((n) => n.layout?.id).filter((id) => !!id) as string[];
        if (nodeIds.length === 0) return;
        bpManager.delNode(nodeIds);
        prev.nodes.forEach(({layout}) => {
            if (layout?.id && layout.type && UNIQUE_NODE_TYPES.has(layout.type))
                bpLeftStore.setUsedNodes(layout.id, false);
        });
        rebuildBpAnchorIndexFromLines(bpManager.currentPageManager!);
        rerenderBpLinesAfterNodeReady(prev.pageId);
        syncBpAnchorColorsFromLines(Object.values(bpManager.currentPageManager!.bpLines));
    }

    undo(record: IHistoryRecord): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const prev = record?.prev as IBPDelNodeOperateData | null;
        if (!prev?.pageId || !prev.nodes?.length) return;
        if (bpManager.currentPageManager?.pageId !== prev.pageId)
            bpManager.loadBpPageContent(prev.pageId);
        const pageManager = bpManager.currentPageManager!;

        runInAction(() => {
            prev.nodes.forEach(({layout, config}) => {
                if (!layout?.id) return;
                pageManager.bpNodeLayoutMap[layout.id] = layout;
                if (config)
                    pageManager.bpNodeConfigMap[layout.id] = config;
            });
            prev.lines.forEach((line) => {
                if (!line?.id) return;
                pageManager.bpLines[line.id] = line;
            });
        });

        rebuildBpAnchorIndexFromLines(pageManager);
        prev.nodes.forEach(({layout}) => {
            if (layout?.id && layout.type && UNIQUE_NODE_TYPES.has(layout.type))
                bpLeftStore.setUsedNodes(layout.id, true);
        });
        rerenderBpLinesAfterNodeReady(prev.pageId);
        syncBpAnchorColorsFromLines(Object.values(pageManager.bpLines));
    }
}

const bpDelNodeRollbackImpl = new BPDelNodeRollbackImpl();
export default bpDelNodeRollbackImpl;
