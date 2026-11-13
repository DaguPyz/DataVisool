/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {getAiDrivenTaskEvents} from "@/api/AiDrivenTaskApi.ts";
import type {IAiDrivenTaskEvent} from "./types/AiDrivenTaskSubmitTypes.ts";
import {getAiDrivenToolPresentation} from "./AiDrivenActivityPresentation.ts";

export const AI_DRIVEN_TASK_EVENT_CHANNEL = "datavisool:ai-driven-task-event";
const EVENT_REPLAY_PAGE_SIZE = 100;
const TERMINAL_EVENT_KINDS = new Set([
    "turn.completed",
    "turn.cancelled",
    "turn.failed",
    "turn.interrupted",
    "turn.budgetExhausted",
]);

export type AiDrivenTaskNoticeKind = "waiting" | "missingConstraint" | "rejected" | "executionError";

export interface AiDrivenTaskEventScope {
    projectId: string;
    threadId: string;
    turnId: string;
    runId: string;
    eventCursor: number;
}

interface AiDrivenTaskEventCallbacks {
    onEvent: (event: IAiDrivenTaskEvent) => void;
    onCursor: (sequence: number, event: IAiDrivenTaskEvent) => void;
    onTerminal: () => void;
    onError?: (error: unknown) => void;
}

/** 先监听再回放，通过 sequence 缓冲、排序和去重实时事件。 */
export class AiDrivenTaskEventStream {
    private version = 0;
    private replayController: AbortController | null = null;
    private cursor = 0;
    private pending = new Map<number, IAiDrivenTaskEvent>();

    async start(scope: AiDrivenTaskEventScope, callbacks: AiDrivenTaskEventCallbacks) {
        this.stop();
        const version = this.version;
        this.cursor = scope.eventCursor;
        const consume = (event: IAiDrivenTaskEvent) => {
            if (version !== this.version || !isEventInScope(scope, event) || event.sequence <= this.cursor)
                return;
            this.pending.set(event.sequence, event);
            this.flush(callbacks);
        };

        const controller = new AbortController();
        this.replayController = controller;
        let replayCursor = scope.eventCursor;
        try {
            while (version === this.version) {
                const result = await getAiDrivenTaskEvents({
                    projectId: scope.projectId,
                    threadId: scope.threadId,
                    turnId: scope.turnId,
                    runId: scope.runId,
                    afterSequence: replayCursor,
                    limit: EVENT_REPLAY_PAGE_SIZE,
                }, {
                    signal: controller.signal,
                    suppressErrorMessage: true,
                });
                if (version !== this.version || !result)
                    return;
                result.events.forEach(consume);
                replayCursor = Math.max(replayCursor, result.nextCursor, this.cursor);
                await waitForNextPoll(controller);
            }
        } catch (error) {
            if (!controller.signal.aborted)
                callbacks.onError?.(error);
        } finally {
            if (this.replayController === controller)
                this.replayController = null;
        }
    }

    stop() {
        this.version += 1;
        this.replayController?.abort();
        this.replayController = null;
        this.pending.clear();
    }

    private flush(callbacks: AiDrivenTaskEventCallbacks) {
        // Web API 使用 Thread 全局 sequence，当前 Run 之外的事件会被过滤，不能要求 sequence 连续。
        let nextSequence = [...this.pending.keys()]
            .filter((sequence) => sequence > this.cursor)
            .sort((left, right) => left - right)[0];
        let event = nextSequence === undefined ? undefined : this.pending.get(nextSequence);
        while (event) {
            this.pending.delete(event.sequence);
            this.cursor = event.sequence;
            callbacks.onEvent(event);
            callbacks.onCursor(event.sequence, event);
            if (TERMINAL_EVENT_KINDS.has(event.kind))
                callbacks.onTerminal();
            nextSequence = [...this.pending.keys()]
                .filter((sequence) => sequence > this.cursor)
                .sort((left, right) => left - right)[0];
            event = nextSequence === undefined ? undefined : this.pending.get(nextSequence);
        }
    }
}

const waitForNextPoll = (controller: AbortController) => new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 800);
    controller.signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        resolve();
    }, {once: true});
});

const isEventInScope = (scope: AiDrivenTaskEventScope, event: IAiDrivenTaskEvent) => {
    return event.projectId === scope.projectId
        && event.threadId === scope.threadId
        && event.turnId === scope.turnId
        && event.runId === scope.runId;
};

/** 将运行事件收敛为简短、无敏感参数的进度文本。 */
export const describeAiDrivenTaskEvent = (event: IAiDrivenTaskEvent): string | null => {
    switch (event.kind) {
        case "agent.started":
            return "Agent 已开始处理";
        case "agent.model_call.started":
            return `AI 正在分析需求（第 ${numberPayload(event, "stepIndex", 1)} 轮）`;
        case "agent.context_compaction.started":
            return "上下文接近容量上限，正在自动压缩";
        case "item.started": {
            const item = asRecord(event.payload.item);
            const payload = asRecord(item?.payload);
            return item?.itemType === "toolCall" ? describeTool(String(payload?.toolName ?? "")) : null;
        }
        case "agent.tool_call.strategy_required":
            return "同类工具失败已发生两次，正在调整执行策略";
        case "agent.tool_call.failed":
        case "turn.failed":
        case "agent.failed":
            return "Agent 执行出现问题，任务未完成";
        case "turn.budgetExhausted":
        case "agent.budget_exhausted":
            return "预算已用尽，可增加预算后继续";
        case "agent.tool_call.invalid":
            return "工具调用未通过校验，AI 正在自动修正";
        case "agent.waiting_user":
        case "turn.waiting":
            return describeWaiting(event.payload);
        case "agent.resumed":
            return "已收到前端反馈，继续执行";
        case "turn.resumed":
            return "继续执行";
        case "turn.verifying":
            return "正在核验任务完成条件";
        case "agent.completion.fact_check": {
            const check = asRecord(event.payload.check);
            if (check?.status === "passed") {
                return "动作事实检查已通过";
            }
            return describeCompletionFactCheck(check);
        }
        case "agent.user_input.accepted":
            return "已接收运行中追加的要求";
        case "progress_log.created":
            return typeof event.payload.message === "string" && event.payload.message.trim()
                ? event.payload.message
                : "Agent 已更新运行进度";
        case "agent.canvas_operation.prepared":
            return "已准备画布动作";
        case "agent.canvas_operation.applying":
            return "正在写入真实画布";
        case "agent.canvas_operation.applied":
            return operationMessage(event, "画布动作已真实生效");
        case "agent.canvas_operation.rejected":
            return "用户已拒绝画布预览，未修改真实画布";
        case "agent.canvas_operation.failed":
            return operationMessage(event, "画布动作未生效");
        case "agent.frontend_tool.prepared":
            return `正在读取${frontendToolMessage(event)}`;
        case "agent.frontend_tool.applied":
            return `已读取${frontendToolMessage(event)}`;
        case "agent.frontend_tool.failed":
            return `读取${frontendToolMessage(event)}失败`;
        default:
            return null;
    }
};

/** 将宿主事实归类为前端可区分的等待、缺少约束、拒绝或执行错误。 */
export const aiDrivenTaskNoticeKind = (event: IAiDrivenTaskEvent): AiDrivenTaskNoticeKind | null => {
    if (event.kind === "agent.waiting_user" || event.kind === "turn.waiting")
        return waitingNoticeKind(event.payload);
    if (event.kind === "agent.completion.fact_check") {
        const check = asRecord(event.payload.check);
        if (!check || check.status === "passed")
            return null;
        const reason = normalizedReason(check.reason ?? check.waitingReason ?? check.code);
        if (isMissingConstraintReason(reason) || hasMissingConstraint(check))
            return "missingConstraint";
        if (reason === "rejected" || reason === "userrejected" || check.status === "rejected" || check.status === "declined")
            return "rejected";
        return check.status === "waiting" ? "waiting" : "executionError";
    }
    if (event.kind === "agent.canvas_operation.rejected")
        return "rejected";
    if (["agent.canvas_operation.failed", "agent.frontend_tool.failed"].includes(event.kind))
        return "executionError";
    if (["agent.failed", "turn.failed", "agent.tool_call.failed", "agent.tool_call.strategy_required"].includes(event.kind))
        return "executionError";
    return null;
};

const operationMessage = (event: IAiDrivenTaskEvent, fallback: string): string => {
    const operation = asRecord(event.payload.operation);
    const componentIds = Array.isArray(operation?.componentIds) ? operation.componentIds : [];
    return componentIds.length > 0 ? `${fallback}（${componentIds.length} 个组件）` : fallback;
};

const frontendToolMessage = (event: IAiDrivenTaskEvent): string => {
    const operationType = typeof event.payload.operationType === "string" ? event.payload.operationType : "画布信息";
    switch (operationType) {
        case "inspect_current_page":
        case "get_component_snapshots":
            return "组件实时快照";
        case "get_component_data_contract":
            return "组件数据契约";
        case "get_component_catalog":
            return "组件目录";
        case "get_current_canvas_selection":
            return "当前选区";
        default:
            return "画布状态";
    }
};

const describeWaiting = (payload: Record<string, unknown>): string => {
    const noticeKind = waitingNoticeKind(payload);
    if (noticeKind === "missingConstraint")
        return "缺少结构化要求，等待补充后继续";
    if (noticeKind === "rejected")
        return "操作已被拒绝，保留已生效结果";
    if (noticeKind === "executionError")
        return "执行出现错误，等待处理";

    const pending = asRecord(payload.pending);
    const kind = normalizedReason(pending?.kind ?? payload.status);
    if (kind === "frontendtool" || kind === "waitingfrontendtool")
        return "正在等待前端工具返回";
    if (kind === "userinput" || kind === "waitinguserinput")
        return "等待你补充信息";
    if (kind === "userconfirmation" || kind === "waitinguserconfirmation" || kind === "approval")
        return "等待你确认画布动作";
    return "正在等待前端交互";
};

const waitingNoticeKind = (payload: Record<string, unknown>): AiDrivenTaskNoticeKind => {
    const reason = normalizedReason(payload.reason ?? payload.waitingReason ?? payload.code);
    if (isMissingConstraintReason(reason))
        return "missingConstraint";
    if (reason === "rejected" || reason === "userrejected")
        return "rejected";
    if (reason === "executionerror" || reason === "failed")
        return "executionError";
    return "waiting";
};

const describeCompletionFactCheck = (check: Record<string, unknown> | null): string => {
    if (!check)
        return "画布动作返回失败";
    const reason = normalizedReason(check.reason ?? check.waitingReason ?? check.code);
    if (isMissingConstraintReason(reason) || hasMissingConstraint(check))
        return "缺少必需的真实结果，等待继续处理";
    if (reason === "rejected" || reason === "userrejected" || check.status === "rejected" || check.status === "declined")
        return "动作已被拒绝，已保留已生效结果";
    if (reason === "executionerror" || reason === "failed" || check.status === "failed" || check.status === "error")
        return "画布动作执行失败，任务未完成";
    return check.status === "waiting"
        ? "正在等待画布动作返回结果"
        : "画布动作返回失败";
};

const hasMissingConstraint = (check: Record<string, unknown>) => {
    return ["missingRequiredCanvasEffects", "missingRequiredEffects", "missingRequirements", "missingConstraints"]
        .some((key) => Array.isArray(check[key]) && check[key].length > 0);
};

const isMissingConstraintReason = (reason: string) => [
    "missingconstraint",
    "missingrequirement",
    "missingrequired",
    "missingfact",
].includes(reason);

const normalizedReason = (value: unknown) => {
    if (typeof value !== "string")
        return "";
    return value
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[-\s]+/g, "_")
        .toLowerCase()
        .replaceAll("_", "");
};

const numberPayload = (event: IAiDrivenTaskEvent, key: string, fallback: number) => {
    const value = Number(event.payload[key]);
    return Number.isFinite(value) ? value : fallback;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
};

const describeTool = (toolName: string): string | null => {
    if (toolName === "report_progress")
        return null;
    return `正在${getAiDrivenToolPresentation(toolName).title}`;
};
