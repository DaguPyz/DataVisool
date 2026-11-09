/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";

vi.mock("@/i18n/miniI18n.ts", () => ({tx: (value: string) => value}));
vi.mock("@/i18n/useLocaleVersion.ts", () => ({useLocaleVersion: () => 0}));

import AiDrivenStreamingMessage from "@/designer/ai-driven/AiDrivenStreamingMessage.tsx";
import AiDrivenProgressTerminal from "@/designer/ai-driven/AiDrivenProgressTerminal.tsx";
import aiDrivenProgressTerminalStore from "@/designer/ai-driven/AiDrivenProgressTerminalStore.ts";

describe("AI driven streaming message", () => {
    let nextFrameId = 0;
    let pendingFrames = new Map<number, FrameRequestCallback>();
    let requestFrameSpy: ReturnType<typeof vi.spyOn>;
    let cancelFrameSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        nextFrameId = 0;
        pendingFrames = new Map();
        requestFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            const frameId = ++nextFrameId;
            pendingFrames.set(frameId, callback);
            return frameId;
        });
        cancelFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) => {
            pendingFrames.delete(frameId);
        });
    });

    afterEach(() => {
        cleanup();
        aiDrivenProgressTerminalStore.reset();
        requestFrameSpy.mockRestore();
        cancelFrameSpy.mockRestore();
    });

    test("drains queued text after the completion event", () => {
        const revealStates: boolean[] = [];
        const props = {
            fallback: "正在生成回复…",
            onContentChange: vi.fn(),
            onRevealStateChange: (revealing: boolean) => revealStates.push(revealing),
        };
        const {rerender} = render(
            <AiDrivenStreamingMessage {...props} content="开" active={false}/>,
        );

        rerender(<AiDrivenStreamingMessage {...props} content="开始输出完整文本" active/>);
        rerender(<AiDrivenStreamingMessage {...props} content="开始输出完整文本" active={false}/>);

        expect(screen.queryByText("开始输出完整文本")).toBeNull();
        expect(revealStates.at(-1)).toBe(true);

        runFrames(30);

        expect(screen.getByText("开始输出完整文本")).toBeInTheDocument();
        expect(revealStates.at(-1)).toBe(false);
    });

    test("animates a completed message that arrived in one polling batch", () => {
        const revealStates: boolean[] = [];
        render(
            <AiDrivenStreamingMessage content="轮询批量返回的完整文本"
                                      fallback="正在生成回复…"
                                      active={false}
                                      animateInitial
                                      onContentChange={vi.fn()}
                                      onRevealStateChange={(revealing) => revealStates.push(revealing)}/>,
        );

        expect(screen.queryByText("轮询批量返回的完整文本")).toBeNull();
        expect(revealStates.at(-1)).toBe(true);

        runFrames(40);

        expect(screen.getByText("轮询批量返回的完整文本")).toBeInTheDocument();
        expect(revealStates.at(-1)).toBe(false);
    });

    test("shows a historical completed message immediately", () => {
        render(
            <AiDrivenStreamingMessage content="历史消息"
                                      fallback="正在生成回复…"
                                      active={false}
                                      onContentChange={vi.fn()}/>,
        );

        expect(screen.getByText("历史消息")).toBeInTheDocument();
        expect(pendingFrames.size).toBe(0);
    });

    test("keeps the message in progress until a polled completion batch is fully revealed", () => {
        const baseEvent = {
            eventId: "event-1",
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "message-1",
            runId: "run-1",
            requestId: "request-1",
            projectId: "project-1",
            sequence: 1,
            threadSequence: 1,
            dedupeKey: "event-1",
            schemaVersion: 3 as const,
            createdAt: 1,
        };
        const message = "同一轮询批次中的完整回复";
        aiDrivenProgressTerminalStore.applyTaskEvent({
            ...baseEvent,
            kind: "item.delta",
            payload: {itemId: "message-1", itemType: "agentMessage", delta: message},
        });
        aiDrivenProgressTerminalStore.applyTaskEvent({
            ...baseEvent,
            eventId: "event-2",
            sequence: 2,
            threadSequence: 2,
            dedupeKey: "event-2",
            kind: "item.completed",
            payload: {
                item: {
                    itemId: "message-1",
                    itemType: "agentMessage",
                    status: "completed",
                    payload: {text: message},
                },
            },
        });
        aiDrivenProgressTerminalStore.setVisible(true);

        render(<AiDrivenProgressTerminal/>);

        expect(screen.getByText("正在回复")).toBeInTheDocument();
        expect(screen.queryByText(message)).toBeNull();

        runFrames(50);

        expect(screen.getByText(message)).toBeInTheDocument();
        expect(screen.queryByText("正在回复")).toBeNull();
    });

    const runFrames = (count: number) => {
        for (let index = 1; index <= count; index += 1) {
            act(() => {
                const callbacks = [...pendingFrames.values()];
                pendingFrames.clear();
                callbacks.forEach((callback) => callback(index * 16));
            });
        }
    };
});
