/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import aiDrivenProgressTerminalStore, {
    type AiDrivenProgressLogLevel,
} from "@/designer/ai-driven/AiDrivenProgressTerminalStore.ts";
import {FrontendEffectClientError} from "@/frontend-effect/FrontendEffectClientError.ts";

/**
 * AI驱动进度日志推送请求。
 */
interface PushAiDrivenProgressLogPayload {
    /** 要追加到日志终端的进度内容。 */
    message: string;
    /** 日志级别，用于控制终端行颜色。 */
    level?: AiDrivenProgressLogLevel;
    /** 当前任务进度标题，不传则保持原标题。 */
    progressTitle?: string;
    /** 是否同步设置日志终端显示状态。 */
    visible?: boolean;
}

/**
 * AI驱动进度日志推送结果。
 */
interface PushAiDrivenProgressLogResult {
    /** 是否已成功追加日志。 */
    pushed: boolean;
    /** 追加后的日志总数。 */
    logCount: number;
    /** 当前日志终端显示状态。 */
    visible: boolean;
    /** 当前任务进度展示标题。 */
    progressTitle: string;
}

const AI_DRIVEN_PROGRESS_LOG_LEVELS: AiDrivenProgressLogLevel[] = [
    "info",
    "success",
    "warning",
    "error",
];

/**
 * 执行 AI驱动进度日志推送工具。
 */
export function runPushAiDrivenProgressLogTool(payload: unknown): PushAiDrivenProgressLogResult {
    const logPayload = normalizePayload(payload);

    if (typeof logPayload.visible === "boolean")
        aiDrivenProgressTerminalStore.setVisible(logPayload.visible);
    if (typeof logPayload.progressTitle === "string")
        aiDrivenProgressTerminalStore.setProgressTitle(logPayload.progressTitle);

    aiDrivenProgressTerminalStore.appendLog({
        message: logPayload.message,
        level: logPayload.level,
    });

    return {
        pushed: true,
        logCount: aiDrivenProgressTerminalStore.logs.length,
        visible: aiDrivenProgressTerminalStore.visible,
        progressTitle: aiDrivenProgressTerminalStore.displayProgressTitle,
    };
}

/**
 * 归一化并校验进度日志推送入参。
 */
function normalizePayload(payload: unknown): PushAiDrivenProgressLogPayload {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new FrontendEffectClientError("invalid_payload", "进度日志推送入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });
    }

    const rawPayload = payload as PushAiDrivenProgressLogPayload;
    if (typeof rawPayload.message !== "string" || !rawPayload.message.trim()) {
        throw new FrontendEffectClientError("invalid_payload", "message 必须是非空字符串", {
            fieldPath: "message", actualValue: rawPayload.message, expectedValue: "non-empty string",
        });
    }

    if (
        rawPayload.level !== undefined
        && !AI_DRIVEN_PROGRESS_LOG_LEVELS.includes(rawPayload.level)
    ) {
        throw new FrontendEffectClientError("invalid_payload", "level 只能是 info、success、warning 或 error", {
            fieldPath: "level", actualValue: rawPayload.level, allowedValues: AI_DRIVEN_PROGRESS_LOG_LEVELS,
        });
    }

    if (
        rawPayload.progressTitle !== undefined
        && typeof rawPayload.progressTitle !== "string"
    ) {
        throw new FrontendEffectClientError("invalid_payload", "progressTitle 必须是字符串", {
            fieldPath: "progressTitle", actualValue: rawPayload.progressTitle, expectedValue: "string",
        });
    }

    if (
        rawPayload.visible !== undefined
        && typeof rawPayload.visible !== "boolean"
    ) {
        throw new FrontendEffectClientError("invalid_payload", "visible 必须是布尔值", {
            fieldPath: "visible", actualValue: rawPayload.visible, expectedValue: "boolean",
        });
    }

    return {
        message: rawPayload.message,
        level: rawPayload.level,
        progressTitle: rawPayload.progressTitle,
        visible: rawPayload.visible,
    };
}
