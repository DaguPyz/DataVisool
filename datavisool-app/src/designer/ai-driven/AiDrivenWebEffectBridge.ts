/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
/*
 * Web 端 Agent 前端效果桥接。
 *
 * 桌面端通过 Tauri 事件调用相同的工具；Web 端直接消费任务事件，
 * 执行画布工具后回传 Java Agent 的 operation journal。
 */

import {assertComponentDocumentVersions} from '@/frontend-effect/component-docs/ComponentDocumentVersions.ts';
import {
    completeAiDrivenFrontendOperation,
    steerAiDrivenTask,
} from "@/api/AiDrivenTaskApi.ts";
import {runApplyComponentPatchTool} from "@/frontend-effect/tools/ApplyComponentPatchTool.ts";
import {runGetComponentCatalogTool} from "@/frontend-effect/tools/GetComponentCatalogTool.ts";
import {runGetComponentDataContractTool} from "@/frontend-effect/tools/GetComponentDataContractTool.ts";
import {runGetComponentSnapshotsTool} from "@/frontend-effect/tools/GetComponentSnapshotsTool.ts";
import {runGetCurrentCanvasSelectionTool} from "@/frontend-effect/tools/GetCurrentCanvasSelectionTool.ts";
import {
    runGetComponentDocumentTool,
    runResolveComponentSpecsTool,
    runSearchAvailableComponentsTool,
    runSearchComponentDocumentsTool,
} from "@/frontend-effect/tools/ComponentDocumentationTools.ts";
import {
    runGetCurrentCanvasRevisionTool,
    runGetProjectSnapshotTool,
} from "@/frontend-effect/tools/CanvasContextTools.ts";
import {runConfirmCanvasPatchTool} from "@/frontend-effect/tools/ConfirmCanvasPatchTool.ts";
import {
    runDeleteCanvasComponentsTool,
} from "@/frontend-effect/tools/DeleteCanvasComponentsTool.ts";
import {
    runRequestComponentSelectionTool,
    runShowPreviewTool,
} from "@/frontend-effect/tools/PreviewInteractionTools.ts";
import {
    acceptRenderedDraftAfterUserConfirmation,
    runRenderDraftTool,
} from "@/frontend-effect/tools/RenderDraftTool.ts";
import {runUserInputTool} from "@/frontend-effect/tools/UserInputTool.ts";
import {aiDrivenDevWarn} from "./AiDrivenDevLogger.ts";
import type {IAiDrivenTaskEvent} from "./types/AiDrivenTaskSubmitTypes.ts";
import {FrontendEffectClientError, serializeFrontendEffectError} from "@/frontend-effect/FrontendEffectClientError.ts";
import {aiLayerDraftRuntime} from "@/designer/ai-driven/AiLayerDraftRuntime.ts";
import {hasCanvasOperationIdentity, runIdempotentCanvasOperation} from "@/frontend-effect/CanvasOperationJournal.ts";

type EffectTool = (payload: unknown, signal?: AbortSignal) => Promise<unknown> | unknown;

const activeEffectIds = new Set<string>();
const effectQueues = new Map<string, {
    exclusive: Promise<void>;
    reads: Set<Promise<void>>;
    pending: number;
}>();
const endedRuns = new Set<string>();
const runKey = (event: IAiDrivenTaskEvent) => JSON.stringify([event.projectId, event.threadId, event.turnId, event.runId]);
const turnKey = (event: IAiDrivenTaskEvent) => JSON.stringify([event.projectId, event.threadId, event.turnId]);
const activeEffectControllers = new Map<string, {
    controller: AbortController;
    threadId: string;
    turnId: string;
    runId: string;
}>();

const READ_EFFECT_TOOLS: Record<string, EffectTool> = {
    inspect_current_page: runGetComponentSnapshotsTool,
    get_component_catalog: runGetComponentCatalogTool,
    get_component_snapshots: runGetComponentSnapshotsTool,
    get_component_data_contract: runGetComponentDataContractTool,
    get_current_canvas_selection: runGetCurrentCanvasSelectionTool,
    get_project_snapshot: runGetProjectSnapshotTool,
    get_current_canvas_revision: runGetCurrentCanvasRevisionTool,
    get_component_document: runGetComponentDocumentTool,
    resolve_component_specs: runResolveComponentSpecsTool,
    search_component_documents: runSearchComponentDocumentsTool,
    search_available_components: runSearchAvailableComponentsTool,
};

const EFFECT_TOOLS: Record<string, EffectTool> = {
    ...READ_EFFECT_TOOLS,
    create_canvas_components: runRenderDraftTool,
    patch_canvas_components: runApplyComponentPatchTool,
    delete_canvas_components: runDeleteCanvasComponentsTool,
    render_draft: runRenderDraftTool,
    discard_canvas_draft: (payload) => runRenderDraftTool({
        ...(asRecord(payload) ?? {}),
        action: "clear",
    }),
    confirm_canvas_patch: runConfirmCanvasPatchTool,
    request_component_selection: runRequestComponentSelectionTool,
};

export const handleAiDrivenWebEvent = async (event: IAiDrivenTaskEvent): Promise<void> => {
    if (event.kind === "turn.cancelled" || event.kind === "turn.failed"
        || event.kind === "turn.completed" || event.kind === "turn.interrupted" || event.kind === "turn.budgetExhausted") {
        endedRuns.add(runKey(event));
        abortTurnEffects(event);
        aiLayerDraftRuntime.clearOwnedDraft(turnKey(event));
        return;
    }
    const action = event.kind === "agent.canvas_operation.prepared" || event.kind === "agent.frontend_tool.prepared"
        ? () => handleCanvasOperation(event)
        : event.kind === "turn.waiting" && event.payload.status === "waitingUserInput" ? () => handleUserInput(event) : null;
    if (!action || endedRuns.has(runKey(event)))
        return;
    // 读取只等待前面的独占动作；写入/交互等待之前全部读取及独占动作（含回执确认）。
    const key = turnKey(event);
    const queue = effectQueues.get(key) ?? {exclusive: Promise.resolve(), reads: new Set<Promise<void>>(), pending: 0};
    effectQueues.set(key, queue);
    const parallel = (event.kind === "agent.canvas_operation.prepared" || event.kind === "agent.frontend_tool.prepared")
        && Object.prototype.hasOwnProperty.call(READ_EFFECT_TOOLS, text(event.payload.operationType));
    const predecessors = parallel ? [queue.exclusive] : [queue.exclusive, ...queue.reads];
    const queued = Promise.all(predecessors.map(predecessor => predecessor.catch(() => {}))).then(async () => {
        if (!endedRuns.has(runKey(event))) await action();
    });
    if (parallel) queue.reads.add(queued);
    else queue.exclusive = queued;
    queue.pending++;
    try { await queued; }
    finally {
        queue.reads.delete(queued);
        if (--queue.pending === 0 && effectQueues.get(key) === queue) effectQueues.delete(key);
    }
};

const handleCanvasOperation = async (event: IAiDrivenTaskEvent) => {
    const operationId = text(event.payload.operationId);
    if (!operationId || activeEffectIds.has(operationId))
        return;
    const operationType = text(event.payload.operationType);
    const tool = EFFECT_TOOLS[operationType];
    if (!tool) {
        await completeAiDrivenFrontendOperation({
            operationId,
            status: "failed",
            projectId: event.projectId,
            threadId: event.threadId,
            turnId: event.turnId,
            runId: event.runId,
            result: {
                code: "tool_not_supported",
                message: "Web 端未注册前端工具：" + operationType,
                fieldPath: "operationType",
                actualValue: operationType,
                actualType: "string",
                expectedValue: Object.keys(EFFECT_TOOLS).sort(),
                allowedTools: Object.keys(EFFECT_TOOLS).sort(),
            },
        }, {suppressErrorMessage: true});
        return;
    }

    activeEffectIds.add(operationId);
    const controller = new AbortController();
    activeEffectControllers.set(operationId, {
        controller,
        threadId: event.threadId,
        turnId: event.turnId,
        runId: event.runId,
    });
    try {
        const request = asRecord(event.payload.request) ?? event.payload;
        const agentScope = validateAgentScope(request);
        const result = await executeCanvasOperation(event, operationType, tool, request, controller.signal);
        if (controller.signal.aborted) return;
        validateCurrentAgentScope(agentScope);
        const record = asRecord(result);
        const completion = classifyEffectCompletion(operationType, record);
        const resultRevision = typeof record?.resultRevision === "number" || typeof record?.resultRevision === "string"
            ? record.resultRevision
            : typeof record?.revision === "string" ? record.revision
            : undefined;
        await completeAiDrivenFrontendOperation({
            operationId,
            status: completion.status,
            projectId: event.projectId,
            threadId: event.threadId,
            turnId: event.turnId,
            runId: event.runId,
            resultRevision,
            result: completion.partial && record ? {...record, partial: true} : record ?? {value: result},
        }, {suppressErrorMessage: true});
    } catch (error) {
        if (controller.signal.aborted)
            return;
        if (error instanceof FrontendEffectClientError
            && (error.code === "agent_scope_manager_changed" || error.code === "agent_scope_project_changed"))
            aiLayerDraftRuntime.clearOwnedDraft(turnKey(event));
        const serializedError = serializeFrontendEffectError(error);
        await completeAiDrivenFrontendOperation({
            operationId,
            status: "failed",
            projectId: event.projectId,
            threadId: event.threadId,
            turnId: event.turnId,
            runId: event.runId,
            result: serializedError,
        }, {suppressErrorMessage: true});
    } finally {
        activeEffectControllers.delete(operationId);
        activeEffectIds.delete(operationId);
    }
};

const handleUserInput = async (event: IAiDrivenTaskEvent) => {
    if (activeEffectIds.has(event.eventId))
        return;
    activeEffectIds.add(event.eventId);
    const controller = new AbortController();
    activeEffectControllers.set(event.eventId, {controller, threadId: event.threadId, turnId: event.turnId, runId: event.runId});
    try {
        const result = await runUserInputTool("用户补充输入", event.payload, controller.signal);
        if (controller.signal.aborted) return;
        await steerAiDrivenTask({
            threadId: event.threadId,
            expectedTurnId: event.turnId,
            runId: event.runId,
            projectId: event.projectId,
            inputId: "web-user-input-" + event.eventId,
            input: JSON.stringify(result),
        }, {suppressErrorMessage: true});
    } catch (error) {
        const serializedError = serializeFrontendEffectError(error);
        const code = text(serializedError.code);
        if (controller.signal.aborted || code === "effect_cancelled")
            return;
        const inputId = `web-user-input-${event.eventId}`;
        const status = code === "user_cancelled" ? "cancelled" : "failed";
        const questions = Array.isArray(event.payload.questions) ? event.payload.questions : [];
        const questionIds = questions.flatMap((item) => {
            const question = asRecord(item);
            return text(question?.id) ? [text(question?.id)] : [];
        });
        const expectedValue = {
            status: "submitted",
            answers: Object.fromEntries(questionIds.map((id) => [id, {answers: ["非空字符串"]}])),
        };
        const hasActualValue = Object.prototype.hasOwnProperty.call(serializedError, "actualValue");
        const hasExpectedValue = Object.prototype.hasOwnProperty.call(serializedError, "expectedValue")
            || Object.prototype.hasOwnProperty.call(serializedError, "expected");
        const input = {
            interaction: "userInput",
            status,
            ...serializedError,
            inputId,
            eventId: event.eventId,
            questionIds,
            interactionState: {status, answers: "absent"},
            ...(hasActualValue ? {} : {actualValue: {status, answers: "absent"}, actualType: "object"}),
            ...(hasExpectedValue ? {} : {expectedValue}),
            recovery: "不要自动重复提问；等待用户追加要求，或继续可独立执行的工作。",
        };
        try {
            await steerAiDrivenTask({
                threadId: event.threadId,
                expectedTurnId: event.turnId,
                runId: event.runId,
                projectId: event.projectId,
                inputId,
                input: JSON.stringify(input),
            }, {suppressErrorMessage: true});
        } catch (steerError) {
            aiDrivenDevWarn("user input bridge failed:", steerError);
        }
    } finally {
        activeEffectControllers.delete(event.eventId);
        activeEffectIds.delete(event.eventId);
    }
};

const executeCanvasOperation = async (
    event: IAiDrivenTaskEvent,
    operationType: string,
    tool: EffectTool,
    request: Record<string, unknown>,
    signal: AbortSignal,
) => {
    const identityPayload = {
        ...request,
        operationId: request.operationId ?? event.payload.operationId,
        operationFingerprint: request.operationFingerprint ?? event.payload.operationFingerprint,
    };
    const hasCompleteIdentity = typeof identityPayload.operationId === "string"
        && !!identityPayload.operationId.trim()
        && typeof identityPayload.operationFingerprint === "string"
        && !!identityPayload.operationFingerprint.trim();
    if (["render_draft", "create_canvas_components", "discard_canvas_draft"].includes(operationType)
        && !(operationType === "render_draft" && text(request.action) === "accept")
        && hasCompleteIdentity && hasCanvasOperationIdentity(identityPayload)) {
        return runIdempotentCanvasOperation(identityPayload, () => executeCanvasOperationBody(
            event, operationType, tool, request, signal,
        ));
    }
    return executeCanvasOperationBody(event, operationType, tool, request, signal);
};

const executeCanvasOperationBody = async (
    event: IAiDrivenTaskEvent,
    operationType: string,
    tool: EffectTool,
    request: Record<string, unknown>,
    signal: AbortSignal,
) => {
    assertComponentDocumentVersions(request);
    const ownerKey = turnKey(event);
    if (operationType === "discard_canvas_draft"
        || (operationType === "render_draft" && text(request.action) === "clear"))
        return runRenderDraftTool({...request, action: "clear", ownerKey});
    if (operationType === "render_draft" && text(request.action) === "preview") {
        const ready = asRecord(await runRenderDraftTool({...request, ownerKey}));
        if (ready?.status !== "draft-preview-ready")
            return ready;
        const draftId = text(ready.draftId);
        const revision = typeof ready.revision === "number" ? ready.revision : Number.NaN;
        if (!draftId || revision !== request.expectedDraftRevision)
            throw new FrontendEffectClientError("draft_revision_conflict", "分区草稿版本与请求不一致，请重新预览", {
                fieldPath: "expectedDraftRevision", actualValue: revision, expectedValue: request.expectedDraftRevision,
                draftId: draftId || (ready?.draftId ?? null),
            });
        try {
            const preview = await runShowPreviewTool({
                draftId,
                message: text(request.message) || "请检查完整页面预览。确认后将统一写入正式画布。",
            }, signal);
            if (!preview.confirmed) {
                aiLayerDraftRuntime.clearOwnedDraft(ownerKey);
                return {status: "draft-rejected", confirmed: false, draftId, layerCount: 0};
            }
            if (signal.aborted)
                throw new FrontendEffectClientError("effect_cancelled", "任务已停止等待页面预览确认");
            if (!aiLayerDraftRuntime.isOwnedDraftCurrent(draftId, revision, ownerKey))
                throw new FrontendEffectClientError("draft_revision_conflict", "确认前分区草稿已变化，请重新预览", {
                    fieldPath: "draft.revision", actualValue: aiLayerDraftRuntime.activeDraft?.revision ?? null,
                    expectedValue: revision, draftId,
                });
            return {
                ...acceptRenderedDraftAfterUserConfirmation(draftId, revision),
                confirmed: true,
            };
        } catch (error) {
            if (aiLayerDraftRuntime.isOwnedDraftCurrent(draftId, revision, ownerKey))
                aiLayerDraftRuntime.clearOwnedDraft(ownerKey);
            throw error;
        }
    }
    const action = text(request.action);
    const isPartitionRender = operationType === "render_draft"
        && (!action || action === "render")
        && (request.layout != null || request.regionId != null || request.draftId != null);
    if (isPartitionRender)
        return tool({...request, action: "render", ownerKey}, signal);
    if (!isCreateOperation(operationType) || (text(request.action) && text(request.action) !== "render"))
        return tool(request, signal);

    const rendered = asRecord(await runRenderDraftTool({
        ...request,
        action: "render",
        ownerKey,
    }));
    const draftId = text(rendered?.draftId);
    if (rendered?.status !== "draft-rendered" || !draftId)
        return rendered;
    if (request.interactive === false)
        return rendered;

    try {
        const preview = await runShowPreviewTool({
            draftId,
            message: text(request.message) || "请检查画布上的临时页面预览。确认后将写入正式画布。",
        }, signal);
        if (!preview.confirmed) {
            await runRenderDraftTool({action: "clear", ownerKey});
            return {
                status: "draft-rejected",
                confirmed: false,
                draftId,
                layerCount: 0,
            };
        }
        return {
            ...acceptRenderedDraftAfterUserConfirmation(draftId),
            confirmed: true,
        };
    } catch (error) {
        await runRenderDraftTool({action: "clear", ownerKey});
        throw error;
    }
};

const isCreateOperation = (operationType: string) =>
    operationType === "create_canvas_components" || operationType === "render_draft";

const abortTurnEffects = (event: IAiDrivenTaskEvent) => {
    for (const effect of activeEffectControllers.values()) {
        if (effect.threadId === event.threadId && effect.turnId === event.turnId && effect.runId === event.runId)
            effect.controller.abort();
    }
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function classifyEffectCompletion(operationType: string, record: Record<string, unknown> | null): {
    status: "applied" | "rejected" | "failed";
    partial: boolean;
} {
    if (record?.confirmed === false)
        return {status: "rejected", partial: false};
    const writes = new Set(["create_canvas_components", "patch_canvas_components", "delete_canvas_components", "render_draft", "discard_canvas_draft"]);
    if (!writes.has(operationType) || !record || !Array.isArray(record.failed) || record.failed.length === 0)
        return {status: "applied", partial: false};
    const applied = record.applied;
    const deleted = record.deletedComponentIds;
    const partiallyApplied = record.partiallyApplied;
    const hasApplied = (Array.isArray(applied) && applied.length > 0)
        || (Array.isArray(deleted) && deleted.length > 0)
        || (Array.isArray(partiallyApplied) && partiallyApplied.length > 0);
    return {status: "failed", partial: hasApplied || record.partial === true};
}

interface AgentScope {
    projectId: string;
    managerId?: string;
}

function validateAgentScope(payload: unknown): AgentScope | undefined {
    const record = asRecord(payload);
    const rawScope = asRecord(record?.agentScope);
    if (!rawScope)
        return undefined;
    const projectId = text(rawScope.projectId);
    const managerId = text(rawScope.managerId);
    if (!projectId)
        throw new FrontendEffectClientError("agent_scope_invalid", "Agent 前端请求缺少 projectId", {
            fieldPath: "agentScope.projectId", actualValue: rawScope.projectId, expectedValue: "non-empty string",
        });
    const scope = {projectId, managerId: managerId || undefined};
    validateCurrentAgentScope(scope);
    return scope;
}

function validateCurrentAgentScope(scope: AgentScope | undefined): void {
    if (!scope)
        return;
    const currentProjectId = text(window.DATAVISOOL_ENV?.projectId);
    if (scope.projectId !== currentProjectId) {
        throw new FrontendEffectClientError(
            "agent_scope_project_changed",
            `AI 任务所属项目已切换：期望 ${scope.projectId}，当前 ${currentProjectId || "unknown"}`,
            {fieldPath: "projectId", actualValue: currentProjectId || null, expectedValue: scope.projectId},
        );
    }
    if (!scope.managerId)
        return;
    const currentManagerId = text(window.DATAVISOOL_ENV?.currentManager?.id);
    if (scope.managerId !== currentManagerId) {
        throw new FrontendEffectClientError(
            "agent_scope_manager_changed",
            `AI 任务所属画布已切换：期望 ${scope.managerId}，当前 ${currentManagerId || "unknown"}`,
            {fieldPath: "managerId", actualValue: currentManagerId || null, expectedValue: scope.managerId},
        );
    }
}
