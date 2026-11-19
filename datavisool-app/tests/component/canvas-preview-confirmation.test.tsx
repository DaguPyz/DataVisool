/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from "vitest";
import {AiDrivenProgressTerminalStore} from "@/plugins/editor-ai/AiDrivenProgressTerminalStore.ts";
import {runShowPreviewTool} from "@/plugins/editor-ai/frontend-effect/tools/PreviewInteractionTools.ts";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";

const mocks = vi.hoisted(() => ({
    confirm: vi.fn(() => "preview-modal"),
    destroy: vi.fn(),
}));
vi.mock("@datavisool/ui", () => ({globalModal: {modalApi: {confirm: mocks.confirm, destroy: mocks.destroy}}}));

function makeSession() {
    let complete: ((confirmed: boolean) => void) | undefined;
    let active = true;
    const session = {
        isActive: vi.fn(() => active),
        readDraft: vi.fn(() => active ? {draftId: "draft-1", revision: 4, layerCount: 2, interactive: false, batches: []} : undefined),
        bindDraftPreviewConfirmation: vi.fn((_draftId: string, callback: (confirmed: boolean) => void) => {
            complete = callback;
            return vi.fn(() => {complete = undefined;});
        }),
        confirm(confirmed: boolean) { complete?.(confirmed); },
        expire() { active = false; },
    };
    return {session: session as unknown as EditorAiEditingSession, controls: session};
}

describe("canvas preview confirmation", () => {
    const stores: AiDrivenProgressTerminalStore[] = [];
    const makeTerminal = () => {
        const terminal = new AiDrivenProgressTerminalStore();
        stores.push(terminal);
        return terminal;
    };

    afterEach(() => {
        stores.splice(0).forEach(terminal => terminal.reset());
        vi.clearAllMocks();
    });

    test("routes canvas confirmation through the task-owned terminal and releases its binding", async () => {
        const terminal = makeTerminal();
        terminal.setInlineHostAvailable(true);
        const {session, controls} = makeSession();
        const preview = runShowPreviewTool({draftId: "draft-1", message: "请确认预览"}, session, terminal);
        await vi.waitFor(() => expect(terminal.pendingInlineInteraction?.kind).toBe("preview"));

        controls.confirm(true);

        await expect(preview).resolves.toEqual({confirmed: true, draftId: "draft-1"});
        expect(terminal.pendingInlineInteraction).toBeNull();
        expect(controls.bindDraftPreviewConfirmation).toHaveBeenCalledWith("draft-1", expect.any(Function));
    });

    test("aborting the task releases inline confirmation without accepting the draft", async () => {
        const terminal = makeTerminal();
        terminal.setInlineHostAvailable(true);
        const {session, controls} = makeSession();
        const abort = new AbortController();
        const preview = runShowPreviewTool({draftId: "draft-1"}, session, terminal, abort.signal);
        const rejected = expect(preview).rejects.toMatchObject({code: "effect_cancelled"});
        await vi.waitFor(() => expect(terminal.pendingInlineInteraction?.kind).toBe("preview"));

        abort.abort();

        await rejected;
        expect(terminal.pendingInlineInteraction).toBeNull();
        expect(controls.bindDraftPreviewConfirmation.mock.results[0].value).toHaveBeenCalledOnce();
    });

    test("falls back to a modal when the task panel is unavailable", async () => {
        const terminal = makeTerminal();
        terminal.setInlineHostAvailable(false);
        const {session, controls} = makeSession();
        const preview = runShowPreviewTool({draftId: "draft-1"}, session, terminal);
        expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({title: "页面预览确认"}));

        controls.confirm(true);

        await expect(preview).resolves.toEqual({confirmed: true, draftId: "draft-1"});
        expect(mocks.destroy).toHaveBeenCalledWith("preview-modal");
        expect(terminal.pendingInlineInteraction).toBeNull();
    });
});
