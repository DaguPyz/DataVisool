/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {CheckOne, DeleteOne, Layers, LinkBreak, LinkOne, Repair, Target, TreeDiagram} from "@icon-park/react";
import {Button, Dialog, Tag} from "@datavisool/ui";
import {observer} from "mobx-react";
import footerStore from "@/designer/footer/FooterStore.ts";
import {
    deleteCanvasOrphans,
    prependCanvasOrphans,
    repairCanvasTailPointer,
    scanCanvasRepairAnalysis
} from "@/designer/operate-provider/canvas-repair/CanvasRepairOperate.ts";
import type {ICanvasRepairAnalysis} from "@/designer/left/layer-list/util/LayerRepairUtil.ts";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import rightStore from "@/designer/right/RightStore.ts";
import {globalMessage} from "@datavisool/ui";
import "./CanvasRepairModal.less";

const issueLabelMap: Record<string, string> = {
    "missing-header": "头指针缺失",
    "missing-tail": "尾指针缺失",
    "missing-layer": "图层引用缺失",
    "cycle": "循环引用",
    "duplicate-layer": "重复引用",
    "tail-mismatch": "尾指针不一致",
}

const issueTagColorMap: Record<string, string> = {
    "missing-header": "#EF4444",
    "missing-tail": "#EF4444",
    "missing-layer": "warning",
    "cycle": "#EF4444",
    "duplicate-layer": "warning",
    "tail-mismatch": "warning",
}

const createEmptyAnalysis = (): ICanvasRepairAnalysis => ({
    layerCount: 0,
    layerHeader: undefined,
    layerTail: undefined,
    reachableCount: 0,
    reachableIds: [],
    renderTailId: undefined,
    orphanCount: 0,
    orphanIds: [],
    orphanLayers: [],
    issues: [],
});

const CanvasRepairModal = observer(() => {
    const {canvasRepairVisible, setCanvasRepairVisible} = footerStore;
    const analysis: ICanvasRepairAnalysis = canvasRepairVisible ? scanCanvasRepairAnalysis() : createEmptyAnalysis();
    const hasOrphans = analysis.orphanIds.length > 0;
    const hasIssues = analysis.issues.length > 0;
    const canRepairTailPointer = !!analysis.renderTailId && analysis.layerTail !== analysis.renderTailId;
    const titleText = hasOrphans || hasIssues
        ? `画布修复（${analysis.orphanIds.length} 个孤儿，${analysis.issues.length} 个问题）`
        : "画布修复";
    const summaryItems = [
        {label: "总图层", value: analysis.layerCount, warning: false, icon: Layers},
        {label: "可达图层", value: analysis.reachableCount, warning: false, icon: LinkOne},
        {label: "孤儿节点", value: analysis.orphanCount, warning: hasOrphans, icon: TreeDiagram},
        {label: "链路问题", value: analysis.issues.length, warning: hasIssues, icon: LinkBreak},
    ];

    const closeModal = () => {
        setCanvasRepairVisible(false);
    }

    const handleDeleteAll = () => {
        if (!hasOrphans)
            return;
        deleteCanvasOrphans(analysis.orphanIds);
        globalMessage.messageApi?.success(`已删除 ${analysis.orphanIds.length} 个孤儿节点`);
        closeModal();
    }

    const handlePrependAll = () => {
        if (!hasOrphans)
            return;
        prependCanvasOrphans(analysis.orphanIds);
        globalMessage.messageApi?.success(`已将 ${analysis.orphanIds.length} 个孤儿节点追加到画布前端`);
        closeModal();
    }

    const handleRepairTailPointer = () => {
        if (!canRepairTailPointer)
            return;
        repairCanvasTailPointer();
        globalMessage.messageApi?.success('已修复尾指针');
        closeModal();
    }

    const handleLocate = (layerId: string) => {
        const layer = window.DATAVISOOL_ENV?.currentManager?.layerManager?.layerConfigs?.[layerId];
        if (!layer)
            return;
        if (layer.type)
            rightStore.activeConfig(layerId, layer.type);
        eventOperateStore.setTargetIds([layerId]);
    }

    return (
        <Dialog
            title={<div className="canvas-repair-title">
                <span className="canvas-repair-title-icon" aria-hidden="true">
                    <Repair theme="outline" size={20} strokeWidth={1.75}/>
                </span>
                <span className="canvas-repair-title-copy">
                    <span className="canvas-repair-title-main" title={titleText}>{titleText}</span>
                    <span className="canvas-repair-title-sub">扫描画布链路指针，处理孤儿节点与尾指针异常</span>
                </span>
            </div>}
            open={canvasRepairVisible}
            onClose={closeModal}
            centered
            mask
            showClose
            width={920}
            className="canvas-repair-modal-dialog"
        >
            <div className="canvas-repair-modal-content">
                <div className="canvas-repair-scroll-region">
                    <div className="canvas-repair-diagnosis">
                        <div className="canvas-repair-diagnosis-heading">
                            <h2>画布链路诊断</h2>
                            <Tag
                                color={hasOrphans || hasIssues ? "warning" : "success"}
                                className="canvas-repair-state-tag"
                                bordered={false}
                            >
                                {hasOrphans || hasIssues
                                    ? `${analysis.orphanIds.length} 个孤儿 · ${analysis.issues.length} 个问题`
                                    : "链路状态正常"}
                            </Tag>
                        </div>
                        <p className="canvas-repair-diagnosis-desc">
                            扫描可达图层与孤儿节点；追加修复保留图层 ID、坐标和样式。
                        </p>
                    </div>

                    <div className="canvas-repair-summary">
                        {summaryItems.map((item) => (
                            <div
                                key={item.label}
                                className={`canvas-repair-summary-card ${item.warning ? "canvas-repair-summary-card-warning" : ""}`}
                            >
                                <item.icon theme="outline" size={20} strokeWidth={1.75} aria-hidden="true"/>
                                <span className="canvas-repair-summary-label">{item.label}</span>
                                <span className="canvas-repair-summary-value">{item.value}</span>
                            </div>
                        ))}
                    </div>

                    <section className="canvas-repair-section" aria-labelledby="canvas-repair-issues-title">
                        <div className="canvas-repair-section-title">
                            <h3 id="canvas-repair-issues-title" className="canvas-repair-section-title-copy">
                                <LinkBreak theme="outline" size={20} strokeWidth={1.75} aria-hidden="true"/>
                                链路异常
                            </h3>
                            <Tag bordered={false} color={hasIssues ? "warning" : "default"}>{analysis.issues.length}</Tag>
                        </div>
                        {hasIssues ? (
                            <div className="canvas-repair-issue-list">
                                {analysis.issues.map((issue, index) => (
                                    <div key={`${issue.type}-${issue.layerId ?? "root"}-${index}`}
                                         className="canvas-repair-issue-item">
                                        <div className="canvas-repair-issue-line">
                                            <Tag
                                                color={issueTagColorMap[issue.type] ?? "default"}
                                                bordered={false}
                                                className={`canvas-repair-issue-tag canvas-repair-issue-tag-${issue.type}`}
                                            >
                                                {issueLabelMap[issue.type] ?? issue.type}
                                            </Tag>
                                            <span className="canvas-repair-issue-text">{issue.message}</span>
                                            {issue.type === "tail-mismatch" && canRepairTailPointer && (
                                                <Button
                                                    type="link"
                                                    size="sm"
                                                    className="canvas-repair-issue-action"
                                                    icon={<Repair theme="outline" size={16} strokeWidth={1.75}/>}
                                                    onClick={handleRepairTailPointer}
                                                >
                                                    修复尾指针
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="canvas-repair-empty-state">
                                <CheckOne theme="outline" size={18} strokeWidth={1.75} aria-hidden="true"/>
                                当前未发现链路异常。
                            </div>
                        )}
                    </section>

                    <section className="canvas-repair-section" aria-labelledby="canvas-repair-orphans-title">
                        <div className="canvas-repair-section-title">
                            <h3 id="canvas-repair-orphans-title" className="canvas-repair-section-title-copy">
                                <TreeDiagram theme="outline" size={20} strokeWidth={1.75} aria-hidden="true"/>
                                孤儿节点
                            </h3>
                            <Tag bordered={false} color={hasOrphans ? "warning" : "default"}>{analysis.orphanCount}</Tag>
                        </div>
                        {hasOrphans ? (
                            <div className="canvas-repair-orphan-list">
                                {analysis.orphanIds.map((layerId) => {
                                    const layer = window.DATAVISOOL_ENV?.currentManager?.layerManager?.layerConfigs?.[layerId];
                                    if (!layer)
                                        return null;

                                    return (
                                        <div key={layerId} className="canvas-repair-orphan-item">
                                            <div className="canvas-repair-orphan-main">
                                                <div className="canvas-repair-orphan-title">
                                                    <span
                                                        className="canvas-repair-orphan-name">{layer.name || "未命名图层"}</span>
                                                    <Tag
                                                        className="canvas-repair-orphan-type">{layer.type || "unknown"}</Tag>
                                                </div>
                                                <Button
                                                    type="link"
                                                    size="sm"
                                                    className="canvas-repair-locate-btn"
                                                    icon={<Target theme="outline" size={16} strokeWidth={1.75}/>}
                                                    onClick={() => handleLocate(layerId)}
                                                >
                                                    定位
                                                </Button>
                                            </div>

                                            <div className="canvas-repair-orphan-meta">
                                                <div>id: <code>{layerId}</code></div>
                                                <div>order: <code>{layer.order ?? "-"}</code></div>
                                                <div>pid: <code>{layer.pid ?? "-"}</code></div>
                                                <div>prev: <code>{layer.prev ?? "-"}</code></div>
                                                <div>next: <code>{layer.next ?? "-"}</code></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="canvas-repair-empty-state">
                                <CheckOne theme="outline" size={18} strokeWidth={1.75} aria-hidden="true"/>
                                当前未发现孤儿节点。
                            </div>
                        )}
                    </section>
                </div>
                <div className="canvas-repair-footer-actions">
                    <Button
                        variant="destructive"
                        disabled={!hasOrphans}
                        onClick={handleDeleteAll}
                        className="canvas-repair-delete-btn"
                        icon={<DeleteOne theme="outline" size={16} strokeWidth={1.75}/>}
                    >
                        删除全部孤儿节点
                    </Button>
                    <Button
                        type="default"
                        onClick={closeModal}
                        className="canvas-repair-cancel-btn"
                    >
                        取消
                    </Button>
                    <Button
                        type="default"
                        disabled={!canRepairTailPointer}
                        onClick={handleRepairTailPointer}
                        className="canvas-repair-fix-btn"
                        icon={<Repair theme="outline" size={16} strokeWidth={1.75}/>}
                    >
                        修复尾指针
                    </Button>
                    <Button
                        type="primary"
                        disabled={!hasOrphans}
                        onClick={handlePrependAll}
                        className="canvas-repair-prepend-btn"
                        icon={<TreeDiagram theme="outline" size={16} strokeWidth={1.75}/>}
                    >
                        追加到画布前端
                    </Button>
                </div>
            </div>
        </Dialog>
    );
})

export default CanvasRepairModal;
