/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, computed, makeObservable, observable} from "mobx";
import {globalMessage, type ISelectOption} from "@datavisool/ui";
import {uploadAiDrivenImageAttachment} from "@/api/AiDrivenAttachmentApi.ts";
import {cancelAiDrivenTask, steerAiDrivenTask, submitAiDrivenTask} from "@/api/AiDrivenTaskApi.ts";
import {
    getAiDrivenProviderModelProviders,
    getAiModelConfiguredList,
    type IAiDrivenProviderModelsProvider,
    type IAiModelConfiguredListItem
} from "@/api/AiModelApi.ts";
import {tx} from "@/i18n/miniI18n.ts";
import {
    buildAiDrivenModelConfigOptions,
    buildAiDrivenRuntimeModelOptions,
    buildAiDrivenTaskSubmitPayload,
    createAiDrivenSessionId,
    createAiDrivenSteerInputId,
    createAiDrivenSubmitRequestId,
    createAiDrivenUploadRequestId,
    fileToDataUrl,
    getAiDrivenDefaultRuntimeModelId,
    getAiDrivenProviderModelConfig,
    getAiDrivenSelectedModelProvider,
    getCurrentProjectId,
    getPastedImageFileName,
    MAX_IMAGE_ATTACHMENTS,
} from "./AiDrivenUtil.ts";
import {resolveAiDrivenShortcutSubmission} from "./AiDrivenShortcutCommands.ts";
import aiDrivenProgressTerminalStore from "./AiDrivenProgressTerminalStore.ts";
import {
    AiDrivenTaskRunMonitor,
    clearActiveTaskScope,
    clearPendingTaskScope,
    isActiveTaskStatus,
    persistActiveTaskScope,
    persistPendingTaskScope,
    taskErrorMessage,
    type PersistedAiDrivenTaskScope,
} from "./AiDrivenTaskRunMonitor.ts";
import type {
    AiDrivenTaskSubmitStatus,
    IAiDrivenAttachmentContext,
    IAiDrivenTaskSubmitPayload,
    IAiDrivenTaskSubmitResult,
} from "./types/AiDrivenTaskSubmitTypes.ts";
import {isAiDrivenUserActionRequired} from "./types/AiDrivenTaskSubmitTypes.ts";
import {AiDrivenHistoryStore} from "./thread/AiDrivenHistoryStore.ts";
import {AiDrivenThreadStore} from "./thread/AiDrivenThreadStore.ts";
import {AiDrivenHistoryIntegration} from "./AiDrivenHistoryIntegration.ts";
import {aiDrivenDevError, aiDrivenDevWarn} from "./AiDrivenDevLogger.ts";

export interface PromptImageAttachment {
    /** 本地预览项 id，用于渲染列表 key 和删除定位。 */
    id: number;
    /** 后端附件 id，后续 AI 请求引用图片时使用。 */
    attachmentId: string;
    /** 图片原始文件名，用于缩略图 title。 */
    originalName: string;
    /** 上传成功后后端返回的本地资源 URL，用于图片回显。 */
    previewUrl: string;
    /** 上传请求 id，用于排查附件上传链路。 */
    uploadRequestId?: string;
    /** 后端归一化后的 MIME 类型。 */
    mimeType?: string;
    /** 文件内容 SHA-256 哈希。 */
    sha256?: string;
    /** 图片宽度，后端能识别时返回。 */
    width?: number | null;
    /** 图片高度，后端能识别时返回。 */
    height?: number | null;
}

class AiDrivenBarStore {
    /** 创建 AI驱动输入栏的组件级 MobX 状态容器。 */
    constructor(open: boolean = false) {
        makeObservable(this, {
            mounted: observable,
            visible: observable,
            historyVisible: observable,
            modelConfigId: observable,
            modelConfigs: observable.shallow,
            modelConfigOptions: observable.shallow,
            modelConfigLoading: observable,
            providerModelProviders: observable.shallow,
            runtimeModelLoading: observable,
            runtimeModelId: observable,
            content: observable,
            imageAttachments: observable.shallow,
            imageAttachmentUploadingCount: observable,
            isDragging: observable,
            submitting: observable,
            running: observable,
            stopping: observable,
            currentRequestId: observable,
            currentThreadId: observable,
            currentTurnId: observable,
            currentRunId: observable,
            selectedModelProvider: computed,
            selectedProviderModelConfig: computed,
            runtimeModelOptions: computed,
            setMounted: action,
            setVisible: action,
            setHistoryVisible: action,
            setModelConfigLoading: action,
            applyModelConfigs: action,
            clearModelConfigs: action,
            cancelModelConfigLoad: action,
            setRuntimeModelLoading: action,
            applyProviderModelProviders: action,
            clearProviderModelProviders: action,
            cancelProviderModelLoad: action,
            selectModelConfigId: action,
            setRuntimeModelId: action,
            syncDefaultRuntimeModelId: action,
            setContent: action,
            setDragging: action,
            setSubmitting: action,
            startRunningTask: action,
            acceptRunningTask: action,
            markStoppingTask: action,
            finishRunningTask: action,
            restorePersistedTask: action,
            stopCurrentTask: action,
            removeImageAttachment: action,
            uploadPastedImageFiles: action,
            completeImageUploadCount: action,
            appendImageAttachments: action,
            resetAfterSubmit: action,
            resetAfterClose: action,
            startNewConversation: action,
            selectThreadFromHistory: action,
            setComponentAlive: action,
            destroy: action,
        });
        this.mounted = open;
        this.visible = open;
    }

    /** 控制 AI驱动输入面板是否挂载到页面。 */
    mounted: boolean = false;

    /** 控制 AI驱动输入面板打开或关闭过渡态。 */
    visible: boolean = false;

    /** 控制 Thread/Turn/Item 历史面板。 */
    historyVisible: boolean = false;

    /** 当前选中的 AI 模型配置 id。 */
    modelConfigId: string = "";

    /** 当前项目已配置的 AI 模型配置列表。 */
    modelConfigs: IAiModelConfiguredListItem[] = [];

    /** AI 模型配置下拉框选项。 */
    modelConfigOptions: ISelectOption[] = [];

    /** AI 模型配置列表加载状态。 */
    modelConfigLoading: boolean = false;

    /** AI驱动后端可用的厂商与运行模型列表。 */
    providerModelProviders: IAiDrivenProviderModelsProvider[] = [];

    /** 运行模型列表加载状态。 */
    runtimeModelLoading: boolean = false;

    /** 当前选中的具体运行模型 id。 */
    runtimeModelId: string = "";

    /** 当前提示词输入内容。 */
    content: string = "";

    /** 当前已上传成功并回显的提示图片附件。 */
    imageAttachments: PromptImageAttachment[] = [];

    /** 当前正在上传的提示图片数量，用于限制提交时机和附件上限。 */
    imageAttachmentUploadingCount: number = 0;

    /** 当前面板是否处于拖拽中。 */
    isDragging: boolean = false;

    /** 当前提示词是否正在提交。 */
    submitting: boolean = false;

    /** 当前 AI驱动任务是否正在执行。 */
    running: boolean = false;

    /** 当前 AI驱动任务是否正在停止。 */
    stopping: boolean = false;

    /** 当前正在执行的提交 requestId。 */
    currentRequestId: string = "";

    /** 当前 Agent Thread 与活动 Turn 标识，为后续 steer 命令保留。 */
    currentThreadId: string = "";
    currentTurnId: string = "";
    currentRunId: string = "";

    /** 当前任务创建时绑定的项目，取消时不可改用实时页面作用域。 */
    private currentTaskProjectId: string = "";

    readonly threadStore = new AiDrivenThreadStore();
    readonly historyStore = new AiDrivenHistoryStore();
    private readonly historyIntegration = new AiDrivenHistoryIntegration(this.historyStore);

    /** 当前 AI驱动面板会话 id，用于串联本次打开期间的上传和提交。 */
    aiDrivenSessionId: string = createAiDrivenSessionId();

    /** 模型配置加载请求版本号，用于忽略过期异步响应。 */
    private modelConfigRequestVersion: number = 0;

    /** 运行模型加载请求版本号，用于忽略过期异步响应。 */
    private providerModelRequestVersion: number = 0;

    /** 图片附件本地 id 自增值，保证缩略图 key 稳定。 */
    private imageAttachmentId: number = 0;

    /** 组件是否仍然存活，避免卸载后追加异步上传结果。 */
    private componentAlive: boolean = true;

    private projectInitialization: {projectId: string; promise: Promise<void>} | null = null;

    readonly taskRunMonitor = new AiDrivenTaskRunMonitor({
        isAvailable: (scope) => this.componentAlive && getCurrentProjectId() === scope.projectId,
        onActive: (scope, restored, result) => {
            this.startRunningTask(
                scope.requestId,
                scope.projectId,
                scope.threadId,
                scope.turnId,
                scope.runId,
                activeRunState(scope.status),
            );
            this.acceptRunningTask(scope.requestId, scope.threadId, scope.turnId, scope.runId);
            aiDrivenProgressTerminalStore.setRuntimeSnapshot(result?.runtime);
            if (restored)
                aiDrivenProgressTerminalStore.appendLog({level: "info", message: tx("已恢复正在执行的任务")});
        },
        onTerminal: (scope, result) => this.finishPersistedTask(scope, result),
        onStopped: (scope) => this.finishRunningTask(scope.requestId),
        onEvent: (event) => aiDrivenProgressTerminalStore.applyTaskEvent(event),
        onProgress: (message) => aiDrivenProgressTerminalStore.appendLog({level: "info", message}),
    });

    /** 当前模型配置对应的厂商标识。 */
    get selectedModelProvider() {
        return getAiDrivenSelectedModelProvider(this.modelConfigs, this.modelConfigId);
    }

    /** 当前厂商对应的运行模型配置。 */
    get selectedProviderModelConfig() {
        return getAiDrivenProviderModelConfig(this.providerModelProviders, this.selectedModelProvider);
    }

    /** 当前厂商下可选的运行模型下拉框选项。 */
    get runtimeModelOptions() {
        return buildAiDrivenRuntimeModelOptions(this.selectedProviderModelConfig);
    }

    /** 设置 AI驱动输入面板挂载状态。 */
    setMounted = (mounted: boolean) => {
        this.mounted = mounted;
        if (mounted)
            void this.initializeProjectContext();
    };

    /** 设置 AI驱动输入面板显示状态。 */
    setVisible = (visible: boolean) => {
        this.visible = visible;
    };

    /** 打开或关闭历史记录；关闭时仅停止 Thread 事件监听。 */
    setHistoryVisible = (visible: boolean) => {
        this.historyVisible = visible;
        if (!visible) {
            this.historyIntegration.close();
            return;
        }
        const threadId = this.threadStore.selectedThreadId;
        if (threadId)
            void this.historyIntegration.open(this.threadStore.projectId, threadId);
    };

    toggleHistoryVisible = () => {
        this.setHistoryVisible(!this.historyVisible);
    };

    /** 保持历史面板打开，并切换到一条新的草稿对话。 */
    startNewConversation = () => {
        this.historyIntegration.clear();
    };

    /** 历史面板选择 Thread 后同步启动独立的 Thread cursor。 */
    selectThreadFromHistory = (threadId: string) => {
        if (this.historyVisible && threadId)
            void this.historyIntegration.open(this.threadStore.projectId, threadId);
    };

    /** 设置模型配置列表加载状态。 */
    setModelConfigLoading = (loading: boolean) => {
        this.modelConfigLoading = loading;
    };

    /** 应用模型配置列表并同步默认选中项。 */
    applyModelConfigs = (list: IAiModelConfiguredListItem[]) => {
        const nextOptions = buildAiDrivenModelConfigOptions(list);
        const hasCurrent = nextOptions.some((option) => String(option.value) === this.modelConfigId);
        this.modelConfigs = list;
        this.modelConfigOptions = nextOptions;
        this.modelConfigId = hasCurrent ? this.modelConfigId : String(nextOptions[0]?.value ?? "");
        this.syncDefaultRuntimeModelId();
    };

    /** 清空模型配置列表和当前选中项。 */
    clearModelConfigs = () => {
        this.modelConfigs = [];
        this.modelConfigOptions = [];
        this.modelConfigId = "";
        this.syncDefaultRuntimeModelId();
    };

    /** 加载模型配置列表。 */
    loadModelConfigs = async () => {
        const requestVersion = ++this.modelConfigRequestVersion;
        this.setModelConfigLoading(true);

        try {
            const list = await getAiModelConfiguredList();
            if (!this.isLatestModelConfigRequest(requestVersion))
                return;
            this.applyModelConfigs(list);
        } catch {
            if (this.isLatestModelConfigRequest(requestVersion))
                this.clearModelConfigs();
        } finally {
            if (this.isLatestModelConfigRequest(requestVersion))
                this.setModelConfigLoading(false);
        }
    };

    /** 取消当前模型配置加载结果回写。 */
    cancelModelConfigLoad = () => {
        this.modelConfigRequestVersion += 1;
        this.modelConfigLoading = false;
    };

    /** 设置运行模型列表加载状态。 */
    setRuntimeModelLoading = (loading: boolean) => {
        this.runtimeModelLoading = loading;
    };

    /** 应用厂商运行模型列表并同步默认运行模型。 */
    applyProviderModelProviders = (list: IAiDrivenProviderModelsProvider[]) => {
        this.providerModelProviders = list;
        this.syncDefaultRuntimeModelId();
    };

    /** 清空厂商运行模型列表和当前运行模型。 */
    clearProviderModelProviders = () => {
        this.providerModelProviders = [];
        this.syncDefaultRuntimeModelId();
    };

    /** 加载 AI驱动可用厂商运行模型列表。 */
    loadProviderModelProviders = async () => {
        const requestVersion = ++this.providerModelRequestVersion;
        this.setRuntimeModelLoading(true);

        try {
            const list = await getAiDrivenProviderModelProviders();
            if (!this.isLatestProviderModelRequest(requestVersion))
                return;
            this.applyProviderModelProviders(list);
        } catch {
            if (this.isLatestProviderModelRequest(requestVersion))
                this.clearProviderModelProviders();
        } finally {
            if (this.isLatestProviderModelRequest(requestVersion))
                this.setRuntimeModelLoading(false);
        }
    };

    /** 取消当前运行模型加载结果回写。 */
    cancelProviderModelLoad = () => {
        this.providerModelRequestVersion += 1;
        this.runtimeModelLoading = false;
    };

    /** 选择模型配置并切换到该厂商默认运行模型。 */
    selectModelConfigId = (modelConfigId: string) => {
        this.modelConfigId = modelConfigId;
        this.syncDefaultRuntimeModelId();
    };

    /** 设置具体运行模型 id。 */
    setRuntimeModelId = (runtimeModelId: string) => {
        this.runtimeModelId = runtimeModelId;
    };

    /** 根据当前厂商模型配置同步默认运行模型。 */
    syncDefaultRuntimeModelId = () => {
        this.runtimeModelId = getAiDrivenDefaultRuntimeModelId(this.selectedProviderModelConfig);
    };

    /** 设置提示词输入内容。 */
    setContent = (content: string) => {
        this.content = content;
    };

    /** 设置面板拖拽状态。 */
    setDragging = (dragging: boolean) => {
        this.isDragging = dragging;
    };

    /** 设置提交 loading 状态。 */
    setSubmitting = (submitting: boolean) => {
        this.submitting = submitting;
    };

    /** 进入任务运行态并记录当前 requestId。 */
    startRunningTask = (
        requestId: string,
        projectId: string,
        threadId: string,
        turnId: string = "",
        runId: string = "",
        runState: "running" | "waiting" = "running",
    ) => {
        aiDrivenProgressTerminalStore.startRun(requestId, runState);
        this.running = true;
        this.stopping = false;
        this.submitting = true;
        this.currentRequestId = requestId;
        this.currentThreadId = threadId;
        this.currentTurnId = turnId;
        this.currentRunId = runId;
        this.currentTaskProjectId = projectId;
    };

    /** 后端已持久化接纳任务；结束提交 loading，但继续保持运行态。 */
    acceptRunningTask = (requestId: string, threadId: string, turnId: string, runId: string) => {
        if (!this.isCurrentRequest(requestId))
            return;
        this.submitting = false;
        this.currentThreadId = threadId;
        this.currentTurnId = turnId;
        this.currentRunId = runId;
    };

    /** 将当前任务标记为正在停止。 */
    markStoppingTask = (requestId: string) => {
        if (!this.isCurrentRequest(requestId))
            return;
        this.stopping = true;
    };

    /** 结束当前任务运行态，避免旧请求覆盖新请求状态。 */
    finishRunningTask = (requestId: string) => {
        if (!this.isCurrentRequest(requestId))
            return;
        this.running = false;
        this.stopping = false;
        this.submitting = false;
        this.currentRequestId = "";
        this.currentThreadId = "";
        this.currentTurnId = "";
        this.currentRunId = "";
        this.currentTaskProjectId = "";
    };

    /** 页面刷新或应用重启后恢复上次任务的明确状态。 */
    restorePersistedTask = async () => {
        const projectId = getCurrentProjectId();
        if (!projectId)
            return;
        const restored = await this.taskRunMonitor.restore(projectId);
        if (!restored && this.running && this.currentTaskProjectId === projectId)
            this.finishRunningTask(this.currentRequestId);
    };

    /** 移除指定提示图片附件。 */
    removeImageAttachment = (attachmentId: number) => {
        this.imageAttachments = this.imageAttachments.filter((attachment) => attachment.id !== attachmentId);
    };

    /** 上传粘贴图片并将成功结果追加到附件列表。 */
    uploadPastedImageFiles = async (files: File[]) => {
        if (files.length === 0)
            return;

        const projectId = getCurrentProjectId();
        if (!projectId) {
            globalMessage.messageApi?.error(tx("未获取到项目信息，无法上传图片"));
            return;
        }

        const acceptedImageFiles = this.reserveUploadableImageFiles(files);
        if (acceptedImageFiles.length === 0)
            return;

        const sessionId = this.aiDrivenSessionId;
        const uploadRequestId = createAiDrivenUploadRequestId();
        let uploadedAttachments: Array<PromptImageAttachment | null> = [];
        try {
            uploadedAttachments = await Promise.all(acceptedImageFiles.map(async (file, index) => {
                try {
                    const dataUrl = await fileToDataUrl(file);
                    const attachment = await uploadAiDrivenImageAttachment({
                        projectId,
                        sessionId,
                        uploadRequestId,
                        fileName: getPastedImageFileName(file, index),
                        dataUrl,
                        mime: file.type || undefined,
                    });
                    if (!attachment?.attachmentId || !attachment.url)
                        return null;

                    return this.createPromptImageAttachment({
                        attachmentId: attachment.attachmentId,
                        originalName: attachment.originalName || file.name || tx("粘贴图片"),
                        previewUrl: attachment.url,
                        uploadRequestId: attachment.uploadRequestId,
                        mimeType: attachment.mimeType,
                        sha256: attachment.sha256,
                        width: attachment.width,
                        height: attachment.height,
                    });
                } catch (error) {
                    aiDrivenDevError("Image attachment upload failed:", error);
                    return null;
                }
            }));
        } finally {
            this.completeImageUploadCount(acceptedImageFiles.length);
        }

        const validAttachments = uploadedAttachments.filter((attachment): attachment is PromptImageAttachment => Boolean(attachment));
        if (validAttachments.length < acceptedImageFiles.length)
            globalMessage.messageApi?.error(tx("部分图片上传失败"));

        if (!this.componentAlive || this.aiDrivenSessionId !== sessionId || validAttachments.length === 0)
            return;

        this.appendImageAttachments(validAttachments);
    };

    /** 完成指定数量的图片上传占位。 */
    completeImageUploadCount = (count: number) => {
        this.imageAttachmentUploadingCount = Math.max(0, this.imageAttachmentUploadingCount - count);
    };

    /** 追加图片附件，并按最大附件数裁剪。 */
    appendImageAttachments = (attachments: PromptImageAttachment[]) => {
        const remaining = MAX_IMAGE_ATTACHMENTS - this.imageAttachments.length;
        if (remaining <= 0)
            return;
        this.imageAttachments = [...this.imageAttachments, ...attachments.slice(0, remaining)];
    };

    /** 将提示图片附件转换为任务提交协议中的附件上下文。 */
    buildSubmitAttachmentContexts = (): IAiDrivenAttachmentContext[] => {
        return this.imageAttachments.map((attachment) => ({
            role: "prompt-image",
            attachmentId: attachment.attachmentId,
            uploadRequestId: attachment.uploadRequestId,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sha256: attachment.sha256,
            width: attachment.width,
            height: attachment.height,
        }));
    };

    /** 提交当前 AI驱动提示词任务。 */
    submitPrompt = async () => {
        if (this.running) {
            await this.steerCurrentTask();
            return;
        }
        const submission = resolveAiDrivenShortcutSubmission(this.content);
        const requirement = submission.requirement;
        if (!requirement) {
            globalMessage.messageApi?.warning(submission.shortcut ? tx("请输入快捷指令需求") : tx("请输入需求"));
            return;
        }
        if (this.imageAttachmentUploadingCount > 0) {
            globalMessage.messageApi?.warning(tx("图片仍在上传中，请稍后再试"));
            return;
        }

        const projectId = getCurrentProjectId();
        if (!projectId) {
            globalMessage.messageApi?.error(tx("未获取到项目信息，无法提交任务"));
            return;
        }
        if (!this.modelConfigId) {
            globalMessage.messageApi?.warning(tx("请选择模型配置"));
            return;
        }
        if (!this.runtimeModelId) {
            globalMessage.messageApi?.warning(tx("请选择模型型号"));
            return;
        }

        await this.ensureThreadStore(projectId);
        const thread = await this.threadStore.ensureThread();
        if (!thread) {
            const message = this.threadStore.selectedThread?.status === "archived"
                ? tx("请先恢复已归档对话")
                : tx("对话创建失败，请稍后重试");
            globalMessage.messageApi?.error(message);
            return;
        }

        const requestId = createAiDrivenSubmitRequestId();
        const payload = buildAiDrivenTaskSubmitPayload({
            requestId,
            sessionId: this.aiDrivenSessionId,
            projectId,
            threadId: thread.threadId,
            modelConfigId: this.modelConfigId,
            runtimeModelId: this.runtimeModelId,
            provider: this.selectedModelProvider,
            requirement,
            shortcut: submission.shortcut,
            attachments: this.buildSubmitAttachmentContexts(),
        });
        if (!payload) {
            globalMessage.messageApi?.error(tx("AI驱动任务上下文构造失败"));
            return;
        }

        const pendingScope = {requestId, projectId, threadId: thread.threadId};
        this.taskRunMonitor.stop();
        clearActiveTaskScope(projectId);
        persistPendingTaskScope(pendingScope);
        this.startRunningTask(requestId, projectId, thread.threadId);
        aiDrivenProgressTerminalStore.appendLog({
            level: "info",
            message: `提交需求： ${this.content}`,
        });
        try {
            const result = await submitTaskWithIdempotentRetry(payload);
            if (!this.isCurrentRequest(requestId))
                return;
            if (!result) {
                await this.recoverLostSubmitResponse(projectId, requestId);
                return;
            }
            if (!this.isSubmitResultInScope(result, pendingScope)) {
                clearPendingTaskScope(projectId);
                globalMessage.messageApi?.error(tx("任务作用域校验失败"));
                aiDrivenProgressTerminalStore.finishRun("failed", tx("任务作用域校验失败"));
                this.finishRunningTask(requestId);
                return;
            }
            aiDrivenProgressTerminalStore.setRuntimeSnapshot(result.runtime);
            clearPendingTaskScope(projectId);
            this.refreshThreadState(result.threadId);
            if (result.status === "cancelled") {
                clearActiveTaskScope(projectId);
                if (!this.stopping)
                    globalMessage.messageApi?.success(tx("已停止"));
                aiDrivenProgressTerminalStore.finishRun("cancelled", tx("任务已停止，已完成的步骤仍会保留"));
                this.finishRunningTask(requestId);
            } else if (result.status === "failed" || result.status === "interrupted") {
                clearActiveTaskScope(projectId);
                const message = taskErrorMessage(result);
                aiDrivenProgressTerminalStore.appendLog({level: "error", message});
                aiDrivenProgressTerminalStore.finishRun(result.status === "interrupted" ? "cancelled" : "failed", message);
                globalMessage.messageApi?.error(message);
                this.finishRunningTask(requestId);
            } else if (result.status === "completed") {
                clearActiveTaskScope(projectId);
                this.resetAfterSubmit();
                if (result.diagnostics?.persistenceError) {
                    aiDrivenProgressTerminalStore.appendLog({level: "warning", message: result.diagnostics.persistenceError.message});
                    globalMessage.messageApi?.warning(result.diagnostics.persistenceError.message);
                } else {
                    globalMessage.messageApi?.success(tx("提交成功"));
                }
                aiDrivenProgressTerminalStore.finishRun("completed", tx("任务已完成，请核对画布动作和最终回复"));
                this.finishRunningTask(requestId);
            } else if (isActiveTaskStatus(result.status)) {
                const acceptedScope: PersistedAiDrivenTaskScope = {
                    ...pendingScope,
                    threadId: result.threadId,
                    turnId: result.turnId,
                    runId: result.runId,
                    eventCursor: result.eventCursor,
                    status: result.status,
                };
                persistActiveTaskScope(acceptedScope);
                this.acceptRunningTask(requestId, result.threadId, result.turnId, result.runId);
                this.resetAfterSubmit();
                aiDrivenProgressTerminalStore.appendLog({level: "info", message: tx("任务仍在执行")});
                if (this.mounted)
                    this.taskRunMonitor.watch(acceptedScope);
            } else {
                globalMessage.messageApi?.error(tx("提交失败"));
                aiDrivenProgressTerminalStore.finishRun("failed", tx("提交失败"));
                this.finishRunningTask(requestId);
            }
        } catch (error) {
            aiDrivenDevError("Task submit failed:", error);
            if (this.isCurrentRequest(requestId))
                await this.recoverLostSubmitResponse(projectId, requestId);
        }
    };

    /** 将当前输入追加到正在执行的 Turn。 */
    private steerCurrentTask = async () => {
        const input = this.content.trim();
        if (!input) {
            globalMessage.messageApi?.warning(tx("请输入需要追加的要求"));
            return;
        }
        if (Array.from(input).length > 8000) {
            globalMessage.messageApi?.warning(tx("追加要求不能超过 8000 个字符"));
            return;
        }
        if (this.imageAttachments.length > 0 || this.imageAttachmentUploadingCount > 0) {
            globalMessage.messageApi?.warning(tx("运行中追加暂不支持图片"));
            return;
        }
        const threadId = this.currentThreadId;
        const turnId = this.currentTurnId;
        const runId = this.currentRunId;
        const projectId = this.currentTaskProjectId;
        if (!threadId || !turnId || !runId || !projectId || this.submitting || this.stopping)
            return;

        const inputId = createAiDrivenSteerInputId();
        this.setSubmitting(true);
        try {
            const result = await steerAiDrivenTask({
                threadId,
                expectedTurnId: turnId,
                runId,
                projectId,
                inputId,
                input,
            });
            if (!result || this.currentThreadId !== threadId || this.currentTurnId !== turnId)
                return;
            this.setContent("");
            aiDrivenProgressTerminalStore.appendLog({level: "info", message: tx("追加要求已发送")});
        } catch (error) {
            aiDrivenDevError("Task steer failed:", error);
        } finally {
            if (this.currentThreadId === threadId && this.currentTurnId === turnId)
                this.setSubmitting(false);
        }
    };

    /** 停止当前正在执行的 AI驱动任务。 */
    stopCurrentTask = async () => {
        const requestId = this.currentRequestId;
        const projectId = this.currentTaskProjectId;
        const threadId = this.currentThreadId;
        const turnId = this.currentTurnId;
        const runId = this.currentRunId;
        if (!requestId || !projectId || !threadId || !turnId || !runId || !this.running || this.stopping)
            return;

        this.taskRunMonitor.stop();
        this.markStoppingTask(requestId);
        aiDrivenProgressTerminalStore.appendLog({
            level: "warning",
            message: tx("正在停止任务"),
        });
        try {
            const result = await cancelAiDrivenTask({projectId, threadId, turnId, runId}, {
                suppressErrorMessage: true,
            });
            if (result) aiDrivenProgressTerminalStore.setRuntimeSnapshot(result.runtime);
            if (result?.status === "cancelled") {
                clearActiveTaskScope(projectId);
                aiDrivenProgressTerminalStore.appendLog({
                    level: "success",
                    message: tx("任务已停止"),
                });
                aiDrivenProgressTerminalStore.finishRun("cancelled", tx("任务已停止，已完成的步骤仍会保留"));
                globalMessage.messageApi?.success(tx("已停止"));
                return;
            }
            if (result?.status === "completed" || result?.status === "failed" || result?.status === "interrupted" || result?.status === "budgetExhausted") {
                clearActiveTaskScope(projectId);
                if (result.status === "completed") {
                    aiDrivenProgressTerminalStore.finishRun("completed", tx("任务已完成，请核对画布动作和最终回复"));
                } else if (result.status === "budgetExhausted") {
                    aiDrivenProgressTerminalStore.finishRun("budgetExhausted", tx("预算已用尽，可从历史记录增加预算后继续"));
                } else if (result.status === "interrupted") {
                    aiDrivenProgressTerminalStore.finishRun("cancelled", taskErrorMessage(result));
                } else {
                    aiDrivenProgressTerminalStore.finishRun("failed", taskErrorMessage(result));
                }
            }
            if (!result) {
                aiDrivenProgressTerminalStore.finishRun("cancelled", tx("任务已结束"));
                globalMessage.messageApi?.warning(tx("任务已结束"));
            }
        } catch (error) {
            aiDrivenDevError("Task cancel failed:", error);
            if (this.isCurrentRequest(requestId)) {
                aiDrivenProgressTerminalStore.finishRun("failed", tx("停止失败，请检查任务状态"));
                globalMessage.messageApi?.error(tx("停止失败"));
            }
        } finally {
            this.finishRunningTask(requestId);
            this.refreshThreadState(threadId);
        }
    };

    /** 清理提交成功后的输入内容和图片附件。 */
    resetAfterSubmit = () => {
        this.imageAttachments = [];
        this.imageAttachmentId = 0;
        this.imageAttachmentUploadingCount = 0;
        this.content = "";
    };

    /** 关闭面板只停止监听和渲染，不清空 Thread、运行身份或服务端历史。 */
    resetAfterClose = () => {
        this.taskRunMonitor.stop();
        this.historyIntegration.close();
        this.historyVisible = false;
        this.mounted = false;
        aiDrivenProgressTerminalStore.setVisible(false);
    };

    /** 设置组件存活状态。 */
    setComponentAlive = (alive: boolean) => {
        this.componentAlive = alive;
        if (!alive)
            this.taskRunMonitor.stop();
    };

    /** 释放组件状态并阻止异步结果继续回写。 */
    destroy = () => {
        this.componentAlive = false;
        this.taskRunMonitor.stop();
        this.historyIntegration.close();
        this.threadStore.dispose();
        this.historyStore.dispose();
        this.cancelModelConfigLoad();
        this.cancelProviderModelLoad();
        this.imageAttachments = [];
        this.imageAttachmentUploadingCount = 0;
        this.running = false;
        this.stopping = false;
        this.submitting = false;
        this.currentRequestId = "";
        this.currentThreadId = "";
        this.currentTurnId = "";
        this.currentRunId = "";
        this.currentTaskProjectId = "";
    };

    /** 判断异步响应是否仍属于当前任务。 */
    private isCurrentRequest(requestId: string) {
        return this.currentRequestId === requestId;
    }

    private initializeProjectContext = async () => {
        const projectId = getCurrentProjectId();
        if (!projectId)
            return;
        await this.ensureThreadStore(projectId);
        if (!this.componentAlive || getCurrentProjectId() !== projectId)
            return;
        await this.restorePersistedTask();
        if (this.historyVisible && this.threadStore.selectedThreadId)
            await this.historyIntegration.open(projectId, this.threadStore.selectedThreadId);
    };

    private ensureThreadStore = async (projectId: string) => {
        if (this.projectInitialization?.projectId === projectId) {
            await this.projectInitialization.promise;
            return;
        }
        if (this.threadStore.projectId === projectId)
            return;

        const promise = this.threadStore.initialize(projectId);
        const initialization = {projectId, promise};
        this.projectInitialization = initialization;
        try {
            await promise;
        } finally {
            if (this.projectInitialization === initialization)
                this.projectInitialization = null;
        }
    };

    private recoverLostSubmitResponse = async (projectId: string, requestId: string) => {
        if (!this.mounted)
            return;
        const recovered = await this.taskRunMonitor.restore(projectId);
        if (recovered || !this.isCurrentRequest(requestId))
            return;
        globalMessage.messageApi?.error(tx("提交失败"));
        aiDrivenProgressTerminalStore.finishRun("failed", tx("提交失败"));
        this.finishRunningTask(requestId);
    };

    private isSubmitResultInScope(
        result: IAiDrivenTaskSubmitResult,
        scope: {requestId: string; projectId: string; threadId: string},
    ) {
        return result.requestId === scope.requestId
            && result.projectId === scope.projectId
            && result.threadId === scope.threadId;
    }

    private refreshThreadState = (threadId: string) => {
        void this.threadStore.loadThreads(true);
        if (this.historyVisible && this.threadStore.selectedThreadId === threadId)
            void this.historyIntegration.open(this.threadStore.projectId, threadId);
    };

    /** 清理恢复任务并展示最终诊断信息。 */
    private finishPersistedTask(scope: PersistedAiDrivenTaskScope, result: IAiDrivenTaskSubmitResult) {
        aiDrivenProgressTerminalStore.setRuntimeSnapshot(result.runtime);
        clearActiveTaskScope(scope.projectId);
        clearPendingTaskScope(scope.projectId);
        this.finishRunningTask(scope.requestId);
        this.refreshThreadState(scope.threadId);

        if (result.status === "completed") {
            aiDrivenProgressTerminalStore.appendLog({level: "success", message: tx("任务已完成")});
            aiDrivenProgressTerminalStore.finishRun("completed", tx("任务已完成，请核对画布动作和最终回复"));
        } else if (result.status === "budgetExhausted") {
            aiDrivenProgressTerminalStore.appendLog({level: "warning", message: tx("预算已用尽，可增加预算后继续")});
            aiDrivenProgressTerminalStore.finishRun("budgetExhausted", tx("预算已用尽，可从历史记录增加预算后继续"));
        } else if (result.status === "cancelled" || result.status === "interrupted") {
            aiDrivenProgressTerminalStore.appendLog({level: "warning", message: tx("任务已停止")});
            aiDrivenProgressTerminalStore.finishRun("cancelled", tx("任务已停止，已完成的步骤仍会保留"));
        } else {
            const message = taskErrorMessage(result);
            aiDrivenProgressTerminalStore.appendLog({level: "error", message});
            aiDrivenProgressTerminalStore.finishRun("failed", message);
            globalMessage.messageApi?.error(message);
        }
        if (result.diagnostics?.persistenceError)
            aiDrivenProgressTerminalStore.appendLog({level: "warning", message: result.diagnostics.persistenceError.message});
    }
    /** 判断模型配置请求是否仍为最新请求。 */
    private isLatestModelConfigRequest(requestVersion: number) {
        return this.modelConfigRequestVersion === requestVersion;
    }

    /** 判断运行模型请求是否仍为最新请求。 */
    private isLatestProviderModelRequest(requestVersion: number) {
        return this.providerModelRequestVersion === requestVersion;
    }

    /** 预占可上传图片数量并返回本次实际接受的图片文件。 */
    private reserveUploadableImageFiles(files: File[]) {
        const currentAttachmentCount = this.imageAttachments.length + this.imageAttachmentUploadingCount;
        if (currentAttachmentCount >= MAX_IMAGE_ATTACHMENTS)
            return [];

        const acceptedImageFiles = files.slice(0, MAX_IMAGE_ATTACHMENTS - currentAttachmentCount);
        this.imageAttachmentUploadingCount += acceptedImageFiles.length;
        return acceptedImageFiles;
    }

    /** 创建图片附件渲染对象并补齐本地自增 id。 */
    private createPromptImageAttachment(attachment: Omit<PromptImageAttachment, "id">): PromptImageAttachment {
        return {
            ...attachment,
            id: ++this.imageAttachmentId,
        };
    }
}

/** 响应丢失时用同一 requestId/entry 内容重提一次，由后端幂等返回原 Turn。 */
const submitTaskWithIdempotentRetry = async (payload: IAiDrivenTaskSubmitPayload) => {
    try {
        const result = await submitAiDrivenTask(payload);
        if (result)
            return result;
    } catch (error) {
        aiDrivenDevWarn("Task admission response unavailable, retrying idempotently:", error);
    }
    return await submitAiDrivenTask(payload, {suppressErrorMessage: true});
};

export default AiDrivenBarStore;

const activeRunState = (status?: AiDrivenTaskSubmitStatus): "running" | "waiting" =>
    isAiDrivenUserActionRequired(status)
        ? "waiting"
        : "running";
