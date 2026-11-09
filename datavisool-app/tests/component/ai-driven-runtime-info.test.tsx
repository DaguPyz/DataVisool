/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import type {IAiDrivenTaskEvent} from "@/designer/ai-driven/types/AiDrivenTaskSubmitTypes.ts";
vi.mock("@/i18n/miniI18n.ts", () => ({tx: (value: string) => value}));
vi.mock("@/i18n/useLocaleVersion.ts", () => ({useLocaleVersion: () => 0}));
import Terminal from "@/designer/ai-driven/AiDrivenProgressTerminal.tsx";
import store from "@/designer/ai-driven/AiDrivenProgressTerminalStore.ts";

const event = (kind: string, payload: Record<string, unknown> = {}): IAiDrivenTaskEvent => ({
    eventId: "event", threadId: "thread", turnId: "turn", runId: "run", projectId: "project", requestId: "request",
    kind, payload, sequence: 1, threadSequence: 1, dedupeKey: "event", schemaVersion: 3, createdAt: Date.now(),
});
const usage = {inputTokens: 100, outputTokens: 20, totalTokens: 120};

describe("desktop aligned runtime information", () => {
    beforeEach(() => {
        store.reset();
        vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback =>
            window.setTimeout(() => callback(performance.now()), 16));
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => window.clearTimeout(id));
        store.startRun("run");
    });
    afterEach(() => { cleanup(); store.reset(); vi.restoreAllMocks(); });

    test("keeps the header compact and reveals both scopes with runtime details", async () => {
        store.applyTaskEvent(event("agent.model_call.completed", {usage: {...usage, cachedInputTokens: 60,
            cacheCreationInputTokens: 10, contextInputTokens: 500, activeContextTokens: 100,
            contextCapacityTokens: 200000, compactionCount: 2, remainingTotalTokens: 1000,
            remainingModelCalls: 3, remainingToolCalls: 5, remainingWriteCalls: 2,
            remainingFrontendInteractions: 1, remainingDurationMs: 60000,
            threadUsage: {inputTokens: 1000, outputTokens: 200, totalTokens: 1200, cachedInputTokens: 600}}}));
        render(<Terminal/>);
        const trigger = screen.getByRole("button", {name: "查看 Token 消耗明细"});
        expect(within(trigger).getByText("本轮")).toBeInTheDocument();
        expect(within(trigger).getByText("120")).toBeInTheDocument();
        expect(within(trigger).getByText("会话累计")).toBeInTheDocument();
        expect(within(trigger).getByText("1,200")).toBeInTheDocument();
        expect(screen.queryByText("输入")).toBeNull();
        expect(screen.queryByText("当前上下文")).toBeNull();
        fireEvent.click(trigger);
        const details = await screen.findByRole("dialog", {name: "Token 消耗明细"});
        for (const label of ["缓存命中", "缓存新建", "压缩次数", "剩余 Token", "剩余模型调用",
            "剩余工具调用", "剩余写入调用", "剩余前端交互", "剩余时长"])
            expect(within(details).getByText(label)).toBeInTheDocument();
        expect(within(details).queryByText("当前上下文")).toBeNull();
        expect(within(details).queryByText("100 / 200,000")).toBeNull();
        expect(within(details).getByRole("row", {name: "输入 100 1,000"})).toBeInTheDocument();
        expect(within(details).getByRole("row", {name: "缓存命中 60 600"})).toBeInTheDocument();
        expect(store.tokenUsage?.inputTokens).toBe(100);
        expect(store.tokenUsage?.contextInputTokens).toBe(500);
        fireEvent.keyDown(document, {key: "Escape"});
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {timeout: 2000});
        expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    test("disabled budgets and unknown cache metrics are not shown in the details", async () => {
        store.setTokenUsage({...usage, tokenBudgetEnabled: false, callBudgetEnabled: false,
            durationBudgetEnabled: false, remainingTotalTokens: null, remainingModelCalls: null,
            remainingToolCalls: null, remainingDurationMs: null});
        render(<Terminal/>);
        fireEvent.click(screen.getByRole("button", {name: "查看 Token 消耗明细"}));
        await screen.findByRole("dialog", {name: "Token 消耗明细"});
        expect(screen.queryByText("剩余 Token")).toBeNull();
        expect(screen.queryByText("剩余模型调用")).toBeNull();
        expect(screen.queryByText("剩余时长")).toBeNull();
        expect(screen.queryByText("缓存命中")).toBeNull();
    });

    test("hover and keyboard focus can reveal details, and outside clicks dismiss them", async () => {
        store.setTokenUsage(usage);
        render(<Terminal/>);
        const trigger = screen.getByRole("button", {name: "查看 Token 消耗明细"});
        // 缺少后端会话统计时不把本轮数字冒充会话总量。
        expect(within(trigger).getByText("—")).toBeInTheDocument();
        fireEvent.mouseEnter(trigger);
        await screen.findByRole("dialog", {name: "Token 消耗明细"});
        fireEvent.mouseLeave(trigger);
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {timeout: 2000});
        fireEvent.focus(trigger);
        await screen.findByRole("dialog", {name: "Token 消耗明细"});
        // 浏览器点击会先聚焦，不能让随后的 click 将已显示的浮层反向关闭。
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        fireEvent.blur(trigger);
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {timeout: 2000});
        fireEvent.click(trigger);
        await screen.findByRole("dialog", {name: "Token 消耗明细"});
        fireEvent.mouseDown(document.body);
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {timeout: 2000});
    });

    test("session totals are snapshots, survive event replay, and reset for a new task", () => {
        const threadUsage = {inputTokens: 1000, outputTokens: 200, totalTokens: 1200};
        const snapshot = {...usage, threadUsage};
        store.setRuntimeSnapshot({usage: snapshot, operations: []});
        store.applyTaskEvent(event("agent.model_call.completed", {usage: snapshot}));
        store.applyTaskEvent(event("agent.model_call.completed", {usage: snapshot}));
        expect(store.tokenUsage?.threadUsage?.totalTokens).toBe(1200);
        store.setTokenUsage({...usage, threadUsage: {...threadUsage, totalTokens: 1100}});
        expect(store.tokenUsage?.threadUsage?.totalTokens).toBe(1200);
        store.startRun("new-task");
        expect(store.tokenUsage?.totalTokens).toBe(0);
        expect(store.tokenUsage?.threadUsage).toBeUndefined();
        store.setTokenUsage({inputTokens: 0, outputTokens: 0, totalTokens: 0, threadUsage});
        expect(store.tokenUsage?.threadUsage?.totalTokens).toBe(1200);
        store.startRun("other-thread-task");
        store.setTokenUsage({...usage, threadUsage: {inputTokens: 100, outputTokens: 20, totalTokens: 120}});
        expect(store.tokenUsage?.threadUsage?.totalTokens).toBe(120);
    });

    test("replay protects cumulative totals but permits smaller current context after compaction", () => {
        store.setTokenUsage({...usage, activeContextTokens: 900, cachedInputTokens: 60});
        store.setTokenUsage({inputTokens: 1, outputTokens: 1, totalTokens: 2});
        expect(store.tokenUsage?.totalTokens).toBe(120);
        store.applyTaskEvent(event("agent.context_compaction.completed",
            {usage: {...usage, activeContextTokens: 200, compactionCount: 1}}));
        expect(store.tokenUsage).toMatchObject({totalTokens: 120, cachedInputTokens: 60,
            activeContextTokens: 200, compactionCount: 1});
        store.setTokenUsage({...usage, activeContextTokens: "bad", remainingTotalTokens: -1});
        expect(store.tokenUsage?.remainingTotalTokens).toBeNull();
    });

    test.each([
        ["turn.waiting", {status: "waitingUserInput"}, "等待你补充信息", "waiting"],
        ["agent.canvas_operation.rejected", {}, "用户已拒绝画布预览，未修改真实画布", "rejected"],
        ["agent.completion.fact_check", {check: {status: "failed", reason: "missing_constraint"}},
            "缺少必需的真实结果，等待继续处理", "missingConstraint"],
        ["agent.tool_call.strategy_required", {}, "同类工具失败已发生两次，正在调整执行策略", "executionError"],
    ])("renders %s notices and clears them when execution resumes", (kind, payload, message, expectedKind) => {
        store.applyTaskEvent(event(kind as string, payload as Record<string, unknown>));
        expect(store.runNotice?.kind).toBe(expectedKind);
        render(<Terminal/>);
        expect(screen.getByText(message as string)).toBeInTheDocument();
        act(() => store.applyTaskEvent(event("agent.resumed")));
        expect(screen.queryByText(message as string)).toBeNull();
    });
});
