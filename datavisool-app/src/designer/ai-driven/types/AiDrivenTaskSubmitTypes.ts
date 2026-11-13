/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * AI驱动任务提交协议版本。
 */
export type AiDrivenTaskSchemaVersion = "ai-driven-task/v3";

/**
 * AI驱动任务附件用途。
 */
export type AiDrivenAttachmentRole = "prompt-image" | "canvas-snapshot";

/**
 * AI驱动任务选区模式。
 */
export type AiDrivenSelectionMode = "none" | "single" | "multiple";

/**
 * AI驱动快捷指令名称。
 */
export type AiDrivenShortcutCommandName = "style" | "data";

/**
 * AI驱动任务提交后返回的运行状态。
 */
export type AiDrivenTaskSubmitStatus =
    | "created"
    | "queued"
    | "running"
    | "verifying"
    | "waitingFrontendTool"
    | "waitingUserInput"
    | "waitingUserConfirmation"
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted"
    | "budgetExhausted";

/** 判断当前运行状态是否确实需要用户补充信息或确认。 */
export const isAiDrivenUserActionRequired = (status?: AiDrivenTaskSubmitStatus) =>
    status === "waitingUserInput" || status === "waitingUserConfirmation";

/**
 * AI驱动控制台发起一次任务时提交给后端的完整请求对象。
 */
export interface IAiDrivenTaskSubmitPayload {
    /** 协议版本，用于后续数据结构兼容升级。 */
    schemaVersion: AiDrivenTaskSchemaVersion;
    /** 单次提交请求id，用于幂等处理、日志追踪和重试排查。 */
    requestId: string;
    /** AI驱动面板会话id，用于串联同一次打开期间的请求和附件。 */
    sessionId: string;
    /** 当前项目id，来自 window.DATAVISOOL_ENV.projectId。 */
    projectId: string;
    /** 本轮任务所属的长期 Thread；不再由 sessionId 推导。 */
    threadId: string;
    /** 用户选择的模型配置和运行型号。 */
    model: IAiDrivenModelSelection;
    /** 用户本轮输入的自然语言需求。 */
    requirement: string;
    /** 快捷指令上下文；仅作为统一 Agent 的意图提示。 */
    shortcut?: IAiDrivenShortcutContext;
    /** 用户上传附件或前端生成附件的引用列表。 */
    attachments: IAiDrivenAttachmentContext[];
    /** 请求发起时的画布宽高快照。 */
    canvasSnapshot: IAiDrivenCanvasSnapshot;
    /** 请求发起时的选中组件上下文。 */
    selection: IAiDrivenSelectionContext;
    /** 前端环境信息，用于链路排查。 */
    clientContext?: IAiDrivenClientContext;
}

/**
 * 快捷指令提交上下文。
 */
export interface IAiDrivenShortcutContext {
    /** 用户选择的快捷指令。 */
    command: AiDrivenShortcutCommandName;
    /** 用户输入区原始文本，用于审计和排查。 */
    rawText: string;
}

/**
 * AI模型选择信息。
 */
export interface IAiDrivenModelSelection {
    /** AI模型配置记录id，对应前端 modelConfigId。 */
    modelConfigId: string;
    /** 当前模型配置下选择的具体运行模型名，对应前端 runtimeModelId。 */
    runtimeModelId: string;
    /** 模型厂商标识，便于后端快速路由和日志分析。 */
    provider?: string;
}

/**
 * AI任务中引用的附件信息。
 */
export interface IAiDrivenAttachmentContext {
    /** 附件用途，prompt-image 表示用户输入区上传图片，canvas-snapshot 表示画布视觉截图。 */
    role: AiDrivenAttachmentRole;
    /** 附件主键，来自 IAiDrivenAttachmentReference.attachmentId。 */
    attachmentId: string;
    /** 上传请求id，用于排查一次上传链路。 */
    uploadRequestId?: string;
    /** 用户上传时的原始文件名。 */
    originalName?: string;
    /** 后端归一化后的 MIME 类型。 */
    mimeType?: string;
    /** 文件内容 SHA-256 哈希，用于去重和校验。 */
    sha256?: string;
    /** 图片宽度，能识别时传。 */
    width?: number | null;
    /** 图片高度，能识别时传。 */
    height?: number | null;
}

/**
 * 请求发起时的画布快照。
 */
export interface IAiDrivenCanvasSnapshot {
    /** 画布宽度，用于后端判断布局边界。 */
    width: number;
    /** 画布高度，用于后端判断布局边界。 */
    height: number;
    /** 请求发起时的设计器 Manager ID，用于阻止任务运行期间切换画布后误写。 */
    managerId?: string;
}

/**
 * 请求发起时的选中组件上下文。
 */
export interface IAiDrivenSelectionContext {
    /** 选区模式：未选中、单选或多选；按过滤分组图层后的组件数量计算。 */
    mode: AiDrivenSelectionMode;
    /** 实际提交给后端的组件id列表，需从 eventOperateStore.targetIds 中移除 type 为 group 的图层。 */
    targetIds: string[];
    /** 当前选中组件的结构化快照列表，不包含 type 为 group 的分组图层。 */
    components: IAiDrivenSelectedComponentSnapshot[];
}

/**
 * 选中组件快照。
 */
export interface IAiDrivenSelectedComponentSnapshot {
    /** 组件图层id。 */
    id: string;
    /** 组件类型。 */
    type?: string;
    /** 组件名称。 */
    name?: string;
}

/**
 * 前端环境信息。
 */
export interface IAiDrivenClientContext {
    /** 前端当前语言。 */
    locale?: string;
    /** 客户端时区。 */
    timezone?: string;
    /** 前端版本或构建号。 */
    appVersion?: string;
}

/**
 * AI任务提交后的轻量响应。
 */
export interface IAiDrivenTaskSubmitResult {
    /** 后端创建的任务id。 */
    taskId: string;
    /** 后端创建的运行id。 */
    runId: string;
    /** 任务所属的长期 Agent Thread 标识。 */
    threadId: string;
    /** 本次用户需求对应的 Agent Turn 标识。 */
    turnId: string;
    /** 后续运行事件回放的起始游标。 */
    eventCursor: number;
    /** 原样返回前端提交的 requestId。 */
    requestId: string;
    /** 任务绑定的项目 id。 */
    projectId: string;
    /** 仅用于客户端诊断，不参与任务授权作用域。 */
    clientSessionId: string;
    /** 后端任务当前状态。 */
    status: AiDrivenTaskSubmitStatus;
    limits?: IAiDrivenExecutionLimitsSnapshot;
    checkpointVersion?: number;
    recoverable?: boolean;
    /** 任务创建时间戳，单位毫秒。 */
    createdAt: number;
    /** 图工作流运行状态。 */
    workflowState?: unknown;
    /** Agent runtime 详细状态。 */
    runtime?: IAiDrivenRuntimeSnapshot;
    /** Agent 诊断信息。 */
    diagnostics?: IAiDrivenTaskDiagnostics;
}

export interface IAiDrivenCanvasOperationReceipt {
    operationId: string;
    toolCallId: string;
    kind: "createComponents" | "patchComponents";
    status: "prepared" | "applying" | "applied" | "rejected" | "failed";
    projectId: string;
    managerId?: string;
    componentIds: string[];
    componentBindings?: Record<string, string>;
    baseRevision?: string;
    resultRevision?: string;
    appliedAt?: number;
    error?: IAiDrivenTaskError & {retryable: boolean};
}

export interface IAiDrivenRuntimeSnapshot {
    provider?: string;
    model?: string;
    usage: IAiDrivenTokenUsage;
    /** 仅用于说明，不能证明画布动作成功。 */
    finalText?: string;
    /** 真实执行事实，来源仅限 operation journal。 */
    operations: IAiDrivenCanvasOperationReceipt[];
}

/** 模型服务返回的累计 Token 用量，缓存是输入的子项。 */
export interface IAiDrivenTokenTotals {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    /** Cache 命中是输入的子项，已包含在 provider 的输入/总量语义中。 */
    cachedInputTokens?: number;
    /** Provider 为本次请求创建的输入缓存，也是输入的子项。 */
    cacheCreationInputTokens?: number;
}

/** 当前轮任务的累计用量及当前上下文、预算快照。 */
export interface IAiDrivenTokenUsage extends IAiDrivenTokenTotals {
    /** 当前会话所有轮次的累计用量，已包含本轮；由后端去重统计。 */
    threadUsage?: IAiDrivenTokenTotals;
    /** 包含缓存的累计上下文输入；缺失时回退到 inputTokens。 */
    contextInputTokens?: number;
    /** 当前模型请求上下文的实际占用，与累计 inputTokens 独立。 */
    activeContextTokens?: number;
    /** 当前模型上下文容量。 */
    contextCapacityTokens?: number;
    /** 上下文容量来源，例如模型目录或保守回退。 */
    contextCapacitySource?: string;
    /** 已完成的上下文压缩次数。 */
    compactionCount?: number;
    /** 最近一次压缩前的上下文 Token 数。 */
    compactionBeforeTokens?: number;
    /** 最近一次压缩后的上下文 Token 数。 */
    compactionAfterTokens?: number;
    tokenBudgetEnabled?: boolean;
    callBudgetEnabled?: boolean;
    durationBudgetEnabled?: boolean;
    remainingModelCalls?: number | null;
    remainingToolCalls?: number | null;
    remainingWriteCalls?: number | null;
    remainingTotalTokens?: number | null;
    remainingFrontendInteractions?: number | null;
    remainingDurationMs?: number | null;
}

export interface IAiDrivenTaskError {
    code: string;
    message: string;
}

export interface IAiDrivenTaskDiagnostics {
    error?: IAiDrivenTaskError;
    persistenceError?: IAiDrivenTaskError;
    eventsRecorded: number;
}

/**
 * AI任务取消请求。
 */
export interface IAiDrivenTaskCancelPayload {
    /** 任务创建时绑定的项目 id。 */
    projectId: string;
    /** 任务所属 Thread。 */
    threadId: string;
    /** 任务所属 Turn。 */
    turnId: string;
    /** 当前执行 Run。 */
    runId: string;
}

/** 状态查询与取消使用相同的不可变作用域。 */
export type IAiDrivenTaskStatusPayload = IAiDrivenTaskCancelPayload;

/** 向当前活动 Turn 追加用户要求。 */
export interface IAiDrivenTaskSteerPayload {
    threadId: string;
    expectedTurnId: string;
    runId: string;
    projectId: string;
    inputId: string;
    input: string;
}

export interface IAiDrivenTaskSteerResult {
    threadId: string;
    turnId: string;
    acceptedInputId: string;
}

/** 后端持久化并实时推送的任务事件。 */
export interface IAiDrivenTaskEvent {
    eventId: string;
    threadId: string;
    turnId: string;
    itemId?: string | null;
    runId: string;
    requestId: string;
    projectId: string;
    sequence: number;
    threadSequence: number;
    kind: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
    schemaVersion: number;
    createdAt: number;
}

export interface IAiDrivenTaskEventsPayload extends IAiDrivenTaskStatusPayload {
    afterSequence: number;
    limit?: number;
}

export interface IAiDrivenTaskEventsResult {
    events: IAiDrivenTaskEvent[];
    nextCursor: number;
}

/**
 * AI任务取消后的最终响应。
 */
export interface IAiDrivenTaskCancelResult extends IAiDrivenTaskSubmitResult {
    /** 取消接口返回时任务应已进入最终态。 */
    status: AiDrivenTaskSubmitStatus;
}

export interface IAiDrivenExecutionLimitsSnapshot {
    tokenBudgetEnabled: boolean;
    callBudgetEnabled: boolean;
    durationBudgetEnabled: boolean;
    maxModelCalls: number;
    maxToolCalls: number;
    maxWriteCalls: number;
    maxTotalTokens: number;
    maxDurationMs: number;
    maxToolDurationMs?: number;
    maxConsecutiveFailures?: number;
    maxFrontendInteractions: number;
    maxSameReadRepeats?: number;
    maxCompletionContinuations?: number;
}


export interface IAiDrivenTaskResumePayload {
    projectId: string;
    threadId: string;
    turnId: string;
    sessionId: string;
    canvasSnapshot?: IAiDrivenCanvasSnapshot;
    previousRunId?: string;
    expectedCheckpointVersion?: number;
    /** 用户明确授权后的新的累计预算上限；不会重置既有用量。 */
    budgetExtension?: IAiDrivenBudgetExtension;
}

export interface IAiDrivenBudgetExtension {
    maxTotalTokens?: number;
    maxModelCalls?: number;
    maxToolCalls?: number;
    maxWriteCalls?: number;
    maxFrontendInteractions?: number;
    maxDurationMs?: number;
}
