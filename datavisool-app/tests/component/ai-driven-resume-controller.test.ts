/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {resumeInterruptedTask, type AiDrivenResumeHost} from "@/designer/ai-driven/AiDrivenTaskResumeController.ts";
import type {IAiDrivenTurn} from "@/designer/ai-driven/thread/AiDrivenThreadTypes.ts";

const mocks = vi.hoisted(() => ({
    resume: vi.fn(), userId: "2", projectId: "10", appendLog: vi.fn(), finishRun: vi.fn(), snapshot: vi.fn(),
    warning: vi.fn(), error: vi.fn(),
}));
vi.mock("@/api/AiDrivenTaskApi.ts", () => ({resumeAiDrivenTask: mocks.resume}));
vi.mock("@/designer/ai-driven/AiDrivenWebEffectBridge.ts", () => ({handleAiDrivenWebEvent: vi.fn()}));
vi.mock("@/util/AuthTools.ts", () => ({default: {getUserId: () => mocks.userId}}));
vi.mock("@/designer/ai-driven/AiDrivenUtil.ts", () => ({
    getCurrentProjectId: () => mocks.projectId,
    getCurrentAiDrivenCanvasSnapshot: () => ({width: 1920, height: 1080, managerId: "current-manager"}),
}));
vi.mock("@datavisool/ui", () => ({globalMessage: {messageApi: {warning: mocks.warning, error: mocks.error}}}));
vi.mock("@/i18n/miniI18n.ts", () => ({tx: (value: string) => value}));
vi.mock("@/designer/ai-driven/AiDrivenProgressTerminalStore.ts", () => ({default: {
    appendLog: mocks.appendLog, finishRun: mocks.finishRun, setRuntimeSnapshot: mocks.snapshot,
}}));

const recoveredTurn = {turnId: "turn-1", projectId: "10", threadId: "thread-1", requestId: "request-1",
    status: "interrupted", recoverable: true, checkpointVersion: 4, latestRun: {runId: "run-1"}} as IAiDrivenTurn;
const result = {projectId: "10", threadId: "thread-1", turnId: "turn-1", requestId: "request-1",
    runId: "run-2", eventCursor: 5, status: "queued"};

function host(): AiDrivenResumeHost {
    const value: AiDrivenResumeHost = {
        running: false, mounted: true, currentRequestId: "", aiDrivenSessionId: "current-session",
        taskRunMonitor: {stop: vi.fn(), watch: vi.fn(), restore: vi.fn()},
        startRunningTask: vi.fn((requestId) => {value.currentRequestId = requestId; value.running = true;}),
        acceptRunningTask: vi.fn(), finishRunningTask: vi.fn(() => {value.running = false; value.currentRequestId = "";}),
    };
    return value;
}

describe("AI resume lifecycle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const storage = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
        });
        mocks.userId = "2";
        mocks.projectId = "10";
        mocks.resume.mockResolvedValue(result);
    });
    afterEach(() => vi.unstubAllGlobals());

    test("binds recovery to the latest run, checkpoint and current canvas, then monitors the new run", async () => {
        const value = host();
        await resumeInterruptedTask(value, "10", recoveredTurn);
        expect(mocks.resume).toHaveBeenCalledWith(expect.objectContaining({
            previousRunId: "run-1", expectedCheckpointVersion: 4, sessionId: "current-session",
            canvasSnapshot: {width: 1920, height: 1080, managerId: "current-manager"},
        }));
        expect(value.acceptRunningTask).toHaveBeenCalledWith("request-1", "thread-1", "turn-1", "run-2");
        expect(value.taskRunMonitor.watch).toHaveBeenCalledWith(expect.objectContaining({runId: "run-2", eventCursor: 5}));
    });

    test("prevents concurrent recovery and budget continuation without explicit extension", async () => {
        const value = host();
        value.running = true;
        await resumeInterruptedTask(value, "10", recoveredTurn);
        value.running = false;
        await resumeInterruptedTask(value, "10", {...recoveredTurn, status: "budgetExhausted"});
        expect(mocks.resume).not.toHaveBeenCalled();
        expect(mocks.warning).toHaveBeenCalledTimes(2);
    });

    test.each(["user", "project"])("ignores a late response after changing %s", async (scope) => {
        let resolve!: (value: typeof result) => void;
        mocks.resume.mockReturnValueOnce(new Promise((done) => {resolve = done;}));
        const value = host();
        const pending = resumeInterruptedTask(value, "10", recoveredTurn);
        if (scope === "user") mocks.userId = "3";
        else mocks.projectId = "20";
        resolve(result);
        await pending;
        expect(value.acceptRunningTask).not.toHaveBeenCalled();
        expect(value.taskRunMonitor.watch).not.toHaveBeenCalled();
    });

    test("shows budget exhaustion as resumable rather than generic failure", async () => {
        mocks.resume.mockResolvedValueOnce({...result, status: "budgetExhausted"});
        const value = host();
        await resumeInterruptedTask(value, "10", recoveredTurn);
        expect(mocks.finishRun).toHaveBeenCalledWith("budgetExhausted", expect.any(String));
        expect(value.finishRunningTask).toHaveBeenCalledWith("request-1");
        expect(mocks.error).not.toHaveBeenCalled();
    });

    test("reconciles an uncertain network failure instead of discarding an accepted recovery", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        mocks.resume.mockRejectedValueOnce(new TypeError("network unavailable"));
        const value = host();
        await resumeInterruptedTask(value, "10", recoveredTurn);
        expect(value.taskRunMonitor.restore).toHaveBeenCalledWith("10");
        expect(localStorage.getItem("AI_DRIVEN_PENDING_TASK_V1:10")).toContain("request-1");
        vi.restoreAllMocks();
    });
});
