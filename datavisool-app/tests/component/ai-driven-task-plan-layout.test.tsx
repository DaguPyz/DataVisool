/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, render, screen, within} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";

vi.mock("@/i18n/miniI18n.ts", () => ({tx: (value: string) => value}));
vi.mock("@/i18n/useLocaleVersion.ts", () => ({useLocaleVersion: () => 0}));

import AiDrivenProgressTerminal from "@/designer/ai-driven/AiDrivenProgressTerminal.tsx";
import store, {type IAiDrivenPlanStep} from "@/designer/ai-driven/AiDrivenProgressTerminalStore.ts";

const applyPlan = (steps: IAiDrivenPlanStep[]) => store.applyTaskEvent({
    eventId: "plan-event",
    threadId: "thread-1",
    turnId: "turn-1",
    runId: "run-1",
    requestId: "request-1",
    projectId: "project-1",
    sequence: 1,
    threadSequence: 1,
    dedupeKey: "plan-event",
    schemaVersion: 3,
    createdAt: Date.now(),
    kind: "item.completed",
    payload: {
        item: {
            itemId: "plan-1",
            itemType: "plan",
            status: "completed",
            payload: {explanation: "先调整布局，再修改颜色", steps},
        },
    },
});

describe("AI task plan layout", () => {
    beforeEach(() => {
        store.reset();
        vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        store.reset();
        vi.restoreAllMocks();
    });

    test.each(["idle", "running", "waiting", "completed", "failed", "cancelled", "budgetExhausted"] as const)(
        "shows only execution content without a plan when %s",
        (state) => {
            if (state === "idle")
                store.setVisible(true);
            else if (state === "running" || state === "waiting")
                store.startRun("run-1", state);
            else {
                store.startRun("run-1");
                store.finishRun(state, "本轮结果");
            }

            render(<AiDrivenProgressTerminal/>);

            expect(screen.getByRole("main")).toHaveTextContent("执行过程");
            expect(screen.queryByRole("complementary")).toBeNull();
            expect(screen.queryByRole("progressbar")).toBeNull();
            if (state === "completed" || state === "failed" || state === "cancelled" || state === "budgetExhausted")
                expect(within(screen.getByRole("main")).getByText("本轮结果")).toBeInTheDocument();
        },
    );

    test("shows arriving plan steps and updates progress, then removes the plan for a new run", () => {
        store.startRun("run-1");
        render(<AiDrivenProgressTerminal/>);
        expect(screen.queryByRole("complementary")).toBeNull();

        act(() => applyPlan([
            {step: "调整布局", status: "completed"},
            {step: "修改颜色", status: "inProgress"},
        ]));

        const tasks = screen.getByRole("complementary", {name: "任务列表与进度"});
        expect(within(tasks).getByText("调整布局")).toBeInTheDocument();
        expect(within(tasks).getByText("修改颜色")).toBeInTheDocument();
        expect(within(tasks).getByText("先调整布局，再修改颜色")).toBeInTheDocument();
        expect(within(tasks).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

        act(() => applyPlan([
            {step: "调整布局", status: "completed"},
            {step: "修改颜色", status: "completed"},
        ]));
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

        act(() => store.finishRun("completed", "调整完成"));
        expect(within(screen.getByRole("main")).getByText("调整完成")).toBeInTheDocument();
        expect(screen.getByRole("complementary")).toBeInTheDocument();

        act(() => store.startRun("run-2"));
        expect(screen.queryByRole("complementary")).toBeNull();
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(screen.getByRole("main")).toHaveTextContent("Agent 正在理解需求…");
    });

    test.each([
        ["agent.waiting_user", "等待操作"],
        ["turn.failed", "执行失败"],
        ["turn.cancelled", "已停止"],
        ["turn.budgetExhausted", "预算已用尽"],
    ])("keeps real steps and completed progress after %s", (kind, label) => {
        store.startRun("run-1");
        applyPlan([
            {step: "调整布局", status: "completed"},
            {step: "修改颜色", status: "inProgress"},
        ]);
        render(<AiDrivenProgressTerminal/>);

        act(() => store.applyTaskEvent({
            eventId: "state-event",
            threadId: "thread-1",
            turnId: "turn-1",
            runId: "run-1",
            requestId: "request-1",
            projectId: "project-1",
            sequence: 2,
            threadSequence: 2,
            dedupeKey: "state-event",
            schemaVersion: 3,
            createdAt: Date.now(),
            kind,
            payload: {},
        }));

        const tasks = screen.getByRole("complementary");
        expect(within(tasks).getByRole("img", {name: label})).toBeInTheDocument();
        expect(within(tasks).getByText("已完成")).toBeInTheDocument();
        expect(within(tasks).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    });
});
