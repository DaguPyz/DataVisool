/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {CheckSmall, Down, Info, LoadingFour, Time} from "@icon-park/react";
import {useCallback, useEffect, useMemo, useRef, useState, type RefObject} from "react";
import {observer} from "mobx-react";
import {tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import {
    getAiDrivenToolPresentation,
    hiddenLiveToolNames,
    humanizeAiDrivenToolNames,
} from "./AiDrivenActivityPresentation.ts";
import AiDrivenInlineInteraction from "./AiDrivenInlineInteraction.tsx";
import AiDrivenStreamingMessage from "./AiDrivenStreamingMessage.tsx";
import AiDrivenTokenUsage from "./AiDrivenTokenUsage.tsx";
import aiDrivenProgressTerminalStore, {
    type AiDrivenRunState,
    type AiDrivenTimelineItemStatus,
    type IAiDrivenRunNotice,
    type IAiDrivenPlanStep,
    type IAiDrivenTimelineItem,
} from "./AiDrivenProgressTerminalStore.ts";
import type {IAiDrivenCanvasOperationReceipt} from "./types/AiDrivenTaskSubmitTypes.ts";
import "./AiDrivenRunNotice.less";
import "./AiDrivenProgressTerminal.less";

/** 渲染面向用户的 Agent 任务时间线。 */
const AiDrivenProgressTerminal = observer(() => {
    useLocaleVersion();

    const executionRef = useRef<HTMLElement>(null);
    const taskPanelRef = useRef<HTMLElement>(null);
    const followLatestRef = useRef(true);
    const followFrameRef = useRef<number | null>(null);
    const animatedMessageIdsRef = useRef(new Set<string>());
    const [now, setNow] = useState(Date.now());
    const {
        displayProgressTitle,
        canvasOperations,
        pendingInlineInteraction,
        planExplanation,
        planSteps,
        runNotice,
        runResult,
        runStartedAt,
        runState,
        timelineItems,
        tokenUsage,
        visible,
    } = aiDrivenProgressTerminalStore;
    const visibleItems = useMemo(() => timelineItems.filter(shouldShowTimelineItem), [timelineItems]);
    const timelineDigest = visibleItems.map((item) => `${item.id}:${item.status}:${stringValue(item.payload.text).length}`).join("|");
    const operationDigest = canvasOperations.map((operation) => `${operation.operationId}:${operation.status}`).join("|");
    const planState = planSteps.map((step) => step.status).join(",");

    useEffect(() => {
        aiDrivenProgressTerminalStore.setInlineHostAvailable(true);
        return () => aiDrivenProgressTerminalStore.setInlineHostAvailable(false);
    }, []);

    useEffect(() => {
        if (runState !== "running" && runState !== "waiting")
            return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [runState]);

    const scheduleExecutionFollow = useCallback(() => {
        const execution = executionRef.current;
        if (!execution || !followLatestRef.current || followFrameRef.current !== null)
            return;
        followFrameRef.current = window.requestAnimationFrame(() => {
            followFrameRef.current = null;
            if (followLatestRef.current)
                execution.scrollTop = execution.scrollHeight;
        });
    }, []);
    const markMessageAnimationStarted = useCallback((itemId: string) => {
        animatedMessageIdsRef.current.add(itemId);
    }, []);

    useEffect(() => {
        if (visible)
            scheduleExecutionFollow();
    }, [operationDigest, pendingInlineInteraction?.id, planState, runResult?.endedAt, scheduleExecutionFollow, timelineDigest, visible]);

    useEffect(() => {
        const retainedIds = new Set(timelineItems
            .filter((item) => item.type === "agentMessage")
            .map((item) => item.id));
        animatedMessageIdsRef.current.forEach((itemId) => {
            if (!retainedIds.has(itemId))
                animatedMessageIdsRef.current.delete(itemId);
        });
    }, [timelineItems]);

    useEffect(() => () => {
        if (followFrameRef.current !== null)
            window.cancelAnimationFrame(followFrameRef.current);
    }, []);

    useEffect(() => {
        const panel = taskPanelRef.current;
        const activeTask = panel?.querySelector<HTMLElement>("li.is-inProgress, li.is-waiting, li.is-failed");
        if (!visible || !panel || !activeTask)
            return;
        const taskTop = activeTask.offsetTop;
        const taskBottom = taskTop + activeTask.offsetHeight;
        if (taskTop < panel.scrollTop)
            panel.scrollTop = taskTop;
        else if (taskBottom > panel.scrollTop + panel.clientHeight)
            panel.scrollTop = taskBottom - panel.clientHeight;
    }, [planState, runState, visible]);

    useEffect(() => {
        if (!visible)
            return;
        followLatestRef.current = true;
    }, [visible]);

    if (!visible)
        return null;

    const elapsedText = runStartedAt > 0
        ? formatElapsed((runResult?.endedAt ?? now) - runStartedAt)
        : "";
    const hasExecutionContent = visibleItems.length > 0
        || canvasOperations.length > 0
        || Boolean(pendingInlineInteraction)
        || Boolean(runResult);

    return (
        <section className={`ai-driven-run-panel is-${runState}`}
                 aria-label={tx("Agent 任务动态")}>
            <header className="ai-driven-run-panel-header">
                <div className="ai-driven-run-panel-heading">
                    <span className="ai-driven-run-state-indicator" aria-hidden="true"/>
                    <div>
                        <strong>{tx(runStateTitle(runState))}</strong>
                        <span>{displayProgressTitle}</span>
                    </div>
                </div>
                <div className="ai-driven-run-panel-meta">
                    {tokenUsage && <AiDrivenTokenUsage usage={tokenUsage}/>}
                    {elapsedText && (
                        <span className="ai-driven-run-elapsed">
                            <Time size={13}/>
                            {elapsedText}
                        </span>
                    )}
                    <button type="button"
                            className="ai-driven-run-collapse"
                            aria-label={tx("收起任务动态")}
                            title={tx("收起任务动态")}
                            onClick={() => aiDrivenProgressTerminalStore.setVisible(false)}>
                        <Down size={15}/>
                    </button>
                </div>
            </header>

            <div className="ai-driven-run-panel-body"
                 role="log"
                 aria-live="polite">
                <div className={`ai-driven-run-layout ${planSteps.length > 0 ? "has-task-plan" : "without-task-plan"}`}>
                    <main ref={executionRef}
                          className="ai-driven-run-execution"
                          onScroll={(event) => {
                              const target = event.currentTarget;
                              followLatestRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 48;
                          }}>
                        <header className="ai-driven-run-timeline-heading">
                            <strong>{tx("执行过程")}</strong>
                            <span>{tx("Agent 的操作与反馈")}</span>
                        </header>
                        {runNotice && <RunNotice notice={runNotice}/>}
                        {canvasOperations.length > 0 && (
                            <CanvasOperations operations={canvasOperations}/>
                        )}
                        {visibleItems.length > 0 && (
                            <div className="ai-driven-run-timeline">
                                {visibleItems.map((item) => (
                                    <TimelineItem key={item.id}
                                                  item={item}
                                                  animateInitialMessage={shouldAnimateInitialMessage(
                                                      item,
                                                      animatedMessageIdsRef.current,
                                                  )}
                                                  onInitialMessageAnimation={markMessageAnimationStarted}
                                                  onContentChange={scheduleExecutionFollow}/>
                                ))}
                            </div>
                        )}

                        {pendingInlineInteraction && (
                            <AiDrivenInlineInteraction key={pendingInlineInteraction.id}
                                                       interaction={pendingInlineInteraction}
                                                       onComplete={aiDrivenProgressTerminalStore.completeInlineInteraction}/>
                        )}

                        {runResult && (
                            <section className={`ai-driven-run-result is-${runResult.status}`} role="status">
                                <span className="ai-driven-run-result-icon" aria-hidden="true">
                                    {runResult.status === "completed" ? <CheckSmall size={17}/> : <Info size={16}/>}
                                </span>
                                <div>
                                    <strong>{tx(resultTitle(runResult.status))}</strong>
                                    <p>{runResult.message}</p>
                                    {runResult.status === "completed" && (
                                        <small>{tx("真实动作以“画布动作”回执为准；Agent 回复仅用于说明。")}</small>
                                    )}
                                </div>
                            </section>
                        )}

                        {!hasExecutionContent && (
                            <div className="ai-driven-run-empty">
                                <span className="ai-driven-run-empty-pulse" aria-hidden="true"/>
                                <span>{runState === "running" ? tx("Agent 正在理解需求…") : tx("暂无执行动态")}</span>
                            </div>
                        )}
                    </main>

                    {planSteps.length > 0 && (
                        <TaskProgressPanel steps={planSteps}
                                           explanation={planExplanation}
                                           runState={runState}
                                           panelRef={taskPanelRef}/>
                    )}
                </div>
            </div>
        </section>
    );
});

const RunNotice = ({notice}: {notice: IAiDrivenRunNotice}) => (
    <section className={`ai-driven-run-notice is-${notice.kind}`} role="status">
        <Info size={14} aria-hidden="true"/>
        <span>{tx(notice.message)}</span>
    </section>
);

const CanvasOperations = ({operations}: {operations: IAiDrivenCanvasOperationReceipt[]}) => (
    <section className="ai-driven-run-operations" aria-label={tx("画布动作回执")}>
        <header>
            <strong>{tx("画布动作")}</strong>
            <span>{tx("真实执行事实")}</span>
        </header>
        <ul>
            {operations.map((operation) => (
                <li key={operation.operationId} className={`is-${operation.status}`}>
                    <span className="ai-driven-run-operation-marker" aria-hidden="true"/>
                    <div>
                        <strong>{tx(operation.kind === "createComponents" ? "创建组件" : "修改组件")}</strong>
                        <small>{operationDetail(operation)}</small>
                    </div>
                    <b>{tx(operationStatusTitle(operation.status))}</b>
                </li>
            ))}
        </ul>
    </section>
);

const operationDetail = (operation: IAiDrivenCanvasOperationReceipt) => {
    const count = operation.componentIds?.length ?? 0;
    if (operation.error?.message)
        return operation.error.message;
    return count > 0 ? tx(`${count} 个组件`) : tx("等待组件回执");
};

const operationStatusTitle = (status: IAiDrivenCanvasOperationReceipt["status"]) => {
    switch (status) {
        case "prepared": return "已准备";
        case "applying": return "待确认";
        case "applied": return "已生效";
        case "rejected": return "已拒绝";
        case "failed": return "未生效";
    }
};

type TaskDisplayStatus = IAiDrivenPlanStep["status"] | "waiting" | "failed" | "cancelled" | "budgetExhausted";

interface ITaskDisplayItem {
    step: string;
    status: TaskDisplayStatus;
}

const TaskProgressPanel = ({
    steps,
    explanation,
    runState,
    panelRef,
}: {
    steps: IAiDrivenPlanStep[];
    explanation: string;
    runState: AiDrivenRunState;
    panelRef: RefObject<HTMLElement>;
}) => {
    if (steps.length === 0)
        return null;
    const displaySteps: ITaskDisplayItem[] = steps.map((step) => ({
        ...step,
        status: taskStatusForRun(step.status, runState),
    }));
    const completedCount = displaySteps.filter((step) => step.status === "completed").length;
    const progress = Math.round((completedCount / displaySteps.length) * 100);

    return (
        <aside ref={panelRef}
               className="ai-driven-run-tasks"
               aria-label={tx("任务列表与进度")}>
            <header className="ai-driven-run-tasks-heading">
                <div>
                    <strong>{tx("任务列表")}</strong>
                    <span>{tx("计划步骤与完成情况")}</span>
                </div>
                <b>{progress}%</b>
            </header>
            <div className="ai-driven-run-tasks-progress"
                 role="progressbar"
                 aria-label={tx("任务进度")}
                 aria-valuemin={0}
                 aria-valuemax={100}
                 aria-valuenow={progress}>
                <span style={{width: `${progress}%`}}/>
            </div>
            {explanation && <p className="ai-driven-run-tasks-explanation">{explanation}</p>}
            <ol>
                {displaySteps.map((item, index) => (
                    <li key={`${index}-${item.step}`} className={`is-${item.status}`}>
                        <TaskStatusIcon status={item.status}/>
                        <span>{item.step}</span>
                        <small>{tx(taskStatusTitle(item.status))}</small>
                    </li>
                ))}
            </ol>
        </aside>
    );
};

const TaskStatusIcon = ({status}: {status: TaskDisplayStatus}) => (
    <span className="ai-driven-run-task-status-icon"
          role="img"
          aria-label={tx(taskStatusTitle(status))}>
        {status === "inProgress" && <LoadingFour size={13} aria-hidden="true"/>}
        {status === "completed" && <CheckSmall size={12} aria-hidden="true"/>}
        {(status === "failed" || status === "cancelled" || status === "budgetExhausted") && <Info size={11} aria-hidden="true"/>}
    </span>
);

const TimelineItem = ({
    item,
    animateInitialMessage,
    onInitialMessageAnimation,
    onContentChange,
}: {
    item: IAiDrivenTimelineItem;
    animateInitialMessage: boolean;
    onInitialMessageAnimation: (itemId: string) => void;
    onContentChange: () => void;
}) => {
    const [messageRevealing, setMessageRevealing] = useState(animateInitialMessage);
    useEffect(() => {
        if (animateInitialMessage)
            onInitialMessageAnimation(item.id);
    }, [animateInitialMessage, item.id, onInitialMessageAnimation]);

    if (item.type === "agentMessage") {
        const message = readableAgentMessage(stringValue(item.payload.text));
        const displayStatus = item.status === "completed" && messageRevealing
            ? "inProgress"
            : item.status;
        return (
            <article className={`ai-driven-run-agent-message is-${displayStatus}`}>
                <header>
                    <span className="ai-driven-run-agent-avatar" aria-hidden="true">A</span>
                    <strong>Agent</strong>
                    {displayStatus === "inProgress" && <span>{tx("正在回复")}</span>}
                </header>
                <AiDrivenStreamingMessage content={message}
                                          fallback={tx("正在生成回复…")}
                                          active={item.status === "inProgress"}
                                          animateInitial={animateInitialMessage}
                                          onContentChange={onContentChange}
                                          onRevealStateChange={setMessageRevealing}/>
                {item.payload.truncated === true && <small>{tx("内容过长，已截断")}</small>}
            </article>
        );
    }

    const presentation = timelinePresentation(item);
    return (
        <article className={`ai-driven-run-activity is-${item.status}`}>
            <span className="ai-driven-run-activity-marker" aria-hidden="true"/>
            <div className="ai-driven-run-activity-copy">
                <strong>{tx(presentation.title)}</strong>
                {presentation.detail && <span>{tx(presentation.detail)}</span>}
            </div>
            <div className="ai-driven-run-activity-meta">
                {durationText(item.payload.durationMs) && <time>{durationText(item.payload.durationMs)}</time>}
                <span>{tx(itemStatusTitle(item.status))}</span>
            </div>
        </article>
    );
};

const shouldShowTimelineItem = (item: IAiDrivenTimelineItem) => {
    if (!LIVE_TIMELINE_ITEM_TYPES.has(item.type))
        return false;
    if (item.type === "agentMessage")
        return item.status === "inProgress" || Boolean(readableAgentMessage(stringValue(item.payload.text)));
    if (item.type !== "toolCall")
        return true;
    return !hiddenLiveToolNames.has(stringValue(item.payload.toolName));
};

const shouldAnimateInitialMessage = (item: IAiDrivenTimelineItem, animatedIds: Set<string>) => {
    if (item.type !== "agentMessage" || item.payload.streamed !== true
        || !readableAgentMessage(stringValue(item.payload.text)) || animatedIds.has(item.id))
        return false;
    return true;
};

const LIVE_TIMELINE_ITEM_TYPES = new Set([
    "agentMessage",
    "toolCall",
    "userInput",
    "approval",
    "preview",
    "artifactChange",
    "error",
]);

const timelinePresentation = (item: IAiDrivenTimelineItem) => {
    if (item.type === "toolCall")
        return getAiDrivenToolPresentation(stringValue(item.payload.toolName));
    if (item.type === "userInput")
        return {title: "补充信息", detail: stringValue(item.payload.prompt) || "等待用户补充信息"};
    if (item.type === "approval")
        return {title: "操作确认", detail: stringValue(item.payload.reason) || "等待用户确认后继续"};
    if (item.type === "preview")
        return {title: "页面预览", detail: "检查本轮生成结果"};
    if (item.type === "artifactChange")
        return {title: "产物已更新", detail: artifactDetail(item.payload)};
    if (item.type === "error")
        return {title: "执行出现问题", detail: stringValue(item.payload.message)};
    return {title: "任务动态", detail: "Agent 已更新当前任务"};
};

const runStateTitle = (state: AiDrivenRunState) => {
    switch (state) {
        case "running": return "正在执行";
        case "waiting": return "需要你的操作";
        case "completed": return "任务已完成";
        case "failed": return "任务执行失败";
        case "cancelled": return "任务已停止";
        case "budgetExhausted": return "预算已用尽";
        default: return "任务动态";
    }
};

const resultTitle = (status: "completed" | "failed" | "cancelled" | "budgetExhausted") => {
    if (status === "budgetExhausted") return "预算已用尽";
    if (status === "completed")
        return "本轮任务已完成";
    if (status === "cancelled")
        return "本轮任务已停止";
    return "本轮任务未完成";
};

const itemStatusTitle = (status: AiDrivenTimelineItemStatus) => {
    switch (status) {
        case "completed": return "完成";
        case "failed": return "失败";
        case "waiting": return "等待";
        case "cancelled": return "已取消";
        case "declined": return "已拒绝";
        case "budgetExhausted": return "预算已用尽";
        default: return "进行中";
    }
};

const taskStatusTitle = (status: TaskDisplayStatus) => {
    switch (status) {
        case "completed": return "已完成";
        case "inProgress": return "执行中";
        case "waiting": return "等待操作";
        case "failed": return "执行失败";
        case "cancelled": return "已停止";
        case "budgetExhausted": return "预算已用尽";
        default: return "待执行";
    }
};

const taskStatusForRun = (
    status: IAiDrivenPlanStep["status"],
    runState: AiDrivenRunState,
): TaskDisplayStatus => {
    if (status === "completed")
        return status;
    if (runState === "completed")
        return "completed";
    if (status === "inProgress" && runState === "waiting")
        return "waiting";
    if (status === "inProgress" && runState === "failed")
        return "failed";
    if (status === "inProgress" && runState === "cancelled")
        return "cancelled";
    if (status === "inProgress" && runState === "budgetExhausted") return "budgetExhausted";
    return status;
};

const stringValue = (value: unknown) => typeof value === "string" ? value : "";
const readableAgentMessage = (value: string) => humanizeAiDrivenToolNames(value
    .replace(/^\s*\[Tool call:[^\]]+]\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/\bcomponentId\b/g, "组件标识")
    .replace(/\boperationId\b/g, "操作标识")
    .replace(/\brequestId\b/g, "请求标识")
    .replace(/\bbaseRevision\b/g, "画布版本")
    .replace(/\bworkspaceRevision\b/g, "工作区版本")
    .replace(/\bpayloadJson\b/g, "请求内容")
    .replace(/\bstack trace\b/gi, "错误详情")
    .replace(/\bnull pointer exception\b/gi, "执行异常")
    .replace(/\bNullPointerException\b/g, "执行异常"));
/** 按耗时量级选择最易读的单位。 */
export const formatDuration = (value: unknown) => {
    const durationMs = Number(value);
    if (!Number.isFinite(durationMs))
        return "";
    const normalizedDurationMs = Math.max(0, durationMs);
    if (normalizedDurationMs >= 60_000)
        return `${(normalizedDurationMs / 60_000).toFixed(1)} min`;
    if (normalizedDurationMs >= 1_000)
        return `${(normalizedDurationMs / 1_000).toFixed(1)} s`;
    return `${Math.round(normalizedDurationMs)} ms`;
};
const durationText = formatDuration;
const artifactDetail = (payload: Record<string, unknown>) => {
    const revision = Number(payload.revision);
    return Number.isFinite(revision) ? `已生成版本 ${revision}` : "任务产物已写入";
};
const formatElapsed = (durationMs: number) => {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${String(minutes).padStart(2, "0")}:${seconds}`;
};

export default AiDrivenProgressTerminal;
