/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, test, vi} from "vitest";
import type {IAiDrivenTurn} from "@/designer/ai-driven/thread/AiDrivenThreadTypes.ts";
import AiDrivenTurnView from "@/designer/ai-driven/thread/AiDrivenTurnView.tsx";

vi.mock("@/i18n/miniI18n.ts", () => ({tx: (value: string) => value}));
vi.mock("@/designer/ai-driven/thread/AiDrivenItemView.tsx", () => ({default: () => null}));

const turn = (status: IAiDrivenTurn["status"], overrides: Partial<IAiDrivenTurn> = {}): IAiDrivenTurn => ({
    turnId: "turn-1", projectId: "10", threadId: "thread-1", requestId: "request-1", turnSequence: 1,
    status, request: {}, inputSummary: "创建看板", modelConfigId: "model-1", runtimeModelId: "gpt-4o",
    provider: "openai", entryDigest: "", usage: {totalTokens: 100, modelCalls: 3, elapsedMs: 120_000},
    limits: {tokenBudgetEnabled: true, callBudgetEnabled: true, durationBudgetEnabled: true,
        maxTotalTokens: 100, maxModelCalls: 3, maxToolCalls: 10, maxWriteCalls: 5, maxFrontendInteractions: 5, maxDurationMs: 120_000},
    recoverable: true, checkpointVersion: 4, latestRun: {runId: "run-1"},
    lastArtifactId: null, lastArtifactRevision: null, errorCode: null, errorMessage: null,
    rowVersion: 1, createdAt: 1, startedAt: 1, updatedAt: 2, endedAt: 2, ...overrides,
});

function show(value: IAiDrivenTurn, onResume = vi.fn()) {
    render(<AiDrivenTurnView turn={value} items={[]} expanded loadingItems={false} itemsLoaded hasMoreItems={false}
                             onToggle={() => {}} onLoadMoreItems={() => {}} onResume={onResume}/>);
    return onResume;
}

describe("AI task recovery history", () => {
    test("interrupted tasks have an explicit continuation button", () => {
        const resume = show(turn("interrupted"));
        fireEvent.click(screen.getByRole("button", {name: "继续此任务"}));
        expect(resume).toHaveBeenCalledWith();
    });

    test.each(["interrupted", "budgetExhausted", "completed", "failed", "cancelled"] as const)(
        "does not resume an unavailable %s task", (status) => {
            show(turn(status, {recoverable: false}));
            expect(screen.queryByRole("button", {name: "继续此任务"})).toBeNull();
            expect(screen.queryByRole("button", {name: "增加预算后继续"})).toBeNull();
        });

    test("requires an explicit higher cumulative budget and converts minutes to milliseconds", () => {
        const resume = show(turn("budgetExhausted"));
        const continueButton = screen.getByRole("button", {name: "增加预算后继续"});
        fireEvent.click(continueButton);
        expect(screen.getByRole("alert")).toHaveTextContent("请至少增加一项预算后继续");
        fireEvent.change(screen.getByRole("spinbutton", {name: "模型调用上限"}), {target: {value: "3"}});
        fireEvent.click(continueButton);
        expect(screen.getByRole("alert")).toHaveTextContent("高于当前上限和已用量");
        expect(resume).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole("spinbutton", {name: "模型调用上限"}), {target: {value: "4"}});
        fireEvent.change(screen.getByRole("spinbutton", {name: "任务时长上限（分钟）"}), {target: {value: "3"}});
        fireEvent.click(continueButton);
        expect(resume).toHaveBeenCalledWith({maxModelCalls: 4, maxDurationMs: 180_000});
    });

    test("missing authorization data disables budget extension", () => {
        show(turn("budgetExhausted", {limits: undefined}));
        expect(screen.getByText("预算授权信息不可用，请刷新历史记录后重试")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "增加预算后继续"})).toBeNull();
    });
});
