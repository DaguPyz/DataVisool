/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, describe, expect, test, vi} from "vitest";
import {resumeAiDrivenTask, getAiDrivenTaskEvents} from "@/api/AiDrivenTaskApi.ts";
import {getAiDrivenThreadEvents} from "@/api/AiDrivenThreadApi.ts";
import {readAiDrivenTurn} from "@/api/AiDrivenTurnApi.ts";
import terminalStore from "@/designer/ai-driven/AiDrivenProgressTerminalStore.ts";
import {reduceAiDrivenItemEvent} from "@/designer/ai-driven/thread/AiDrivenItemEventReducer.ts";
import type {IAiDrivenItem} from "@/designer/ai-driven/thread/AiDrivenThreadTypes.ts";

const mocks = vi.hoisted(() => ({post: vi.fn(), postOrThrow: vi.fn()}));
vi.mock("@/util/AuthFetchUtil.ts", () => ({default: mocks}));

describe("Web AI recovery protocol", () => {
    beforeEach(() => vi.resetAllMocks());

    test("current task and history events retain messages, plans and tool calls", async () => {
        mocks.post.mockResolvedValue([
            {eventId: "e1", threadId: "thread", turnId: "turn", runId: "run", sequence: 1,
                type: "assistant.message.delta", payload: {itemId: "message", text: "你好"}},
            {eventId: "e2", threadId: "thread", turnId: "turn", runId: "run", sequence: 2,
                type: "assistant.message.completed", payload: {itemId: "message", text: "你好，完成"}},
            {eventId: "e3", threadId: "thread", turnId: "turn", runId: "run", sequence: 3,
                type: "plan.updated", payload: {itemId: "plan", explanation: "执行计划", steps: [{step: "创建页面", status: "completed"}]}},
            {eventId: "e4", threadId: "thread", turnId: "turn", runId: "run", sequence: 4,
                type: "tool.requested", payload: {requestId: "tool", name: "render_draft"}},
            {eventId: "e5", threadId: "thread", turnId: "turn", runId: "run", sequence: 5,
                type: "tool.completed", payload: {requestId: "tool", name: "render_draft", status: "completed", result: "ok"}},
        ]);
        const task = await getAiDrivenTaskEvents({projectId: "10", threadId: "thread", turnId: "turn", runId: "run", afterSequence: 0});
        terminalStore.reset();
        terminalStore.startRun("run");
        task!.events.forEach(terminalStore.applyTaskEvent);
        expect(terminalStore.agentMessages).toContainEqual(expect.objectContaining({id: "message", text: "你好，完成"}));
        expect(terminalStore.planSteps).toContainEqual(expect.objectContaining({step: "创建页面"}));
        expect(terminalStore.timelineItems).toContainEqual(expect.objectContaining({id: "tool", payload: expect.objectContaining({toolName: "render_draft"})}));
        const history = await getAiDrivenThreadEvents({projectId: "10", threadId: "thread", afterThreadSequence: 0});
        const items = history!.data.reduce<IAiDrivenItem[]>(reduceAiDrivenItemEvent, []);
        expect(items).toContainEqual(expect.objectContaining({itemId: "message", payload: {text: "你好，完成"}}));
        expect(items).toContainEqual(expect.objectContaining({itemId: "plan", payload: expect.objectContaining({explanation: "执行计划"})}));
        expect(items).toContainEqual(expect.objectContaining({itemId: "tool", payload: expect.objectContaining({toolName: "render_draft", result: "ok"})}));
        terminalStore.reset();
    });

    test("resume uses the new endpoint and retains cumulative usage and recovery metadata", async () => {
        mocks.postOrThrow.mockResolvedValue({threadId: "thread", turnId: "turn", runId: "run-2", turnStatus: "budget_exhausted",
            projectId: "10", requestId: "request", checkpointVersion: 5, recoverable: true,
            limits: {maxModelCalls: 4}, usage: {inputTokens: 60, outputTokens: 30, totalTokens: 90},
            operations: [{operationId: "op-1", status: "applied"}]});
        const payload = {projectId: "10", threadId: "thread", turnId: "turn", sessionId: "session",
            previousRunId: "run-1", expectedCheckpointVersion: 4, budgetExtension: {maxModelCalls: 4}};
        const result = await resumeAiDrivenTask(payload);
        expect(mocks.postOrThrow).toHaveBeenCalledWith("/api/aiDriven/task/resume", payload, undefined);
        expect(result).toMatchObject({status: "budgetExhausted", recoverable: true, checkpointVersion: 5,
            runtime: {usage: {totalTokens: 90}, operations: [{operationId: "op-1", status: "applied"}]}});
    });

    test("history carries latest run and server authorization rather than guessing recovery availability", async () => {
        mocks.post.mockResolvedValue({threadId: "thread", turnId: "turn", runId: "run-1", status: "budget_exhausted",
            inputText: "创建页面", limits: {maxModelCalls: 3}, recoverable: false, checkpointVersion: 7, usage: {modelCalls: 3}});
        expect(await readAiDrivenTurn({projectId: "10", threadId: "thread", turnId: "turn"})).toMatchObject({
            status: "budgetExhausted", latestRun: {runId: "run-1"}, checkpointVersion: 7, recoverable: false, usage: {modelCalls: 3},
        });
    });

    test("budget exhaustion events are normalized to a terminal recovery state", async () => {
        mocks.post.mockResolvedValue([{eventId: "event", threadId: "thread", turnId: "turn", runId: "run",
            type: "run.budget_exhausted", sequence: 4, payload: {message: "预算已用尽"}}]);
        expect(await getAiDrivenTaskEvents({projectId: "10", threadId: "thread", turnId: "turn", runId: "run", afterSequence: 3})).toMatchObject({
            events: [{kind: "turn.budgetExhausted", payload: {message: "预算已用尽"}}], nextCursor: 4,
        });
    });

    test("task event projection omits temporary render and clear operations but keeps the accepted preview", async () => {
        mocks.post.mockResolvedValue([
            {eventId: "region-prepared", threadId: "thread", turnId: "turn", runId: "run", sequence: 1,
                type: "frontend.effect.requested", payload: {operationId: "region", operationType: "render_draft",
                    request: {action: "render", interactive: false, regionId: "hero", draftId: "draft-1"}}},
            {eventId: "clear-prepared", threadId: "thread", turnId: "turn", runId: "run", sequence: 2,
                type: "frontend.effect.requested", payload: {operationId: "clear", operationType: "render_draft",
                    request: {action: "clear"}}},
            {eventId: "discard-prepared", threadId: "thread", turnId: "turn", runId: "run", sequence: 3,
                type: "frontend.effect.requested", payload: {operationId: "discard", operationType: "discard_canvas_draft",
                    request: {}}},
            {eventId: "preview-prepared", threadId: "thread", turnId: "turn", runId: "run", sequence: 4,
                type: "frontend.effect.requested", payload: {operationId: "preview", operationType: "render_draft",
                    request: {action: "preview", draftId: "draft-1", expectedDraftRevision: 2}}},
        ]);

        const result = await getAiDrivenTaskEvents({projectId: "10", threadId: "thread", turnId: "turn", runId: "run", afterSequence: 0});
        expect(result?.events.map((event) => event.kind)).toEqual([
            "agent.canvas_operation.prepared", "agent.canvas_operation.prepared",
            "agent.canvas_operation.prepared", "agent.canvas_operation.prepared",
        ]);
        expect(result?.events[0].payload).toMatchObject({operationId: "region", operationType: "render_draft",
            request: {action: "render", interactive: false, regionId: "hero", draftId: "draft-1"}});
        expect(result?.events[0].payload).not.toHaveProperty("operation");
        expect(result?.events[1].payload).not.toHaveProperty("operation");
        expect(result?.events[2].payload).not.toHaveProperty("operation");
        expect(result?.events[3].payload.operation).toMatchObject({operationId: "preview", kind: "createComponents", status: "prepared"});
    });

    test("completed task projection omits draft receipts, preserves accepted creation and exposes failures", async () => {
        mocks.post.mockResolvedValue([
            {eventId: "region-completed", threadId: "thread", turnId: "turn", runId: "run", sequence: 1,
                type: "frontend.effect.completed", payload: {operationId: "region", operationType: "render_draft", status: "applied",
                    result: {status: "draft-rendered", draftId: "draft-1", revision: 2, layerCount: 3}}},
            {eventId: "clear-completed", threadId: "thread", turnId: "turn", runId: "run", sequence: 2,
                type: "frontend.effect.completed", payload: {operationId: "clear", operationType: "render_draft", status: "applied",
                    result: {status: "draft-cleared", draftId: "draft-1", revision: 2, layerCount: 0}}},
            {eventId: "preview-completed", threadId: "thread", turnId: "turn", runId: "run", sequence: 3,
                type: "frontend.effect.completed", payload: {operationId: "preview", operationType: "render_draft", status: "applied",
                    result: {status: "draft-accepted", confirmed: true, componentBindings: {draftTitle: "real-title"}, resultRevision: "r2"}}},
            {eventId: "preview-rejected", threadId: "thread", turnId: "turn", runId: "run", sequence: 4,
                type: "frontend.effect.completed", payload: {operationId: "rejected", operationType: "render_draft", status: "rejected",
                    result: {status: "draft-rejected", confirmed: false}}},
            {eventId: "render-failed", threadId: "thread", turnId: "turn", runId: "run", sequence: 5,
                type: "frontend.effect.completed", payload: {operationId: "failed", operationType: "render_draft", status: "failed",
                    result: {code: "draft_render_failed", message: "区域渲染失败"}}},
        ]);

        const result = await getAiDrivenTaskEvents({projectId: "10", threadId: "thread", turnId: "turn", runId: "run", afterSequence: 0});
        expect(result?.events[0].payload).not.toHaveProperty("operation");
        expect(result?.events[1].payload).not.toHaveProperty("operation");
        expect(result?.events[2].payload.operation).toMatchObject({operationId: "preview", kind: "createComponents",
            componentIds: ["draftTitle"], status: "applied"});
        expect(result?.events[3].payload.operation).toMatchObject({operationId: "rejected", status: "rejected"});
        expect(result?.events[4].payload.operation).toMatchObject({operationId: "failed", status: "failed",
            error: {code: "draft_render_failed", message: "区域渲染失败"}});
    });

    test("thread history projection does not create operation rows for temporary renders or clears", async () => {
        mocks.post.mockResolvedValue([
            {eventId: "region-prepared", threadId: "thread", turnId: "turn", runId: "run", sequence: 1,
                type: "frontend.effect.requested", payload: {operationId: "region", operationType: "render_draft",
                    request: {interactive: false, regionId: "hero", agentScope: {projectId: "10"}}}},
            {eventId: "clear-prepared", threadId: "thread", turnId: "turn", runId: "run", sequence: 2,
                type: "frontend.effect.requested", payload: {operationId: "clear", operationType: "render_draft",
                    request: {action: "clear", agentScope: {projectId: "10"}}}},
            {eventId: "preview-prepared", threadId: "thread", turnId: "turn", runId: "run", sequence: 3,
                type: "frontend.effect.requested", payload: {operationId: "preview", operationType: "render_draft",
                    request: {action: "preview", draftId: "draft-1", expectedDraftRevision: 2, agentScope: {projectId: "10"}}}},
        ]);

        const result = await getAiDrivenThreadEvents({projectId: "10", threadId: "thread", afterThreadSequence: 0});
        expect(result?.data[0].payload).not.toHaveProperty("operation");
        expect(result?.data[1].payload).not.toHaveProperty("operation");
        expect(result?.data[2].payload.operation).toMatchObject({operationId: "preview", kind: "createComponents", status: "prepared"});
    });

    test("thread completion projection omits draft receipts and updates accepted or failed operation rows", async () => {
        mocks.post.mockResolvedValue([
            {eventId: "region-completed", threadId: "thread", turnId: "turn", runId: "run", sequence: 1,
                type: "frontend.effect.completed", payload: {operationId: "region", operationType: "render_draft", status: "applied",
                    result: {status: "draft-rendered", draftId: "draft-1", revision: 2, layerCount: 3}}},
            {eventId: "clear-completed", threadId: "thread", turnId: "turn", runId: "run", sequence: 2,
                type: "frontend.effect.completed", payload: {operationId: "clear", operationType: "render_draft", status: "applied",
                    result: {status: "draft-cleared", layerCount: 0}}},
            {eventId: "preview-completed", threadId: "thread", turnId: "turn", runId: "run", sequence: 3,
                type: "frontend.effect.completed", payload: {operationId: "preview", operationType: "render_draft", status: "applied",
                    result: {status: "draft-accepted", confirmed: true, componentBindings: {draftTitle: "real-title"}, resultRevision: "r2"}}},
            {eventId: "region-failed", threadId: "thread", turnId: "turn", runId: "run", sequence: 4,
                type: "frontend.effect.completed", payload: {operationId: "failed", operationType: "render_draft", status: "failed",
                    result: {code: "draft_render_failed", message: "区域渲染失败"}}},
        ]);

        const result = await getAiDrivenThreadEvents({projectId: "10", threadId: "thread", afterThreadSequence: 0});
        expect(result?.data[0].payload).not.toHaveProperty("operation");
        expect(result?.data[1].payload).not.toHaveProperty("operation");
        expect(result?.data[2].payload.operation).toMatchObject({operationId: "preview", kind: "createComponents",
            componentIds: ["draftTitle"], status: "applied"});
        expect(result?.data[3].payload.operation).toMatchObject({operationId: "failed", status: "failed",
            error: {code: "draft_render_failed", message: "区域渲染失败"}});
    });
});
