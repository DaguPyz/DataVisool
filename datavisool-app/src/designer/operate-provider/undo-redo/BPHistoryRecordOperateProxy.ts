/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cloneDeep} from "lodash";
import bpLeftStore from "@/designer/blueprint/left/BPLeftStore";
import BpCanvasUtil from "@/designer/blueprint/util/BpCanvasUtil";
import {BPNodeLayoutType, IBPLine} from "@datavisool/sdk/types";
import {historyOperator} from "./HistoryOperator";
import {
    IBPAddLineOperateData,
    IBPAddNodeOperateData,
    IBPDelLineOperateData,
    IBPDelNodeOperateData,
    IBPMoveNodeOperateData,
    OperateType
} from "./OperateType";

const USED_ANCHOR_COLOR = "#4ba6ff";
const UNUSED_ANCHOR_COLOR = "#333333";
const UNIQUE_NODE_TYPES = new Set(["BPLayerNode", "BPGlobalVariableNode"]);

export const rebuildBpAnchorIndexFromLines = (pageManager: {
    bpLines: Record<string, IBPLine>;
    bpAPMap: Record<string, string[]>;
    bpAPLineMap: Record<string, string[]>;
}) => {
    pageManager.bpAPMap = {};
    pageManager.bpAPLineMap = {};
    Object.values(pageManager.bpLines).forEach((line) => {
        if (!line?.id || !line.startAnchorId || !line.endAnchorId) return;
        if (!pageManager.bpAPMap[line.startAnchorId])
            pageManager.bpAPMap[line.startAnchorId] = [];
        if (!pageManager.bpAPMap[line.startAnchorId].includes(line.endAnchorId))
            pageManager.bpAPMap[line.startAnchorId].push(line.endAnchorId);

        if (!pageManager.bpAPLineMap[line.startAnchorId])
            pageManager.bpAPLineMap[line.startAnchorId] = [];
        if (!pageManager.bpAPLineMap[line.startAnchorId].includes(line.id))
            pageManager.bpAPLineMap[line.startAnchorId].push(line.id);

        if (!pageManager.bpAPLineMap[line.endAnchorId])
            pageManager.bpAPLineMap[line.endAnchorId] = [];
        if (!pageManager.bpAPLineMap[line.endAnchorId].includes(line.id))
            pageManager.bpAPLineMap[line.endAnchorId].push(line.id);
    });
};

export const syncBpAnchorColorsFromLines = (lines: IBPLine[]) => {
    const anchorElems = document.getElementsByClassName("ap-circle");
    anchorElems && Array.from(anchorElems).forEach((ele: Element) => {
        (ele as HTMLElement).style.setProperty("background-color", UNUSED_ANCHOR_COLOR, "important");
    });
    lines.forEach((line) => {
        if (!line?.startAnchorId || !line?.endAnchorId) return;
        BpCanvasUtil.updateAnchorsColor(line.startAnchorId, line.endAnchorId, USED_ANCHOR_COLOR);
    });
};

export const rerenderBpLinesAfterNodeReady = (pageId: string) => {
    const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
    const {currentPageManager, currPageNodeControllers} = bpManager;
    if (!currentPageManager || currentPageManager.pageId !== pageId) return;
    const nodeCount = Object.keys(currentPageManager.bpNodeLayoutMap).length;
    const timer = setInterval(() => {
        const ready = Object.keys(currPageNodeControllers).length === nodeCount;
        if (ready) {
            clearInterval(timer);
            BpCanvasUtil.reRenderAllLine();
            syncBpAnchorColorsFromLines(Object.values(currentPageManager.bpLines));
        }
    }, 50);
    setTimeout(() => clearInterval(timer), 3000);
};

class BPHistoryRecordOperateProxy {
    public doAddNode(layout: BPNodeLayoutType): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const pageId = bpManager.currentPageManager?.pageId;
        if (!pageId) return;
        bpManager.addBPNodeLayout(layout);
        if (layout.id && layout.type && UNIQUE_NODE_TYPES.has(layout.type))
            bpLeftStore.setUsedNodes(layout.id, true);
        const record = {type: OperateType.BP_ADD_NODE, prev: null, next: {pageId, layout: cloneDeep(layout)} as IBPAddNodeOperateData};
        historyOperator.put({actions: [record]});
        rerenderBpLinesAfterNodeReady(pageId);
    }

    public doDelNodes(nodeIds: string[]): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const pageManager = bpManager.currentPageManager;
        if (!pageManager || !pageManager.pageId || !nodeIds || nodeIds.length === 0) return;
        const pageId = pageManager.pageId;
        const {bpNodeLayoutMap, bpNodeConfigMap, bpLines} = pageManager;
        const nodeIdSet = new Set(nodeIds);

        const nodes = nodeIds.map((id) => {
            const layout = bpNodeLayoutMap[id];
            const config = bpManager.currPageNodeControllers[id]?.getConfig() ?? bpNodeConfigMap[id] ?? null;
            return {layout: cloneDeep(layout), config: cloneDeep(config)};
        }).filter((item) => !!item.layout);

        const lines = Object.values(bpLines).filter((line) => {
            if (!line?.startAnchorId || !line?.endAnchorId) return false;
            const startNodeId = line.startAnchorId.split(":")[0];
            const endNodeId = line.endAnchorId.split(":")[0];
            return nodeIdSet.has(startNodeId) || nodeIdSet.has(endNodeId);
        }).map((line) => cloneDeep(line));

        const prev: IBPDelNodeOperateData = {pageId, nodes, lines};

        const uniqueNodeIds = nodeIds.filter((nodeId) => {
            const type = bpNodeLayoutMap[nodeId]?.type;
            return !!(type && UNIQUE_NODE_TYPES.has(type));
        });
        bpManager.delNode(nodeIds);
        uniqueNodeIds.forEach((nodeId) => {
            bpLeftStore.setUsedNodes(nodeId, false);
        });
        rebuildBpAnchorIndexFromLines(pageManager);
        const record = {type: OperateType.BP_DEL_NODE, prev, next: null};
        historyOperator.put({actions: [record]});
        rerenderBpLinesAfterNodeReady(pageId);
    }

    public doAddLine(line: IBPLine): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const pageId = bpManager.currentPageManager?.pageId;
        if (!pageId) return;
        const copyLine = cloneDeep(line);
        BpCanvasUtil.createLine(copyLine);
        bpManager.addLine(copyLine);
        bpManager.addAPMap(copyLine.startAnchorId!, copyLine.endAnchorId!);
        bpManager.addAPLineMap(copyLine.startAnchorId!, copyLine.id!);
        bpManager.addAPLineMap(copyLine.endAnchorId!, copyLine.id!);
        BpCanvasUtil.updateAnchorsColor(copyLine.startAnchorId!, copyLine.endAnchorId!, USED_ANCHOR_COLOR);
        const record = {type: OperateType.BP_ADD_LINE, prev: null, next: {pageId, line: copyLine} as IBPAddLineOperateData};
        historyOperator.put({actions: [record]});
    }

    public doDelLines(lineIds: string[]): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const pageManager = bpManager.currentPageManager;
        if (!pageManager || !pageManager.pageId || !lineIds || lineIds.length === 0) return;
        const pageId = pageManager.pageId;
        const lines = lineIds.map((id) => cloneDeep(pageManager.bpLines[id])).filter((l) => !!l) as IBPLine[];
        const prev: IBPDelLineOperateData = {pageId, lines};
        bpManager.delLine(lineIds);
        rebuildBpAnchorIndexFromLines(pageManager);
        const record = {type: OperateType.BP_DEL_LINE, prev, next: null};
        historyOperator.put({actions: [record]});
        rerenderBpLinesAfterNodeReady(pageId);
    }

    public doMoveNodes(nodes: Array<{ id: string; x: number; y: number }>): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const pageManager = bpManager.currentPageManager;
        if (!pageManager || !pageManager.pageId || !nodes || nodes.length === 0) return;
        const pageId = pageManager.pageId;
        const prevNodes = nodes.map(({id}) => {
            const layout = pageManager.bpNodeLayoutMap[id];
            return {id, x: layout?.position?.x ?? 0, y: layout?.position?.y ?? 0};
        });
        const prev: IBPMoveNodeOperateData = {pageId, nodes: prevNodes};

        nodes.forEach(({id, x, y}) => {
            BpCanvasUtil.updNodeAndLinePos(id, {x, y});
        });

        const next: IBPMoveNodeOperateData = {pageId, nodes: cloneDeep(nodes)};
        const record = {type: OperateType.BP_MOVE_NODE, prev, next};
        historyOperator.put({actions: [record]});
        rerenderBpLinesAfterNodeReady(pageId);
    }

    public doAddPage(): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const activePageId = bpManager.currentPageManager?.pageId ?? null;
        bpManager.addNewPage();
        const index = bpManager.bpPageMangers.length - 1;
        const page = bpManager.bpPageMangers[index]?.getData();
        if (!page) return;
        const record = {type: OperateType.BP_ADD_PAGE, prev: null, next: {index, page, activePageId}};
        historyOperator.put({actions: [record]});
    }

    public doDelPage(pageId: string): void {
        const bpManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const activePageId = bpManager.currentPageManager?.pageId ?? null;
        const index = bpManager.bpPageMangers.findIndex((p) => p.pageId === pageId);
        const target = bpManager.bpPageMangers[index];
        if (index < 0 || !target) return;
        const page = target.getData();
        const {bpNodeLayoutMap} = target;
        Object.values(bpNodeLayoutMap).forEach((nodeLayout) => {
            if (nodeLayout.id && nodeLayout.type && UNIQUE_NODE_TYPES.has(nodeLayout.type))
                bpLeftStore.setUsedNodes(nodeLayout.id, false);
        });
        bpManager.deleteBptPage(pageId);
        const record = {type: OperateType.BP_DEL_PAGE, prev: {index, page, activePageId}, next: null};
        historyOperator.put({actions: [record]});
    }
}

const bpHistoryRecordOperateProxy = new BPHistoryRecordOperateProxy();
export default bpHistoryRecordOperateProxy;
