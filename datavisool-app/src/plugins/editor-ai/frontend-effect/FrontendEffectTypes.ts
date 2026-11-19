/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/** Rust 发给前端的一次交互请求。 */
export interface FrontendEffectRequest {
    /** 本次前端交互唯一 id，用于回传时唤醒对应 Rust Future。 */
    effectId: string;
    /** Rust 计算的请求参数和任务作用域绑定，回执必须原样携带。 */
    binding: FrontendEffectBinding;
    /** 交互类型，区分工具调用和用户输入。 */
    kind: "toolCall" | "userInput";
    /** 工具名或用户输入场景名。 */
    name: string;
    /** 工具执行或输入弹窗渲染所需载荷。 */
    payload: unknown;
}

/** Rust 已停止等待某个前端交互。 */
export interface FrontendEffectCancelRequest {
    /** 要停止的 Effect id。 */
    effectId: string;
    /** 稳定停止原因。 */
    reason: string;
}

/** 前端完成一次交互后回传给 Rust 的响应。 */
export interface FrontendEffectResponse {
    /** 对应请求中的 effectId。 */
    effectId: string;
    /** 必须与请求 binding 一致，Rust 会拒绝跨请求或跨任务的回执。 */
    binding: FrontendEffectBinding;
    /** 前端是否成功完成交互。 */
    ok: boolean;
    /** 成功时返回的业务数据。 */
    data?: unknown;
    /** 失败或用户取消时返回的错误信息。 */
    error?: FrontendEffectErrorPayload;
}

/** Frontend Effect 的不可变服务端绑定。 */
export interface FrontendEffectBinding {
    requestHash: string;
    toolName: string;
    toolCallId: string;
    taskId?: string;
    runId?: string;
    turnId?: string;
}

/** 前端交互失败时返回给 Rust 的错误载荷。 */
export interface FrontendEffectErrorPayload {
    /** 稳定错误码，例如 user_cancelled 或 tool_failed。 */
    code: string;
    /** 给日志和上层错误提示使用的错误消息。 */
    message: string;
}

/** 前端工具函数签名。 */
export type FrontendEffectToolHandler = (payload: unknown, signal?: AbortSignal) => Promise<unknown> | unknown;

/** 用户补充输入弹窗的请求载荷。 */
export interface UserInputDialogPayload {
    questions?: UserInputQuestionPayload[];
}

export interface UserInputQuestionPayload {
    header: string;
    id: string;
    question: string;
    options: Array<{label: string; description: string}>;
}

/** 已渲染页面草稿的用户确认载荷。 */
export interface PreviewConfirmationPayload {
    /** renderDraft 返回的临时草稿 id。 */
    draftId: string;
    /** 本次预览的简短说明。 */
    message?: string;
}

/** 允许用户选择的单个组件候选。 */
export interface ComponentSelectionCandidatePayload {
    componentType: string;
    displayName: string;
    description?: string;
    defaultSelected?: boolean;
}

/** 有限候选组件选择载荷。 */
export interface ComponentSelectionPayload {
    message: string;
    candidates: ComponentSelectionCandidatePayload[];
    minSelected?: number;
    maxSelected?: number;
}
