/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {tx} from "@/i18n/miniI18n.ts";
import type {IAiDrivenItem} from "./AiDrivenThreadTypes.ts";

interface AiDrivenItemViewProps {
    item: IAiDrivenItem;
}

const ITEM_TITLES: Record<string, string> = {
    userMessage: "用户消息",
    agentMessage: "Agent 回复",
    plan: "执行计划",
    toolCall: "工具调用",
    canvasOperation: "画布动作",
    userInput: "用户输入",
    artifactChange: "产物变更",
    preview: "预览",
    approval: "操作确认",
    error: "错误",
};

const STATUS_TITLES: Record<string, string> = {
    created: "已创建",
    inProgress: "进行中",
    waiting: "等待中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    declined: "已拒绝",
};

const AiDrivenItemView = ({item}: AiDrivenItemViewProps) => {
    return (
        <article className={`ai-driven-history-item is-${item.status}`}
                 data-item-type={item.itemType}>
            <header className="ai-driven-history-item-header">
                <span className="ai-driven-history-item-title">
                    {tx(ITEM_TITLES[item.itemType] ?? "未知工作项")}
                </span>
                <span className="ai-driven-history-status" data-status={item.status}>
                    {tx(STATUS_TITLES[item.status] ?? item.status)}
                </span>
            </header>
            <div className="ai-driven-history-item-body">
                {renderItemBody(item)}
            </div>
        </article>
    );
};

const renderItemBody = (item: IAiDrivenItem) => {
    const payload = item.payload;
    switch (item.itemType) {
        case "userMessage":
            return <MessageBody text={stringValue(payload.text)}
                                truncated={payload.truncated === true}
                                attachments={arrayValue(payload.attachments)}/>;
        case "agentMessage":
            return <MessageBody text={stringValue(payload.text)}
                                truncated={payload.truncated === true}
                                meta={stringValue(payload.phase)}/>;
        case "plan":
            return <PlanBody explanation={stringValue(payload.explanation)}
                             steps={arrayValue(payload.steps)}/>;
        case "toolCall":
            return <DetailBody rows={[
                ["工具", stringValue(payload.toolName)],
                ["类别", stringValue(payload.category)],
                ["结果", stringValue(payload.resultSummary)],
                ["耗时", durationText(payload.durationMs)],
            ]}/>;
        case "canvasOperation":
            return <DetailBody rows={[
                ["动作", operationKindText(payload.kind)],
                ["执行状态", operationStatusText(payload.status)],
                ["组件", componentCountText(payload.componentIds)],
                ["结果版本", stringValue(payload.resultRevision)],
                ["说明", stringValue(asRecord(payload.error)?.message)],
            ]}/>;
        case "userInput":
            return <DetailBody rows={[
                ["问题", stringValue(payload.prompt)],
                ["回答", stringValue(payload.answerSummary)],
            ]}/>;
        case "artifactChange":
            return <DetailBody rows={[
                ["产物", stringValue(payload.artifactId)],
                ["版本", numberText(payload.revision)],
                ["校验和", stringValue(payload.checksum)],
                ["提交状态", stringValue(payload.commitStatus)],
            ]}/>;
        case "preview":
            return <DetailBody rows={[
                ["预览", stringValue(payload.previewId)],
                ["版本", numberText(payload.revision)],
                ["确认结果", stringValue(payload.confirmationResult)],
            ]}/>;
        case "approval":
            return <DetailBody rows={[
                ["类型", stringValue(payload.approvalType)],
                ["原因", stringValue(payload.reason)],
                ["选择", stringValue(payload.decision)],
            ]}/>;
        case "error":
            return <DetailBody rows={[
                ["错误码", stringValue(payload.code)],
                ["说明", stringValue(payload.message)],
                ["关联项", stringValue(payload.relatedItemId)],
            ]}/>;
        default:
            return (
                <p className="ai-driven-history-item-unknown">
                    {tx("暂不支持展示此类型的详细内容")}
                    <span>{item.itemType}</span>
                </p>
            );
    }
};

const MessageBody = ({
    text,
    truncated,
    meta = "",
    attachments = [],
}: {
    text: string;
    truncated: boolean;
    meta?: string;
    attachments?: unknown[];
}) => (
    <>
        {meta && <div className="ai-driven-history-item-meta">{meta}</div>}
        <p className="ai-driven-history-message">
            {text || tx("暂无文本内容")}
            {truncated && <span className="ai-driven-history-truncated"> {tx("（内容已截断）")}</span>}
        </p>
        {attachments.length > 0 && (
            <ul className="ai-driven-history-attachments" aria-label={tx("附件")}>
                {attachments.map((attachment, index) => {
                    const value = asRecord(attachment);
                    const name = stringValue(value?.originalName) || stringValue(value?.attachmentId) || `${tx("附件")} ${index + 1}`;
                    return <li key={`${index}-${name}`}>{name}</li>;
                })}
            </ul>
        )}
    </>
);

const PlanBody = ({explanation, steps}: {explanation: string; steps: unknown[]}) => (
    <>
        {explanation && <p className="ai-driven-history-message">{explanation}</p>}
        {steps.length > 0 ? (
            <ol className="ai-driven-history-plan">
                {steps.map((step, index) => {
                    const value = asRecord(step);
                    const label = stringValue(value?.step) || `${tx("步骤")} ${index + 1}`;
                    const status = stringValue(value?.status) || "pending";
                    return (
                        <li key={`${index}-${label}`} data-status={status}>
                            <span className="ai-driven-history-plan-marker" aria-hidden="true"/>
                            <span>{label}</span>
                        </li>
                    );
                })}
            </ol>
        ) : !explanation ? <p className="ai-driven-history-muted">{tx("暂无计划内容")}</p> : null}
    </>
);

const DetailBody = ({rows}: {rows: Array<[string, string]>}) => {
    const visibleRows = rows.filter(([, value]) => value);
    if (visibleRows.length === 0)
        return <p className="ai-driven-history-muted">{tx("暂无可展示的摘要")}</p>;
    return (
        <dl className="ai-driven-history-details">
            {visibleRows.map(([label, value]) => (
                <div key={label}>
                    <dt>{tx(label)}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
};
const stringValue = (value: unknown) => typeof value === "string" ? value : "";
const arrayValue = (value: unknown) => Array.isArray(value) ? value : [];
const numberText = (value: unknown) => Number.isFinite(Number(value)) ? String(Number(value)) : "";
const durationText = (value: unknown) => Number.isFinite(Number(value)) ? `${Number(value)} ms` : "";
const componentCountText = (value: unknown) => Array.isArray(value) ? `${value.length} 个组件` : "";
const operationKindText = (value: unknown) => value === "createComponents" ? "创建组件" : value === "patchComponents" ? "修改组件" : "";
const operationStatusText = (value: unknown) => {
    if (value === "applied") return "已真实生效";
    if (value === "rejected") return "用户已拒绝，未修改画布";
    if (value === "failed") return "未生效";
    if (value === "applying") return "结果待确认";
    return value === "prepared" ? "已准备" : "";
};

export default AiDrivenItemView;
