/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {assertComponentDocumentVersions} from '@/plugins/editor-ai/frontend-effect/component-docs/ComponentDocumentVersions.ts';
import {completeAiDrivenFrontendOperation, steerAiDrivenTask} from '@/plugins/editor-ai/api/AiDrivenTaskApi.ts';
import {runApplyComponentPatchTool} from '@/plugins/editor-ai/frontend-effect/tools/ApplyComponentPatchTool.ts';
import {runGetComponentCatalogTool} from '@/plugins/editor-ai/frontend-effect/tools/GetComponentCatalogTool.ts';
import {runGetComponentDataContractTool} from '@/plugins/editor-ai/frontend-effect/tools/GetComponentDataContractTool.ts';
import {runGetComponentSnapshotsTool} from '@/plugins/editor-ai/frontend-effect/tools/GetComponentSnapshotsTool.ts';
import {runGetCurrentCanvasSelectionTool} from '@/plugins/editor-ai/frontend-effect/tools/GetCurrentCanvasSelectionTool.ts';
import {
    runGetComponentDocumentTool,
    runResolveComponentSpecsTool,
    runSearchAvailableComponentsTool,
    runSearchComponentDocumentsTool,
} from '@/plugins/editor-ai/frontend-effect/tools/ComponentDocumentationTools.ts';
import {runGetCurrentCanvasRevisionTool, runGetProjectSnapshotTool} from '@/plugins/editor-ai/frontend-effect/tools/CanvasContextTools.ts';
import {runConfirmCanvasPatchTool} from '@/plugins/editor-ai/frontend-effect/tools/ConfirmCanvasPatchTool.ts';
import {runDeleteCanvasComponentsTool} from '@/plugins/editor-ai/frontend-effect/tools/DeleteCanvasComponentsTool.ts';
import {runRequestComponentSelectionTool, runShowPreviewTool} from '@/plugins/editor-ai/frontend-effect/tools/PreviewInteractionTools.ts';
import {acceptRenderedDraftAfterUserConfirmation, runRenderDraftTool} from '@/plugins/editor-ai/frontend-effect/tools/RenderDraftTool.ts';
import {runUserInputTool} from '@/plugins/editor-ai/frontend-effect/tools/UserInputTool.ts';
import {runPushAiDrivenProgressLogTool} from '@/plugins/editor-ai/frontend-effect/tools/PushAiDrivenProgressLogTool.ts';
import {aiDrivenDevWarn} from './AiDrivenDevLogger.ts';
import type {IAiDrivenTaskEvent} from './types/AiDrivenTaskSubmitTypes.ts';
import {FrontendEffectClientError, serializeFrontendEffectError} from '@/plugins/editor-ai/frontend-effect/FrontendEffectClientError.ts';
import {createCanvasOperationJournal} from '@/plugins/editor-ai/frontend-effect/CanvasOperationJournal.ts';
import type {EditorAiEditingSession, EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type {DesignerWorkspaceIdentity} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {AiDrivenProgressTerminalStore} from './AiDrivenProgressTerminalStore.ts';

type EffectTool = (payload: unknown, session: EditorAiEditingSession, signal: AbortSignal) => Promise<unknown> | unknown;

interface AiDrivenWebEffectBridgeDependencies {
    readonly canvas: EditorCanvasService;
    readonly catalog: DesignerCatalog;
    readonly terminal: AiDrivenProgressTerminalStore;
}

interface TaskWorkspaceScope {
    readonly projectId: string;
    readonly workspace: DesignerWorkspaceIdentity;
    readonly sceneVersion: number;
}

interface TurnResources {
    readonly runId: string;
    readonly scope: DesignerWorkspaceIdentity;
    readonly sceneVersion: number;
    readonly ownerKey: string;
    readonly controller: AbortController;
    session?: EditorAiEditingSession;
    pending?: Promise<EditorAiEditingSession>;
}

/** Per-activation Web effect bridge. Queues, sessions and abort controllers die with the plugin. */
export function createAiDrivenWebEffectBridge(dependencies: AiDrivenWebEffectBridgeDependencies) {
    const {canvas, catalog, terminal} = dependencies;
    const activeEffectIds = new Set<string>();
    const effectQueues = new Map<string, {exclusive: Promise<void>; reads: Set<Promise<void>>; pending: number}>();
    const endedRuns = new Set<string>();
    const activeEffectControllers = new Map<string, {controller: AbortController; projectId: string; threadId: string; turnId: string; runId: string}>();
    const turns = new Map<string, TurnResources>();
    const journal = createCanvasOperationJournal();
    const inflight = new Set<Promise<void>>();
    let accepting = true;
    let stopping = false;
    let stopGeneration = 0;

    const runKey = (event: IAiDrivenTaskEvent) => JSON.stringify([event.projectId, event.threadId, event.turnId, event.runId]);
    const turnKey = (event: IAiDrivenTaskEvent) => JSON.stringify([event.projectId, event.threadId, event.turnId]);
    const sameWorkspace = (left: DesignerWorkspaceIdentity | undefined, right: DesignerWorkspaceIdentity) => Boolean(left
        && left.rootId === right.rootId && left.activeId === right.activeId && left.nested === right.nested
        && JSON.stringify(left.loopPath ?? []) === JSON.stringify(right.loopPath ?? []));
    const abortMatchingEffects = (projectId: string, threadId: string, turnId: string, runId: string) => {
        for (const effect of activeEffectControllers.values())
            if (effect.projectId === projectId && effect.threadId === threadId
                && effect.turnId === turnId && effect.runId === runId)
                effect.controller.abort();
    };

    const parseScope = (payload: unknown, event: IAiDrivenTaskEvent): TaskWorkspaceScope => {
        const record = asRecord(payload);
        const agentScope = asRecord(record?.agentScope);
        const rawWorkspace = asRecord(agentScope?.workspaceScope);
        if (!rawWorkspace) {
            throw new FrontendEffectClientError('agent_scope_missing', '此任务没有持久化的工作空间作用域，不能安全读取或修改当前画布', {
                fieldPath: 'agentScope.workspaceScope', actualValue: null,
                expectedValue: {rootId: 'string', activeId: 'string', nested: 'boolean', loopPath: 'string[]'},
            });
        }
        const rootId = text(rawWorkspace.rootId);
        const activeId = text(rawWorkspace.activeId);
        const nested = rawWorkspace.nested;
        const loopPath = rawWorkspace.loopPath == null ? [] : rawWorkspace.loopPath;
        const projectId = text(agentScope?.projectId) || text(event.projectId);
        if (!rootId || !activeId || typeof nested !== 'boolean' || !Array.isArray(loopPath)
            || loopPath.some(id => typeof id !== 'string' || !id.trim()) || !projectId) {
            throw new FrontendEffectClientError('agent_scope_invalid', 'AI 任务工作空间作用域格式无效', {
                fieldPath: 'agentScope.workspaceScope', actualValue: rawWorkspace,
                expectedValue: {rootId: 'string', activeId: 'string', nested: 'boolean', loopPath: 'string[]'},
            });
        }
        const workspace = Object.freeze({rootId, activeId, nested, loopPath: Object.freeze(loopPath.map(id => id.trim()))});
        if (projectId !== text(event.projectId) || rootId !== projectId) {
            throw new FrontendEffectClientError('agent_scope_project_changed', '任务项目作用域与事件项目不匹配', {
                fieldPath: 'agentScope.projectId', actualValue: {projectId, eventProjectId: event.projectId, rootId}, expectedValue: 'same project id',
            });
        }
        const current = canvas.readAiWorkspace();
        if (!sameWorkspace(current?.scope, workspace)) {
            throw new FrontendEffectClientError('agent_scope_workspace_changed', '任务所属工作空间已切换，拒绝访问当前画布', {
                fieldPath: 'agentScope.workspaceScope', actualValue: current?.scope ?? null, expectedValue: workspace,
            });
        }
        return {projectId, workspace, sceneVersion: current!.sceneVersion};
    };

    const currentScopeMatches = (scope: TaskWorkspaceScope) => {
        const current = canvas.readAiWorkspace();
        return scope.projectId === scope.workspace.rootId && sameWorkspace(current?.scope, scope.workspace)
            && current?.sceneVersion === scope.sceneVersion;
    };

    const getTurnResources = (event: IAiDrivenTaskEvent, scope: TaskWorkspaceScope): TurnResources => {
        const key = turnKey(event);
        let resources = turns.get(key);
        if (resources && resources.runId !== event.runId) {
            resources.controller.abort();
            abortMatchingEffects(event.projectId, event.threadId, event.turnId, resources.runId);
            resources.session?.clearDraft(resources.ownerKey);
            resources.session?.dispose();
            turns.delete(key);
            resources = undefined;
        }
        if (resources && (!sameWorkspace(resources.scope, scope.workspace) || resources.sceneVersion !== scope.sceneVersion)) {
            resources.controller.abort();
            abortMatchingEffects(event.projectId, event.threadId, event.turnId, resources.runId);
            resources.session?.dispose();
            turns.delete(key);
            throw new FrontendEffectClientError('agent_scope_changed_within_turn', '同一 AI 任务的工作空间作用域发生变化，已拒绝继续访问画布', {
                fieldPath: 'agentScope.workspaceScope', actualValue: scope.workspace, expectedValue: resources.scope,
            });
        }
        if (!resources) {
            resources = {runId: event.runId, scope: scope.workspace, sceneVersion: scope.sceneVersion,
                ownerKey: key, controller: new AbortController()};
            turns.set(key, resources);
        }
        return resources;
    };

    const prepareSession = async (event: IAiDrivenTaskEvent, request: Record<string, unknown>, signal: AbortSignal) => {
        const scope = parseScope(request, event);
        const resources = getTurnResources(event, scope);
        if (resources.controller.signal.aborted || signal.aborted || !accepting)
            throw Object.assign(new Error('AI editing was stopped'), {name: 'AbortError'});
        if (resources.session?.isActive()) return {scope, resources, session: resources.session};
        if (!resources.pending) {
            resources.pending = canvas.prepareAiEditing(scope.workspace, resources.controller.signal).then(session => {
                if (signal.aborted || !accepting || resources.controller.signal.aborted || !currentScopeMatches(scope) || !session.isActive()) {
                    session.clearDraft(turnKey(event));
                    session.dispose();
                    throw Object.assign(new Error('AI editing workspace changed during setup'), {name: 'AbortError'});
                }
                resources.session = session;
                return session;
            }).finally(() => { resources.pending = undefined; });
        }
        const session = await resources.pending;
        if (signal.aborted || !accepting || !session.isActive() || !currentScopeMatches(scope))
            throw Object.assign(new Error('AI editing workspace changed while preparing the request'), {name: 'AbortError'});
        return {scope, resources, session};
    };

    const readTools: Record<string, EffectTool> = {
        inspect_current_page: (payload, session) => runGetComponentSnapshotsTool({...asRecord(payload), allPage: true}, session),
        get_component_catalog: () => runGetComponentCatalogTool(catalog),
        get_component_snapshots: (payload, session) => runGetComponentSnapshotsTool(payload, session),
        get_component_data_contract: (payload, session) => runGetComponentDataContractTool(payload, session, catalog),
        get_current_canvas_selection: (_payload, session) => runGetCurrentCanvasSelectionTool(session),
        get_project_snapshot: (_payload, session) => runGetProjectSnapshotTool(session),
        get_current_canvas_revision: (_payload, session) => runGetCurrentCanvasRevisionTool(session),
        get_component_document: (payload) => runGetComponentDocumentTool(payload, catalog),
        resolve_component_specs: (payload) => runResolveComponentSpecsTool(payload, catalog),
        search_component_documents: (payload) => runSearchComponentDocumentsTool(payload, catalog),
        search_available_components: (payload) => runSearchAvailableComponentsTool(payload, catalog),
        push_ai_driven_progress_log: (payload) => runPushAiDrivenProgressLogTool(payload, terminal),
    };
    const effectTools: Record<string, EffectTool> = {
        ...readTools,
        create_canvas_components: (payload, session, signal) => executeCreateOrRender(payload, session, signal, 'create_canvas_components'),
        patch_canvas_components: (payload, session) => runApplyComponentPatchTool(payload, session, journal),
        delete_canvas_components: (payload, session) => runDeleteCanvasComponentsTool(payload, session, journal),
        render_draft: (payload, session, signal) => executeCreateOrRender(payload, session, signal, 'render_draft'),
        discard_canvas_draft: (payload, session) => runRenderDraftTool({...asRecord(payload), action: 'clear'}, session, journal),
        confirm_canvas_patch: (payload, _session, signal) => runConfirmCanvasPatchTool(payload, signal),
        request_component_selection: (payload, _session, signal) => runRequestComponentSelectionTool(payload, terminal, signal),
    };

    const executeCreateOrRender = async (raw: unknown, session: EditorAiEditingSession, signal: AbortSignal, operationType: string) => {
        const request = asRecord(raw) ?? {};
        const ownerKey = activeTurnKeyForSession(session) ?? '';
        const action = text(request.action);
        if (action === 'preview') {
            const ready = asRecord(await runRenderDraftTool({...request, ownerKey}, session, journal));
            if (ready?.status !== 'draft-preview-ready') return ready;
            const draftId = text(ready.draftId);
            const revision = typeof ready.revision === 'number' ? ready.revision : Number.NaN;
            if (!draftId || revision !== request.expectedDraftRevision)
                throw new FrontendEffectClientError('draft_revision_conflict', '分区草稿版本与请求不一致，请重新预览', {
                    fieldPath: 'expectedDraftRevision', actualValue: revision, expectedValue: request.expectedDraftRevision,
                });
            try {
                const preview = await runShowPreviewTool({draftId, message: text(request.message) || '请检查完整页面预览。确认后将统一写入正式画布。'}, session, terminal, signal);
                if (!preview.confirmed) {
                    if (!signal.aborted) session.clearDraft(ownerKey);
                    return {status: 'draft-rejected', confirmed: false, draftId, layerCount: 0};
                }
                if (signal.aborted || !session.isActive())
                    throw new FrontendEffectClientError('effect_cancelled', '等待预览确认期间任务已停止');
                const currentDraft = session.readDraft();
                if (!currentDraft || currentDraft.draftId !== draftId || currentDraft.revision !== revision)
                    throw new FrontendEffectClientError('draft_revision_conflict', '确认前分区草稿已变化，请重新预览', {
                        fieldPath: 'draft.revision', actualValue: currentDraft?.revision ?? null, expectedValue: revision,
                    });
                return {...acceptRenderedDraftAfterUserConfirmation(draftId, revision, session), confirmed: true};
            } catch (error) {
                if (!signal.aborted && session.isActive()) session.clearDraft(ownerKey);
                throw error;
            }
        }
        if (action === 'clear' || operationType === 'discard_canvas_draft')
            return runRenderDraftTool({...request, action: 'clear', ownerKey}, session, journal);
        const isPartitionRender = operationType === 'render_draft'
            && (!action || action === 'render')
            && (request.layout != null || request.regionId != null || request.draftId != null);
        const rendered = asRecord(await runRenderDraftTool({...request, action: action || 'render', ownerKey}, session, journal));
        if (isPartitionRender || request.interactive === false || !['create_canvas_components', 'render_draft'].includes(operationType))
            return rendered;
        const draftId = text(rendered?.draftId);
        const revision = typeof rendered?.revision === 'number' ? rendered.revision : undefined;
        if (rendered?.status !== 'draft-rendered' || !draftId) return rendered;
        try {
            const preview = await runShowPreviewTool({
                draftId,
                message: text(request.message) || '请检查画布上的临时页面预览。确认后将写入正式画布。',
            }, session, terminal, signal);
            if (!preview.confirmed) {
                if (!signal.aborted) session.clearDraft(ownerKey);
                return {status: 'draft-rejected', confirmed: false, draftId, layerCount: 0};
            }
            if (signal.aborted || !session.isActive())
                throw new FrontendEffectClientError('effect_cancelled', '等待预览确认期间任务已停止');
            return {...acceptRenderedDraftAfterUserConfirmation(draftId, revision, session), confirmed: true};
        } catch (error) {
            if (!signal.aborted && session.isActive()) session.clearDraft(ownerKey);
            throw error;
        }
    };

    const activeTurnKeyForSession = (session: EditorAiEditingSession) => {
        for (const [key, resources] of turns)
            if (resources.session === session) return key;
        return undefined;
    };

    const completeFailedOperation = async (event: IAiDrivenTaskEvent, operationId: string, error: unknown) => {
        await completeAiDrivenFrontendOperation({
            operationId, status: 'failed', projectId: event.projectId, threadId: event.threadId,
            turnId: event.turnId, runId: event.runId, result: serializeFrontendEffectError(error),
        }, {suppressErrorMessage: true});
    };

    const handleCanvasOperation = async (event: IAiDrivenTaskEvent) => {
        const operationId = text(event.payload.operationId);
        if (!operationId || activeEffectIds.has(operationId)) return;
        const operationType = text(event.payload.operationType);
        const tool = effectTools[operationType];
        if (!tool) {
            await completeFailedOperation(event, operationId, new FrontendEffectClientError('tool_not_supported', 'Web 端未注册前端工具：' + operationType, {
                fieldPath: 'operationType', actualValue: operationType, expectedValue: Object.keys(effectTools).sort(),
            }));
            return;
        }
        activeEffectIds.add(operationId);
        const controller = new AbortController();
        activeEffectControllers.set(operationId, {controller, projectId: event.projectId, threadId: event.threadId,
            turnId: event.turnId, runId: event.runId});
        try {
            const request = asRecord(event.payload.request) ?? event.payload;
            const {scope, resources, session} = await prepareSession(event, request, controller.signal);
            const identityPayload = {
                ...request,
                operationId: request.operationId ?? event.payload.operationId,
                operationFingerprint: request.operationFingerprint ?? event.payload.operationFingerprint,
            };
            assertComponentDocumentVersions(request, catalog);
            const execute = () => tool(request, session, controller.signal);
            const isDraftOperation = ['render_draft', 'create_canvas_components', 'discard_canvas_draft'].includes(operationType);
            const hasOperationId = Boolean(text(identityPayload.operationId));
            const hasFingerprint = Boolean(text(identityPayload.operationFingerprint));
            if (isDraftOperation && hasOperationId !== hasFingerprint)
                throw new FrontendEffectClientError('invalid_operation_identity', '画布草稿动作必须同时携带 operationId 和 operationFingerprint', {
                    fieldPath: hasOperationId ? 'operationFingerprint' : 'operationId',
                    actualValue: hasOperationId ? identityPayload.operationFingerprint : identityPayload.operationId,
                    expectedValue: 'non-empty string',
                });
            const acceptsDraftInternally = operationType === 'render_draft' && text(request.action) === 'accept';
            const result = isDraftOperation && hasOperationId && !acceptsDraftInternally
                ? await journal.run(identityPayload, execute, result => classifyEffectCompletion(operationType, asRecord(result)).status !== 'failed')
                : await execute();
            if (controller.signal.aborted) {
                if (!endedRuns.has(runKey(event)))
                    await completeFailedOperation(event, operationId, new FrontendEffectClientError('effect_cancelled', '前端插件正在停止，画布操作已中止'));
                return;
            }
            if (!accepting || !session.isActive() || !currentScopeMatches(scope) || resources.controller.signal.aborted)
                throw new FrontendEffectClientError('agent_scope_changed_after_effect', '任务在执行期间切换工作空间，拒绝提交迟到结果', {
                    fieldPath: 'agentScope.workspaceScope', actualValue: canvas.readAiWorkspace()?.scope ?? null, expectedValue: scope.workspace,
                });
            const record = asRecord(result);
            const completion = classifyEffectCompletion(operationType, record);
            const resultRevision = typeof record?.resultRevision === 'number' || typeof record?.resultRevision === 'string'
                ? record.resultRevision : typeof record?.revision === 'string' ? record.revision : undefined;
            await completeAiDrivenFrontendOperation({
                operationId, status: completion.status, projectId: event.projectId, threadId: event.threadId,
                turnId: event.turnId, runId: event.runId, resultRevision,
                result: completion.partial && record ? {...record, partial: true} : record ?? {value: result},
            }, {suppressErrorMessage: true});
        } catch (error) {
            if (controller.signal.aborted) {
                if (!endedRuns.has(runKey(event)))
                    await completeFailedOperation(event, operationId, new FrontendEffectClientError('effect_cancelled', '前端插件正在停止，画布操作已中止'));
                return;
            }
            await completeFailedOperation(event, operationId, error);
        } finally {
            activeEffectControllers.delete(operationId);
            activeEffectIds.delete(operationId);
        }
    };

    const handleUserInput = async (event: IAiDrivenTaskEvent) => {
        if (activeEffectIds.has(event.eventId)) return;
        activeEffectIds.add(event.eventId);
        const controller = new AbortController();
        activeEffectControllers.set(event.eventId, {controller, projectId: event.projectId, threadId: event.threadId,
            turnId: event.turnId, runId: event.runId});
        try {
            const result = await runUserInputTool('用户补充输入', event.payload, terminal, controller.signal);
            if (controller.signal.aborted || !accepting) return;
            await steerAiDrivenTask({
                threadId: event.threadId, expectedTurnId: event.turnId, runId: event.runId,
                projectId: event.projectId, inputId: 'web-user-input-' + event.eventId, input: JSON.stringify(result),
            }, {suppressErrorMessage: true});
        } catch (error) {
            const serialized = serializeFrontendEffectError(error);
            const code = text(serialized.code);
            if (controller.signal.aborted || code === 'effect_cancelled') return;
            const inputId = `web-user-input-${event.eventId}`;
            const status = code === 'user_cancelled' ? 'cancelled' : 'failed';
            const questions = Array.isArray(event.payload.questions) ? event.payload.questions : [];
            const questionIds = questions.flatMap(item => {
                const question = asRecord(item);
                return text(question?.id) ? [text(question?.id)] : [];
            });
            const input = {
                interaction: 'userInput', status, ...serialized, inputId, eventId: event.eventId, questionIds,
                interactionState: {status, answers: 'absent'},
                actualValue: serialized.actualValue ?? {status, answers: 'absent'}, actualType: serialized.actualType ?? 'object',
                expectedValue: serialized.expectedValue ?? {status: 'submitted', answers: Object.fromEntries(questionIds.map(id => [id, {answers: ['非空字符串']}]))},
                recovery: '不要自动重复提问；等待用户追加要求，或继续可独立执行的工作。',
            };
            try {
                await steerAiDrivenTask({threadId: event.threadId, expectedTurnId: event.turnId, runId: event.runId,
                    projectId: event.projectId, inputId, input: JSON.stringify(input)}, {suppressErrorMessage: true});
            } catch (steerError) {
                aiDrivenDevWarn('user input bridge failed:', steerError);
            }
        } finally {
            activeEffectControllers.delete(event.eventId);
            activeEffectIds.delete(event.eventId);
        }
    };

    const cleanupTurn = (event: IAiDrivenTaskEvent) => {
        const key = turnKey(event);
        const resources = turns.get(key);
        if (!resources || resources.runId !== event.runId) return;
        resources?.controller.abort();
        if (resources?.session?.isActive()) resources.session.clearDraft(key);
        resources?.session?.dispose();
        turns.delete(key);
        effectQueues.delete(key);
    };

    const handleEvent = async (event: IAiDrivenTaskEvent) => {
        if (!accepting) return;
        const task = (async () => {
            const isTurnEnd = ['turn.cancelled', 'turn.failed', 'turn.completed', 'turn.interrupted', 'turn.budgetExhausted'].includes(event.kind);
            if (isTurnEnd) {
                endedRuns.add(runKey(event));
                abortTurnEffects(event);
                cleanupTurn(event);
                return;
            }
            const action = event.kind === 'agent.canvas_operation.prepared' || event.kind === 'agent.frontend_tool.prepared'
                ? () => handleCanvasOperation(event)
                : event.kind === 'turn.waiting' && event.payload.status === 'waitingUserInput' ? () => handleUserInput(event) : null;
            if (!action || endedRuns.has(runKey(event))) return;
            const key = turnKey(event);
            const queue = effectQueues.get(key) ?? {exclusive: Promise.resolve(), reads: new Set<Promise<void>>(), pending: 0};
            effectQueues.set(key, queue);
            const isRead = (event.kind === 'agent.canvas_operation.prepared' || event.kind === 'agent.frontend_tool.prepared')
                && Object.prototype.hasOwnProperty.call(readTools, text(event.payload.operationType));
            const predecessors = isRead ? [queue.exclusive] : [queue.exclusive, ...queue.reads];
            const queued = Promise.all(predecessors.map(predecessor => predecessor.catch(() => undefined))).then(async () => {
                if (accepting && !endedRuns.has(runKey(event))) await action();
            });
            if (isRead) queue.reads.add(queued); else queue.exclusive = queued;
            queue.pending += 1;
            try { await queued; }
            finally {
                queue.reads.delete(queued);
                if (--queue.pending === 0 && effectQueues.get(key) === queue) effectQueues.delete(key);
            }
        })();
        inflight.add(task);
        try { await task; }
        finally { inflight.delete(task); }
    };

    const abortTurnEffects = (event: IAiDrivenTaskEvent) => {
        abortMatchingEffects(event.projectId, event.threadId, event.turnId, event.runId);
    };

    const invalidateInactiveScopes = () => {
        const invalidTurnKeys = new Set<string>();
        const errors: unknown[] = [];
        for (const [key, resources] of [...turns]) {
            const scope = {projectId: resources.scope.rootId, workspace: resources.scope, sceneVersion: resources.sceneVersion};
            if (currentScopeMatches(scope)) continue;
            invalidTurnKeys.add(key);
            try { resources.session?.clearDraft(resources.ownerKey); }
            catch (error) { errors.push(error); }
            try { resources.controller.abort(); }
            catch (error) { errors.push(error); }
            try { resources.session?.dispose(); }
            catch (error) { errors.push(error); }
            finally { turns.delete(key); }
        }
        for (const effect of activeEffectControllers.values()) {
            if (!invalidTurnKeys.has(JSON.stringify([effect.projectId, effect.threadId, effect.turnId]))) continue;
            try { effect.controller.abort(); }
            catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'AI 工作空间切换清理失败。');
    };

    const pause = () => {
        accepting = false;
        stopping = true;
        stopGeneration += 1;
        for (const effect of activeEffectControllers.values()) effect.controller.abort();
    };
    const prepareStop = async () => {
        const generation = stopGeneration;
        const pending = Promise.allSettled([...inflight]);
        let timeout: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([pending, new Promise(resolve => { timeout = setTimeout(resolve, 8_000); })]);
        if (timeout !== undefined) clearTimeout(timeout);
        if (!stopping || generation !== stopGeneration) return;
    };
    const cancelStop = () => {
        accepting = true;
        if (!stopping) return;
        stopping = false;
        stopGeneration += 1;
        const errors: unknown[] = [];
        for (const [key, resources] of [...turns]) {
            const scope = {projectId: resources.scope.rootId, workspace: resources.scope, sceneVersion: resources.sceneVersion};
            if (!currentScopeMatches(scope)) {
                try { resources.session?.clearDraft(resources.ownerKey); }
                catch (error) { errors.push(error); }
                try { resources.controller.abort(); }
                catch (error) { errors.push(error); }
                try { resources.session?.dispose(); }
                catch (error) { errors.push(error); }
                finally { turns.delete(key); }
            }
        }
        if (errors.length) throw new AggregateError(errors, '取消 AI 插件停止时清理旧工作空间失败。');
    };
    const withdraw = async () => {
        pause();
        const errors: unknown[] = [];
        for (const resources of turns.values()) {
            try { resources.session?.clearDraft(resources.ownerKey); }
            catch (error) { errors.push(error); }
            try { resources.controller.abort(); }
            catch (error) { errors.push(error); }
        }
        try { await prepareStop(); }
        catch (error) { errors.push(error); }
        for (const resources of turns.values()) {
            try { resources.session?.dispose(); }
            catch (error) { errors.push(error); }
        }
        try { turns.clear(); }
        catch (error) { errors.push(error); }
        try { effectQueues.clear(); }
        catch (error) { errors.push(error); }
        try { activeEffectIds.clear(); }
        catch (error) { errors.push(error); }
        try { activeEffectControllers.clear(); }
        catch (error) { errors.push(error); }
        stopping = false;
        endedRuns.clear();
        if (errors.length) throw new AggregateError(errors, 'AI 草稿会话清理期间发生错误。');
    };
    const readDraftSession = (scope?: DesignerWorkspaceIdentity, sceneVersion?: number) => {
        for (const resources of turns.values())
            if (resources.session?.isActive() && (!scope || sameWorkspace(resources.scope, scope))
                && (sceneVersion === undefined || resources.session.sceneVersion === sceneVersion)) return resources.session;
        return undefined;
    };
    return {handleEvent, pause, prepareStop, cancelStop, withdraw, readDraftSession, invalidateInactiveScopes};
}

function classifyEffectCompletion(operationType: string, record: Record<string, unknown> | null): {status: 'applied' | 'rejected' | 'failed'; partial: boolean} {
    if (record?.confirmed === false) return {status: 'rejected', partial: false};
    const writes = new Set(['create_canvas_components', 'patch_canvas_components', 'delete_canvas_components', 'render_draft', 'discard_canvas_draft']);
    if (!writes.has(operationType) || !record || !Array.isArray(record.failed) || record.failed.length === 0)
        return {status: 'applied', partial: false};
    const hasApplied = (Array.isArray(record.applied) && record.applied.length > 0)
        || (Array.isArray(record.deletedComponentIds) && record.deletedComponentIds.length > 0)
        || (Array.isArray(record.partiallyApplied) && record.partiallyApplied.length > 0);
    return {status: 'failed', partial: hasApplied || record.partial === true};
}

function asRecord(value: unknown): Record<string, any> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
