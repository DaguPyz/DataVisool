/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Down, Right} from "@icon-park/react";
import {Button} from "@datavisool/ui";
import {useState} from "react";
import {tx} from "@/i18n/miniI18n.ts";
import type {
    IAiDrivenBudgetExtension,
    IAiDrivenExecutionLimitsSnapshot,
} from "../types/AiDrivenTaskSubmitTypes.ts";
import type {IAiDrivenItem, IAiDrivenTurn} from "./AiDrivenThreadTypes.ts";
import AiDrivenItemView from "./AiDrivenItemView.tsx";

interface AiDrivenTurnViewProps {
    turn: IAiDrivenTurn;
    items: IAiDrivenItem[];
    expanded: boolean;
    loadingItems: boolean;
    itemsLoaded: boolean;
    hasMoreItems: boolean;
    errorMessage?: string;
    onToggle: () => void;
    onLoadMoreItems: () => void;
    onResume?: (budgetExtension?: IAiDrivenBudgetExtension) => void;
}

const TURN_STATUS_TITLES: Record<string, string> = {
    created: "等待执行",
    running: "执行中",
    verifying: "完成核验中",
    waitingFrontendTool: "等待前端交互",
    waitingUserInput: "等待用户输入",
    waitingUserConfirmation: "等待用户确认",
    completed: "已完成",
    cancelled: "已取消",
    failed: "失败",
    interrupted: "已中断",
    budgetExhausted: "预算已用尽",
};

const AiDrivenTurnView = ({
    turn,
    items,
    expanded,
    loadingItems,
    itemsLoaded,
    hasMoreItems,
    errorMessage,
    onToggle,
    onLoadMoreItems,
    onResume,
}: AiDrivenTurnViewProps) => {
    const [budgetExtension, setBudgetExtension] = useState<BudgetExtensionDraft>({});
    const [budgetError, setBudgetError] = useState("");
    const isBudgetExhausted = turn.status === "budgetExhausted";
    const canResume = turn.recoverable !== false;
    const limits = turn.limits ?? turn.latestRun?.limits ?? null;
    const hasAuthorizationFlags = hasBudgetAuthorizationFlags(limits);
    const budgetFields = hasAuthorizationFlags ? BUDGET_EXTENSION_FIELDS.filter(({key}) => isBudgetEnabled(limits, key)) : [];
    const submitBudgetExtension = () => {
        const {extension, invalid} = parseBudgetExtension(budgetExtension, turn.usage, limits);
        if (invalid) {
            setBudgetError(tx("新的累计预算必须为整数且高于当前上限和已用量"));
            return;
        }
        if (Object.keys(extension).length === 0) {
            setBudgetError(tx("请至少增加一项预算后继续"));
            return;
        }
        setBudgetError("");
        onResume?.(extension);
    };
    return <section className="ai-driven-history-turn">
        <button className="ai-driven-history-turn-toggle"
                type="button"
                aria-expanded={expanded}
                onClick={onToggle}>
            <span className="ai-driven-history-turn-icon" aria-hidden="true">
                {expanded ? <Down size={14}/> : <Right size={14}/>}
            </span>
            <span className="ai-driven-history-turn-copy">
                <strong>{turn.inputSummary || `${tx("第")} ${turn.turnSequence} ${tx("轮")}`}</strong>
                <small>{formatTurnTime(turn.createdAt)}</small>
            </span>
            <span className="ai-driven-history-status" data-status={turn.status}>
                {tx(TURN_STATUS_TITLES[turn.status] ?? turn.status)}
            </span>
        </button>
        {expanded && (
            <div className="ai-driven-history-turn-content">
                {items.map((item) => <AiDrivenItemView key={item.itemId} item={item}/>)}
                {loadingItems && <div className="ai-driven-history-loading">{tx("正在加载工作记录…")}</div>}
                {!loadingItems && itemsLoaded && items.length === 0 && (
                    <div className="ai-driven-history-empty-inline">{tx("本轮暂无可展示记录")}</div>
                )}
                {errorMessage && <div className="ai-driven-history-error" role="alert">{errorMessage}</div>}
                {turn.status === "interrupted" && canResume && onResume && (
                    <Button type="primary" size="sm" onClick={() => onResume()}>
                        {tx("继续此任务")}
                    </Button>
                )}
                {isBudgetExhausted && canResume && onResume && (
                    <div className="ai-driven-budget-extension" role="group" aria-label={tx("增加预算后继续")}>
                        <p>{tx("预算已用尽。请输入新的累计上限后继续，已有用量不会清零。")}</p>
                        {hasAuthorizationFlags ? (
                            budgetFields.length > 0 ? (
                                <>
                                    <div className="ai-driven-budget-extension-fields">
                                        {budgetFields.map(({key, label}) => (
                                            <label key={key}>
                                                <span>
                                                    {tx(label)}
                                                    <small>{budgetLimitText(limits, key, turn.usage)}</small>
                                                </span>
                                                <input type="number"
                                                       min={budgetMinimum(limits, turn.usage, key)}
                                                       step={1}
                                                       value={budgetExtension[key] ?? ""}
                                                       placeholder={budgetPlaceholder(turn.usage, key)}
                                                       aria-label={tx(label)}
                                                       onChange={(event) => setBudgetExtension((current) => ({
                                                           ...current,
                                                           [key]: event.target.value,
                                                       }))}/>
                                            </label>
                                        ))}
                                    </div>
                                    {budgetError && <div className="ai-driven-history-error" role="alert">{budgetError}</div>}
                                    <Button type="primary" size="sm" onClick={submitBudgetExtension}>
                                        {tx("增加预算后继续")}
                                    </Button>
                                </>
                            ) : <p>{tx("当前没有可扩展的预算授权")}</p>
                        ) : <p>{tx("预算授权信息不可用，请刷新历史记录后重试")}</p>}
                    </div>
                )}
                {hasMoreItems && !loadingItems && (
                    <Button type="text" size="sm" onClick={onLoadMoreItems}>
                        {tx("加载更多工作记录")}
                    </Button>
                )}
            </div>
        )}
    </section>;
};

type BudgetExtensionKey = keyof IAiDrivenBudgetExtension;
type BudgetExtensionDraft = Partial<Record<BudgetExtensionKey, string>>;

const BUDGET_EXTENSION_FIELDS: Array<{key: BudgetExtensionKey; label: string}> = [
    {key: "maxTotalTokens", label: "累计 Token 上限"},
    {key: "maxModelCalls", label: "模型调用上限"},
    {key: "maxToolCalls", label: "工具调用上限"},
    {key: "maxWriteCalls", label: "写入调用上限"},
    {key: "maxFrontendInteractions", label: "前端交互上限"},
    {key: "maxDurationMs", label: "任务时长上限（分钟）"},
];

const isBudgetEnabled = (limits: IAiDrivenExecutionLimitsSnapshot | null, key: BudgetExtensionKey) => {
    if (key === "maxTotalTokens")
        return limits?.tokenBudgetEnabled === true;
    if (key === "maxDurationMs")
        return limits?.durationBudgetEnabled === true;
    return limits?.callBudgetEnabled === true;
};

const hasBudgetAuthorizationFlags = (limits: IAiDrivenExecutionLimitsSnapshot | null) => Boolean(
    limits
    && typeof limits.tokenBudgetEnabled === "boolean"
    && typeof limits.callBudgetEnabled === "boolean"
    && typeof limits.durationBudgetEnabled === "boolean",
);

const budgetLimitValue = (limits: IAiDrivenExecutionLimitsSnapshot | null, key: BudgetExtensionKey) => {
    if (!limits)
        return undefined;
    return limits[key];
};

const budgetScale = (key: BudgetExtensionKey) => key === "maxDurationMs" ? 60_000 : 1;

const budgetMinimum = (
    limits: IAiDrivenExecutionLimitsSnapshot | null,
    usage: Record<string, unknown> | null,
    key: BudgetExtensionKey,
) => {
    const scale = budgetScale(key);
    const used = budgetUsedValue(usage, key) ?? 0;
    const limit = budgetLimitValue(limits, key) ?? 0;
    return Math.max(1, Math.floor(Math.max(used, limit) / scale) + 1);
};

const budgetLimitText = (
    limits: IAiDrivenExecutionLimitsSnapshot | null,
    key: BudgetExtensionKey,
    usage: Record<string, unknown> | null,
) => {
    const limit = budgetLimitValue(limits, key);
    const used = budgetUsedValue(usage, key);
    if (limit === undefined && used === undefined)
        return null;
    const scale = budgetScale(key);
    const format = (value: number) => key === "maxDurationMs"
        ? `${(value / scale).toFixed(1)} 分钟`
        : value.toLocaleString("en-US");
    return <small>{`（当前上限 ${limit === undefined ? "未知" : format(limit)}，已用 ${used === undefined ? "未知" : format(used)}）`}</small>;
};

const parseBudgetExtension = (
    draft: BudgetExtensionDraft,
    usage: Record<string, unknown> | null,
    limits: IAiDrivenExecutionLimitsSnapshot | null,
): {extension: IAiDrivenBudgetExtension; invalid: boolean} => {
    const extension: IAiDrivenBudgetExtension = {};
    let invalid = false;
    BUDGET_EXTENSION_FIELDS.forEach(({key}) => {
        if (!isBudgetEnabled(limits, key) || !draft[key]?.trim()) return;
        const input = Number(draft[key]);
        const value = input * budgetScale(key);
        const used = budgetUsedValue(usage, key);
        if (!Number.isSafeInteger(input) || value <= Math.max(used ?? 0, budgetLimitValue(limits, key) ?? 0))
            invalid = true;
        else
            extension[key] = value;
    });
    return {extension, invalid};
};

const budgetUsedValue = (usage: Record<string, unknown> | null, key: BudgetExtensionKey) => {
    if (!usage)
        return undefined;
    const usageKey: Record<BudgetExtensionKey, string> = {
        maxTotalTokens: "totalTokens",
        maxModelCalls: "modelCalls",
        maxToolCalls: "toolCalls",
        maxWriteCalls: "writeCalls",
        maxFrontendInteractions: "frontendInteractions",
        maxDurationMs: "elapsedMs",
    };
    const value = Number(usage[usageKey[key]]);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
};

const budgetPlaceholder = (usage: Record<string, unknown> | null, key: BudgetExtensionKey) => {
    const used = budgetUsedValue(usage, key);
    if (used === undefined)
        return undefined;
    const scale = budgetScale(key);
    const display = key === "maxDurationMs" ? `${(used / scale).toFixed(1)} 分钟` : used.toLocaleString("en-US");
    return `已用 ${display}，请输入更高上限`;
};

const formatTurnTime = (timestamp: number) => {
    if (!Number.isFinite(timestamp))
        return "";
    return new Date(timestamp).toLocaleString(undefined, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
};

export default AiDrivenTurnView;
