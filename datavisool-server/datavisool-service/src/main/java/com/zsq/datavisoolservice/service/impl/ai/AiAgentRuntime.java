/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.mapper.AiModelMapper;
import com.zsq.datavisoolservice.model.po.AiModelPO;
import com.zsq.datavisoolservice.service.impl.ai.AiAgentToolCatalog.ToolResult;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.Content;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.JacksonChatMessageJsonCodec;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.output.TokenUsage;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.UUID;

import static com.zsq.datavisoolservice.service.impl.ai.AiAgentDebugTrace.map;

/** 由 Web 控制的 LangChain4j 模型和工具循环。 */
@Service
public class AiAgentRuntime {
    private static final Logger log = LoggerFactory.getLogger(AiAgentRuntime.class);
    private static final String WORKER_ID = "web-agent-" + UUID.randomUUID();
    private static final String SYSTEM_PROMPT = """
            你是画布编辑 Agent。只能使用已提供的工具访问当前项目。
            历史对话用于理解背景、已完成结果和已知组件规格；本轮只执行当前用户请求及本轮追加要求，不因画布为空而补做历史任务。
            多步骤、有依赖或需要用户检查点时可调用 update_plan 展示进度；普通问答、只读查询和单次直接修改无需生成计划。plan 中每个步骤必须包含 step 和 status（pending、in_progress 或 completed），计划不作为任务结束的前提。
            所有画布读取必须读取浏览器当前实时状态；修改前必须先读取目标组件的必要快照。
            组件类型不明确时可调用 get_component_catalog，一次获取全部可用组件的选择信息，直接选择明确的 componentType；单个任务最多读取一次目录，禁止猜关键词搜索组件或重复读取目录。已有明确 componentType 时无需读取目录。
            组件规格按需读取：历史记录中已掌握该类型的配置、数据要求及限制时，可直接创建或修改，无需本轮再次读取；不确定或校验提示规格问题时，调用 resolve_component_specs，参数仅传 componentTypes 和 intent，一次取得完整配置、数据要求、限制、示例及 commonFragments。创建参考 example.config，修改参考 example.stylePatch/dataPatch；按完整 G2Plot 标签关联公共片段，提交时必须输出具体字段和值，不得提交标签、函数值或文档未声明字段。修改已有数据或 xField/yField 等字段映射前必须读取 get_component_data_contract，传入目标 componentIds 和本次目标 sourceType；更换数据源时重新读取，只写对应数据源分支。静态数据与最终字段映射必须对每条记录保持一致。
            项目文件只能通过 Workspace 工具读取或修改；只使用相对路径和 workspaceRevision，禁止猜测或输出服务器物理路径。写入前先读取最新修订号，冲突后重新读取再提交。
            工具参数按定义直接传入，禁止使用 payloadJson、扁平颜色字段或自造参数包装；固定字段和枚举按工具定义，组件配置按完整规格。
            用户要求完整页面、复杂页面或包含多个功能区域的页面时，必须先确定整体布局，再分区域生成；不要把整页组件塞进同一个产物。先读取当前画布尺寸和已有组件，确定统一的配色、字号、间距、层级，以及每个区域唯一的 id、绝对坐标 x/y 和尺寸 width/height；区域必须位于画布内。调用 update_plan 记录整体布局、逐区生成校验和最终统一预览的步骤，并声明 completionRequirements.requiredCanvasEffects=["createComponents"]。布局由 Agent 依据需求确定，不为每个区域单独请求用户确认。
            每个区域使用独立的 render_draft staged 文件，文件中只放该区域的完整 components 和 regionId。首个区域文件还必须包含 layout=[{id,x,y,width,height},...]（全部区域清单）、incremental=false、interactive=false；后续区域文件包含 incremental=true、interactive=false，以及最近草稿回执的 draftId。组件使用全页唯一 id 和画布绝对坐标，全部位于所属区域内；单个组件配置必须完整。每个区域依次写入、validate_canvas_artifact，失败时只对该区域文件调用 repair_artifact，校验通过才提交 render_draft(action=render,path,expectedRevision)。此时只累积临时草稿，不写正式画布，也不等待用户确认。
            区域提交返回 draft-rendered、draftId、revision、layerCount，只表示临时草稿已更新，不是页面创建成功；保存最新 draftId 和 revision，再继续下一区域，不要重新输出已完成区域。重新生成已提交区域时使用相同 regionId 和当前 draftId，以新文件替换这个区域，其余区域保留；布局清单保持不变。若前端区域提交失败，读取回执原因后只重新生成该区域；不能清空全部草稿重做整页。文件校验错误则继续局部修复原文件。
            全部 layout 区域成功加入同一草稿后，调用 render_draft(action=preview,draftId,expectedDraftRevision)，传最近草稿回执中的 revision；不传 path、组件内容或文件修订号。该调用才展示一次完整页面预览并等待用户统一确认，确认后全部区域一起写入正式画布。preview 返回 draft_incomplete 时继续生成缺失区域，草稿修订冲突时依据真实回执更新版本；不得改成逐区域确认。只有最终 confirmed=true 且取得 componentBindings/resultRevision 才能宣称完成；用户未确认时如实说明未写入，不得自行重新生成或重复请求确认。普通单组件或单区域的小任务仍使用原创建流程。
            创建或修改组件前，先调用 begin_canvas_artifact，toolName 必须是最终要调用的画布工具。它创建空文件并返回 path/workspaceRevision；随后把 JSON 参数体拆成非空文本块，每次传入块不超过8192个UTF-8字节，逐次调用 write_canvas_artifact。系统累计完整原文后整体格式化，再写入公开产物文件；不能分别格式化文本块。每次写入和读取后都以最近工具回执中的 workspaceRevision 为准；发生修订冲突时先 read_workspace_file 读取最新内容和修订，再继续。文件只含 JSON，不含 Markdown 或说明文字。
            staged 文件格式固定：create_canvas_components 文件为 {"components":[组件对象...]}；patch_canvas_components 文件为 {"patches":[补丁对象...]}；render_draft 文件为 {"components":[组件对象...]}，还可在同一 JSON 对象中提供 message/incremental/interactive，以及分区生成的 layout/regionId/draftId。组件对象每项必须有唯一 id、type、x、y、width、height，并且 config 与 useDefaultConfig=true 二选一；name、order 可选。config 是完整配置，按规格中的 supportsDataInput 判断数据能力：支持数据时 config 必须含实际数据；不支持数据时 config 不得含 data，仅这类组件可用 useDefaultConfig=true。样式和数据只能写在 config.style、config.data；字段映射按组件数据要求提供，仪表盘、水波图、进度环等数值组件无需字段映射。每个区域的创建内容必须完整，不得依赖后续补丁补齐；这不要求一次生成整页。
            patch 文件中的每项沿用 patch_canvas_components 参数结构：componentId、componentType，以及至少一个非空分支；stylePatch 格式为 {"style":{...}}，dataPatch 为按目标数据契约填写的对象，layerPatch 可含 x/y/width/height/name，filterPatch 可含 enable/blur/brightness/contrast/opacity/saturate/hueRotate，reason 可选。修改前读取对应实时快照；数据或字段映射修改还需读取目标数据契约。字段和值遵循已读规格，禁止标签、函数值或未声明字段。
            文件写完后调用 validate_canvas_artifact。系统会先将当前完整文件格式化并写回，再从文件重读后校验语法、结构和组件配置；错误位置与 errorContext 对应格式化后的文件。返回 validated/path/workspaceRevision/contentSha256 只证明该文件版本可提交，不代表画布已创建或修改成功。将该回执的 path 和 workspaceRevision 传给 begin_canvas_artifact 中绑定的同名画布工具提交；create/patch 只接收 path 和 expectedRevision；render_draft 文件提交时 action=render 必填，并传 path/expectedRevision，message/incremental/interactive 和分区字段放在文件 JSON 中，提交参数不会覆盖文件选项。最终 action=preview 只使用 draftId/expectedDraftRevision；action=clear 时只传 action=clear，必须省略 path 和 expectedRevision。提交工具名必须与 begin 时的 toolName 相同，不要重新输出完整 JSON。只有画布工具真实回执确认成功才算完成。
            校验失败返回 repair_required、path、workspaceRevision 和具体错误；调用 repair_artifact 局部修改同一文件，不要重新输出完整产物。语法错误有位置和格式化后文件的 errorContext；结构或配置错误按字段原因修复，必要时读取文件片段、组件规格或数据契约。oldText 必须在当前格式化文件中精确匹配一次，优先复制 errorContext 或文件片段；不能依据 Agent 最初输出的未格式化文本构造补丁。repair_artifact 会先应用全部 edits，再格式化完整结果、写回并从文件重读校验：通过时返回 validated 和最新修订，但不会自动执行；仍失败时返回 repair_required 和格式化后文件中的最新错误，依据该回执继续局部修补。若之后又用 write_canvas_artifact 或 Workspace 工具改过文件，先调用 validate_canvas_artifact；它会重新格式化、写回并校验当前文件。校验通过后再用对应画布工具及最新已校验修订提交。repair_required 是修复中的状态，不是创建成功，也不按普通三次失败终止；取消、预算和授权要求仍须遵守。旧历史若包含 inline 产物，按其历史修复回执中的恢复步骤处理。
            画布工具先返回 operationId/operationType/status，pending/prepared/applying 只是等待；系统会更新真实前端结果，再依据结果继续，无需轮询等待中的操作。failed/rejected 不代表成功，按 code/message 修正。创建成功的 confirmed/componentBindings/resultRevision 已证明实际写入，无后续步骤直接完成，不为获取已返回的ID重复读取画布。
            互不依赖的只读工具可以在同一轮调用并行执行，画布读取和组件目录读取也支持；系统收齐整批真实结果后恢复。依赖前一个结果的读取必须在结果返回后调用。写入和用户交互独占执行，等待前面的读取结束；其后的调用本轮不执行，收到真实结果后重新规划。同类失败两次必须换策略，三次终止；当前授权已拒绝的动作不得换参数重试。
            面向用户的过程说明只能用自然语言描述动作，不得泄露工具/方法名称、参数名、内部字段、调用 ID 或错误堆栈。
            不要访问或修改当前 projectId 之外的项目，不要编造工具执行结果。
            """;

    @Resource
    private AiModelMapper aiModelMapper;
    @Resource
    private AiModelProviderFactory modelProviderFactory;
    @Resource
    private AiAgentToolCatalog toolCatalog;
    @Resource
    private AiAgentService agentService;
    @Resource
    private AiAgentRuntimeSettingsService runtimeSettingsService;

    public void start(String runId, String userId) {
        CompletableFuture.runAsync(() -> run(runId, userId));
    }

    public void run(String runId, String userId) {
        AiAgentService.AgentExecutionContext context = null;
        AiAgentBudget budget = null;
        AiAgentChatMemory memory = null;
        AiAgentToolGuard guard = null;
        AiAgentDebugTrace trace = null;
        try {
            context = agentService.executionContext(runId, userId);
            AiAgentRuntimeSettingsService.RuntimeSettings settings = runtimeSettingsService.load(Long.valueOf(context.userId()));
            AiAgentRuntimeSettingsService.Execution limits = settings.execution();
            long leaseMillis = Math.max(15 * 60_000L,
                    (Math.max(settings.modelRequest().timeoutSeconds(), Math.max(
                            limits.maxToolDurationSeconds(), limits.frontendBatchTimeoutSeconds())) + 60L) * 1_000L);
            if (!agentService.claimRun(context, WORKER_ID, leaseMillis)) {
                log.debug("AI Agent run already claimed or terminal: runId={}", runId);
                return;
            }
            trace = new AiAgentDebugTrace(context);
            var traceContext = context;
            trace.record("segment.started", () -> map("previousRunId", traceContext.context().get("resumedFromRunId"),
                    "checkpointVersion", traceContext.context().get("checkpointVersion"),
                    "resumed", traceContext.checkpointStateJson() != null));
            budget = new AiAgentBudget((Map<String, Object>) context.context().get("executionLimits"),
                    (Map<String, Object>) context.context().get("executionUsage"));
            long completionContinuations = AiAgentBudget.number(budget.persistedSnapshot(), "completionContinuations");
            guard = new AiAgentToolGuard(limits.maxSameReadRepeats(), AiAgentToolProgressGuard.map(
                    ((Map<String, Object>) context.context().get("executionUsage")).get("_toolGuardState")));
            guard.authorizationRevision(longValue(context.context().get("consumedSteerVersion"), 0L));
            var receiptOutcomes = guard.receipts(agentService.contextOperationReceipts(context));
            for (var outcome : receiptOutcomes) {
                budget.metadata("_toolGuardState", guard.snapshot());
                long failures = budget.recordToolOutcome(outcome.result().status());
                reportToolOutcome(context, outcome);
                if (outcome.stop() != null) throw outcome.stop();
                if (AiAgentBudget.failedStatus(outcome.result().status()) && failures >= limits.maxConsecutiveFailures()) throw new AiAgentToolFailurePolicy.Stop(
                        "agent.tool.consecutive_failure_limit", "连续工具失败达到上限");
            }
            if (agentService.isCancelRequested(runId)) {
                log.debug("AI Agent run cancelled before start: runId={}", runId);
                return;
            }
            AiModelConfig modelConfig = resolveModel(context);
            List<Map<String, Object>> inputAttachments = agentService.inputAttachments(context);
            if (!inputAttachments.isEmpty()
                    && !modelProviderFactory.capabilities(modelConfig).supportsVision()) {
                throw new IllegalStateException("当前模型不支持图片输入");
            }
            StreamingChatModel streamingModel = modelProviderFactory.createStreamingChatModel(modelConfig);
            ChatModel fallbackModel = modelProviderFactory.createChatModel(modelConfig);
            var toolSpecifications = toolCatalog.specifications();
            AiAgentContextManager contextManager = new AiAgentContextManager(
                    modelProviderFactory.contextWindowTokens(modelConfig), modelConfig.maxTokens(),
                    settings.context(), toolSpecifications);
            JacksonChatMessageJsonCodec messageCodec = new JacksonChatMessageJsonCodec();
            boolean resumed = context.checkpointStateJson() != null && !context.checkpointStateJson().isBlank();
            List<ChatMessage> initialMessages = resumed
                    ? normalizeRecoveryMessages(messageCodec.messagesFromJson(context.checkpointStateJson()))
                    : new ArrayList<>();
            if (resumed && initialMessages.stream().noneMatch(message -> message instanceof SystemMessage system
                    && system.text().contains(AiAgentContextHistory.FULL_HISTORY_MARKER)))
                throw new IllegalStateException("AI 任务检查点格式不受支持");
            if (resumed) {
                // 恢复时更新当前作用域和工具规则。
                for (int i = 0; i < initialMessages.size(); i++) {
                    if (initialMessages.get(i) instanceof SystemMessage system
                            && system.text().startsWith("你是画布编辑 Agent。只能使用已提供的工具访问当前项目。")) {
                        initialMessages.set(i, SystemMessage.from(systemPrompt(context)
                                + (system.text().contains(AiAgentContextHistory.FULL_HISTORY_MARKER)
                                ? "\n" + AiAgentContextHistory.FULL_HISTORY_MARKER : "")
                                + "\n当前作用域：projectId=" + context.projectId()
                                + ", threadId=" + context.threadId() + ", turnId=" + context.turnId() + ", runId=" + context.runId()));
                    }
                }
            }
            if (resumed) initialMessages = AiAgentContextHistory.refreshReceipts(initialMessages,
                    agentService.contextOperationReceipts(context),
                    Math.min(settings.context().maxStateDigestTokens(), settings.context().maxActiveContextTokens()));
            for (var outcome : receiptOutcomes)
                if (outcome.result().result().get("recovery") instanceof String recovery)
                    initialMessages.add(UserMessage.from("[Agent runtime tool policy]\n" + recovery));
            if (!resumed) {
                initialMessages.add(SystemMessage.from(systemPrompt(context) + "\n" + AiAgentContextHistory.FULL_HISTORY_MARKER
                        + "\n当前作用域：projectId=" + context.projectId()
                        + ", threadId=" + context.threadId() + ", turnId=" + context.turnId() + ", runId=" + context.runId()));
                initialMessages.addAll(agentService.conversationContext(context));
                initialMessages.add(userMessage(context.inputText(), inputAttachments));
            } else if (context.resumeMessage() != null && !context.resumeMessage().isBlank()) {
                initialMessages.add(UserMessage.from("[Agent runtime notice]\n" + (context.context().containsKey("resumedFromRunId")
                        ? "用户已恢复任务。继续之前读取当前画布和工作区，核对已完成效果；依据恢复的真实操作回执继续，禁止直接重放写操作。"
                        : "前端操作状态已更新到对应工具结果与恢复状态摘要。依据真实结果继续；没有后续步骤时直接说明完成情况。")));
            }
            memory = new AiAgentChatMemory(context.turnId(), initialMessages);
            var initializedMessages = List.copyOf(initialMessages);
            trace.record("context.initialized", () -> map("messages", AiAgentDebugTrace.messages(initializedMessages)));
            agentService.saveCheckpoint(context, messageCodec.messagesToJson(memory.messages()), 0);
            long consumedSteerVersion = longValue(context.context().get("consumedSteerVersion"), 0L);
            log.debug("AI Agent run started: runId={}, turnId={}, resumed={}, shortcut={}",
                    runId, context.turnId(), resumed, shortcutCommand(context));
            for (int round = 0; ; round++) {
                if (agentService.isCancelRequested(runId)) {
                    log.debug("AI Agent run cancelled during execution: runId={}, round={}", runId, round);
                    return;
                }
                agentService.renewRunLease(context, WORKER_ID, leaseMillis);
                budget.checkTime();
                consumedSteerVersion = appendSteerMessages(
                        memory,
                        agentService.steerMessagesAfter(context, consumedSteerVersion),
                        consumedSteerVersion, trace
                );
                guard.authorizationRevision(consumedSteerVersion);
                log.debug("AI Agent model round started: runId={}, round={}", runId, round + 1);
                AiAgentContextManager.Window window = contextManager.prepare(memory.messages());
                List<ChatMessage> activeMessages = window.messages();
                long tokensSinceCompaction = budget.tokensSinceCompaction();
                boolean cumulativeCompaction = contextManager.cumulativeCompactionRequired(tokensSinceCompaction);
                if (cumulativeCompaction || window.requiresCompaction()) {
                    ChatRequest summaryRequest = contextManager.summaryRequest(memory.messages());
                    budget.reserveModelCall();
                    agentService.saveUsage(context, budget.persistedSnapshot());
                    agentService.appendEvent(context.threadId(), context.turnId(), context.runId(),
                            "agent.context_compaction.started", Map.of(
                                    "beforeTokens", window.tokens(),
                                    "historyMessages", memory.messages().size(),
                                    "contextCapacityTokens", contextManager.capacity(),
                                    "contextCapacitySource", contextManager.capacitySource(),
                                    "trigger", cumulativeCompaction ? "cumulative_usage" : "context_capacity",
                                    "tokensSinceCompaction", tokensSinceCompaction,
                                    "compactionThresholdTokens", contextManager.compactionThresholdTokens()
                            ));
                    ContextSummary summary = summarizeContext(
                            fallbackModel,
                            summaryRequest,
                            settings.modelRequest().timeoutSeconds(), trace, modelConfig, round + 1
                    );
                    budget.addUsage(summary.usage(), summary.inputTokens(), summary.outputTokens());
                    agentService.saveUsage(context, budget.persistedSnapshot());
                    if (agentService.isCancelRequested(runId)) return;
                    int beforeMessages = memory.messages().size();
                    List<ChatMessage> beforeCompaction = memory.messages();
                    activeMessages = contextManager.compact(beforeCompaction, summary.text(), budget.snapshot());
                    List<ChatMessage> afterCompaction = activeMessages;
                    trace.record("context.compacted", () -> map("strategy", "summary", "summary", summary.text(),
                            "fallback", summary.fallback(), "beforeMessages", AiAgentDebugTrace.messages(beforeCompaction),
                            "afterMessages", AiAgentDebugTrace.messages(afterCompaction),
                            "beforeTokens", window.tokens(), "afterTokens", contextManager.estimate(afterCompaction),
                            "trigger", cumulativeCompaction ? "cumulative_usage" : "context_capacity",
                            "tokensSinceCompaction", tokensSinceCompaction,
                            "compactionThresholdTokens", contextManager.compactionThresholdTokens()));
                    memory.replace(activeMessages);
                    budget.compacted(window.tokens(), contextManager.estimate(activeMessages));
                    budget.context(contextManager.estimate(activeMessages), contextManager.capacity(), contextManager.capacitySource());
                    agentService.saveCheckpoint(context, messageCodec.messagesToJson(memory.messages()), 0);
                    agentService.saveUsage(context, budget.persistedSnapshot());
                    agentService.appendEvent(context.threadId(), context.turnId(), context.runId(),
                            "agent.context_compaction.completed", Map.of(
                                    "droppedMessages", Math.max(0, beforeMessages - activeMessages.size()),
                                    "beforeTokens", window.tokens(),
                                    "afterTokens", contextManager.estimate(activeMessages),
                                    "activeMessages", activeMessages.size(),
                                    "fallback", summary.fallback(),
                                    "usage", budget.snapshot()
                            ));
                    budget.checkTokens();
                }
                budget.context(contextManager.prepare(activeMessages).tokens(), contextManager.capacity(), contextManager.capacitySource());
                budget.reserveModelCall();
                agentService.saveUsage(context, budget.persistedSnapshot());
                ChatRequest request = ChatRequest.builder()
                        .messages(activeMessages)
                        .toolSpecifications(toolSpecifications)
                        .maxOutputTokens(contextManager.outputLimit(contextManager.prepare(activeMessages).tokens()))
                        .build();
                String assistantMessageId = "assistant-" + UUID.randomUUID();
                long dispatchedEstimate = contextManager.estimate(activeMessages);
                long inputTokens = dispatchedEstimate;
                agentService.appendEvent(context.threadId(), context.turnId(), context.runId(),
                        "agent.model_call.started", Map.of(
                                "stepIndex", budget.snapshot().get("modelCalls"),
                                "contextTokens", contextManager.prepare(activeMessages).tokens(),
                                "contextCapacityTokens", contextManager.capacity(),
                                "contextCapacitySource", contextManager.capacitySource(),
                                "usage", budget.snapshot()
                        ));
                String modelCallId = trace.modelStarted(request, modelConfig, round + 1, "main", "streaming");
                ChatResponse response;
                try {
                    response = stream(streamingModel, request, context, assistantMessageId,
                            settings.modelRequest().timeoutSeconds(), trace, modelCallId);
                } catch (RuntimeException streamingFailure) {
                    if (!AiProviderFallback.canFallback(streamingFailure)) throw streamingFailure;
                    String failedCallId = modelCallId;
                    modelCallId = trace.modelStarted(request, modelConfig, round + 1, "main", "fallback");
                    String fallbackCallId = modelCallId;
                    trace.record("model.fallback", () -> map("fromCallId", failedCallId, "callId", fallbackCallId));
                    try {
                        response = chatWithTimeout(fallbackModel, request, settings.modelRequest().timeoutSeconds(), trace, modelCallId);
                    } catch (RuntimeException failure) {
                        trace.modelFailed(modelCallId, failure, null);
                        throw failure;
                    }
                    if (response.aiMessage() != null && response.aiMessage().text() != null) {
                        agentService.appendEvent(context.threadId(), context.turnId(), context.runId(),
                                "assistant.message.delta", Map.of(
                                        "itemId", assistantMessageId,
                                        "itemType", "agentMessage",
                                        "text", response.aiMessage().text()
                                ));
                    }
                }
                trace.modelReceived(modelCallId, response);
                response = response.toBuilder().aiMessage(assignToolCallIds(response.aiMessage())).build();
                trace.modelCompleted(modelCallId, response);
                if (agentService.isCancelRequested(runId)) return;
                TokenUsage responseUsage = response.tokenUsage();
                if (responseUsage != null && responseUsage.inputTokenCount() != null) {
                    inputTokens = responseUsage.inputTokenCount();
                }
                long outputTokens = responseUsage != null && responseUsage.outputTokenCount() != null
                        ? responseUsage.outputTokenCount()
                        : estimateTokens(response);
                long actualContext = budget.addUsage(responseUsage, inputTokens, outputTokens);
                contextManager.recordResponse(actualContext, dispatchedEstimate);
                budget.context(actualContext, contextManager.capacity(), contextManager.capacitySource());
                agentService.saveUsage(context, budget.persistedSnapshot());
                agentService.appendEvent(context.threadId(), context.turnId(), context.runId(),
                        "agent.model_call.completed", Map.of(
                                "stepIndex", budget.snapshot().get("modelCalls"),
                                "usage", budget.snapshot()
                        ));
                budget.checkTokens();
                AiMessage aiMessage = response.aiMessage();
                if (aiMessage == null) {
                    throw new IllegalStateException("模型未返回有效消息");
                }
                memory.add(aiMessage);
                if (aiMessage.text() != null && !aiMessage.text().isBlank()) {
                    agentService.appendAssistantMessage(context, aiMessage.text());
                    agentService.appendEvent(context.threadId(), context.turnId(), context.runId(),
                            "assistant.message.completed", Map.of(
                                    "itemId", assistantMessageId,
                                    "itemType", "agentMessage",
                                    "text", aiMessage.text()
                            ));
                }
                if (!aiMessage.hasToolExecutionRequests()) {
                    agentService.saveCheckpoint(context, messageCodec.messagesToJson(memory.messages()), 0);
                    agentService.markSteersConsumed(context, consumedSteerVersion);
                    List<AiAgentService.SteerMessage> pendingSteers = agentService.steerMessagesAfter(
                            context, consumedSteerVersion);
                    if (!pendingSteers.isEmpty()) {
                        consumedSteerVersion = appendSteerMessages(memory, pendingSteers, consumedSteerVersion, trace);
                        continue;
                    }
                    agentService.markRunVerifying(context);
                    AiAgentService.CompletionCheck check = agentService.checkCompletion(context);
                    if (check.passed()) {
                        break;
                    }
                    completionContinuations++;
                    budget.metadata("completionContinuations", completionContinuations);
                    if (completionContinuations > limits.maxCompletionContinuations()) {
                        throw new IllegalStateException("AI Agent 未满足任务完成条件：" + check.message());
                    }
                    UserMessage continuation = UserMessage.from("任务完成门禁未通过：" + check.message()
                            + "。请继续执行必要的画布工具，不要直接宣称完成。");
                    memory.add(continuation);
                    trace.record("context.appended", () -> map("reason", "completion_check", "messages", AiAgentDebugTrace.messages(List.of(continuation))));
                    continue;
                }
                boolean waiting = false;
                boolean restartForSteer = false;
                List<Map<String, Object>> frontendEffects = new ArrayList<>();
                List<ToolExecutionRequest> toolRequests = aiMessage.toolExecutionRequests();
                int admittedEnd = AiAgentToolScheduling.admittedEnd(toolRequests);
                for (int groupStart = 0; groupStart < admittedEnd;) {
                    if (agentService.isCancelRequested(runId)) return;
                    List<AiAgentService.SteerMessage> pendingSteers = agentService.steerMessagesAfter(context, consumedSteerVersion);
                    if (!pendingSteers.isEmpty()) {
                        appendDeferredToolResults(memory, toolRequests, groupStart, null, trace);
                        consumedSteerVersion = appendSteerMessages(memory, pendingSteers, consumedSteerVersion, trace);
                        restartForSteer = true;
                        break;
                    }
                    int groupEnd = AiAgentToolScheduling.groupEnd(toolRequests, groupStart, admittedEnd);
                    List<ToolResult> cached = new ArrayList<>();
                    for (int index = groupStart; index < groupEnd; index++) {
                        var call = toolRequests.get(index);
                        cached.add(guard.before(call, toolCatalog.cacheVersion(call, context)));
                    }
                    long writes = 0, interactions = 0;
                    for (int index = groupStart; index < groupEnd; index++) {
                        var call = toolRequests.get(index);
                        if (isWriteTool(call.name())) writes++;
                        if (cached.get(index - groupStart) == null && AiAgentToolCatalog.requiresFrontendEffect(call.name())) interactions++;
                    }
                    budget.checkToolBatch(groupEnd - groupStart, writes, interactions);
                    // 先登记整组，再并发派发明确允许的读取；独占工具始终单独执行。
                    for (int index = groupStart; index < groupEnd; index++) {
                        var call = toolRequests.get(index);
                        agentService.appendItem(context, "tool_call", Map.of("requestId", call.id(), "name", call.name(), "arguments", call.arguments()));
                        agentService.appendEvent(context.threadId(), context.turnId(), context.runId(), "tool.requested",
                                Map.of("requestId", call.id(), "name", call.name(), "arguments", call.arguments()));
                        int toolRound = round + 1;
                        boolean cachedResult = cached.get(index - groupStart) != null;
                        trace.record("tool.requested", () -> map("requestId", call.id(), "name", call.name(),
                                "arguments", AiAgentDebugTrace.jsonOrText(call.arguments()), "round", toolRound, "cached", cachedResult));
                        budget.recordTool(isWriteTool(call.name()), false);
                    }
                    budget.metadata("_toolGuardState", guard.snapshot());
                    agentService.saveUsage(context, budget.persistedSnapshot());
                    List<CompletableFuture<ToolResult>> results = new ArrayList<>();
                    var toolContext = context;
                    var toolTrace = trace;
                    var toolGuard = guard;
                    for (int index = groupStart; index < groupEnd; index++) {
                        var call = toolRequests.get(index);
                        var hit = cached.get(index - groupStart);
                        CompletableFuture<ToolResult> execution;
                        if (hit != null) execution = CompletableFuture.completedFuture(hit);
                        else if (AiAgentToolScheduling.parallel(call.name())) execution = CompletableFuture.supplyAsync(
                                () -> executeRegisteredTool(call, toolContext, limits.maxToolDurationSeconds(), toolGuard));
                        else execution = CompletableFuture.completedFuture(executeRegisteredTool(call, toolContext, limits.maxToolDurationSeconds(), toolGuard));
                        results.add(execution.whenComplete((returned, failure) -> toolTrace.record("tool.returned", () ->
                                map("requestId", call.id(), "name", call.name(), "status", returned == null ? "failed" : returned.status(),
                                        "result", returned == null ? null : returned.result(),
                                        "requiresFrontendEffect", returned != null && returned.requiresFrontendEffect(),
                                        "error", failure == null ? null : failure.getMessage()))));
                    }
                    // 收齐共享读取后才允许后续独占调用进入；结果按模型原始顺序记入历史。
                    CompletableFuture.allOf(results.toArray(CompletableFuture[]::new)).join();
                    for (int index = groupStart; index < groupEnd; index++) {
                        var call = toolRequests.get(index);
                        if (agentService.isCancelRequested(runId)) return;
                        var outcome = guard.after(call, results.get(index - groupStart).join());
                        ToolResult result = outcome.result();
                        trace.record("tool.completed", () -> map("requestId", call.id(), "name", call.name(),
                                "status", result.status(), "result", result.result(), "requiresFrontendEffect", result.requiresFrontendEffect()));
                        if (result.requiresFrontendEffect()) {
                            budget.recordFrontendInteraction();
                            frontendEffects.add(result.result());
                            // 同组独立查询全部派发，收齐整组前端回执再进入后续独占步骤。
                            admittedEnd = Math.min(admittedEnd, groupEnd);
                        }
                        agentService.appendItem(context, "tool_result", Map.of("requestId", call.id(), "name", call.name(),
                                "status", result.status(), "result", result.result()));
                        agentService.appendEvent(context.threadId(), context.turnId(), context.runId(), "tool.completed",
                                Map.of("requestId", call.id(), "name", call.name(), "status", result.status(), "result", result.result()));
                        memory.add(ToolExecutionResultMessage.from(call, result.asJson()));
                        long consecutiveFailures = budget.recordToolOutcome(result.status());
                        budget.metadata("_toolGuardState", guard.snapshot());
                        agentService.saveUsage(context, budget.persistedSnapshot());
                        agentService.saveCheckpoint(context, messageCodec.messagesToJson(memory.messages()), 0);
                        reportToolOutcome(context, outcome);
                        if (outcome.stop() != null) throw outcome.stop();
                        if (AiAgentBudget.failedStatus(result.status()) && consecutiveFailures >= limits.maxConsecutiveFailures()) throw new AiAgentToolFailurePolicy.Stop(
                                "agent.tool.consecutive_failure_limit", "连续工具失败达到上限");
                        if ("waiting_input".equals(result.status())) waiting = true;
                    }
                    groupStart = groupEnd;
                }
                if (!restartForSteer && admittedEnd < toolRequests.size()) {
                    appendDeferredToolResults(memory, toolRequests, admittedEnd, frontendEffects.isEmpty() ? null : frontendEffects.get(0), trace);
                    agentService.appendEvent(context.threadId(), context.turnId(), context.runId(), "agent.tool_call.deferred",
                            Map.of("count", toolRequests.size() - admittedEnd, "reason", "execution_barrier"));
                }
                if (restartForSteer) {
                    continue;
                }
                agentService.saveCheckpoint(context, messageCodec.messagesToJson(memory.messages()), round + 1L);
                agentService.markSteersConsumed(context, consumedSteerVersion);
                if (!frontendEffects.isEmpty()) {
                    agentService.markWaitingForFrontendEffects(
                            context, frontendEffects, limits.frontendBatchTimeoutSeconds());
                    waiting = true;
                }
                if (waiting) {
                    trace.record("segment.waiting", () -> map("frontendEffects", frontendEffects));
                    log.debug("AI Agent waiting for frontend interaction: runId={}, round={}", runId, round + 1);
                    return;
                }
            }
            agentService.saveUsage(context, budget.persistedSnapshot());
            agentService.markRunCompleted(context);
            trace.record("segment.completed", () -> map());
            log.debug("AI Agent run completed: runId={}", runId);
        } catch (Throwable error) {
            if (trace != null) trace.record("segment.failed", () -> map("error", error.getClass().getSimpleName(), "message", error.getMessage()));
            if (context != null && !agentService.isCancelRequested(runId)) {
                String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
                if (budget != null) {
                    if (guard != null) budget.metadata("_toolGuardState", guard.snapshot());
                    agentService.saveUsage(context, budget.persistedSnapshot());
                }
                if (memory != null) agentService.saveCheckpoint(context, new JacksonChatMessageJsonCodec()
                        .messagesToJson(normalizeRecoveryMessages(memory.messages())), 0);
                if (error instanceof AiAgentBudget.Exhausted && memory != null) {
                    agentService.saveCheckpoint(context, new JacksonChatMessageJsonCodec()
                            .messagesToJson(normalizeRecoveryMessages(memory.messages())), 0);
                    agentService.markRunBudgetExhausted(context, message);
                    return;
                }
                log.debug("AI Agent run failed: runId={}, code=AGENT_RUNTIME_ERROR, message={}", runId, message, error);
                agentService.markRunFailed(context, error instanceof AiAgentContextHistory.CapacityExceeded
                        ? "AGENT_CONTEXT_TOO_LARGE" : error instanceof AiAgentToolFailurePolicy.Stop stop ? stop.code : "AGENT_RUNTIME_ERROR", message);
            }
        } finally {
            if (trace != null) trace.record("segment.ended", () -> map());
        }
    }

    /** 新响应的调用身份由程序分配；恢复已有历史时保留已分配的 ID。 */
    static AiMessage assignToolCallIds(AiMessage message) {
        if (message == null || !message.hasToolExecutionRequests()) return message;
        var calls = message.toolExecutionRequests().stream()
                .map(call -> call.toBuilder().id("call-" + UUID.randomUUID()).build()).toList();
        return message.toBuilder().toolExecutionRequests(calls).build();
    }

    /** 为中断时尚未返回的工具补充事实不明的结果，让模型重新读取状态后规划，而不是重放写操作。 */
    static List<ChatMessage> normalizeRecoveryMessages(List<ChatMessage> messages) {
        List<ChatMessage> normalized = new ArrayList<>();
        for (int i = 0; i < messages.size(); i++) {
            ChatMessage message = messages.get(i);
            normalized.add(message);
            if (message instanceof AiMessage ai && ai.hasToolExecutionRequests()) {
                java.util.Set<String> returned = new java.util.HashSet<>();
                while (i + 1 < messages.size() && messages.get(i + 1) instanceof ToolExecutionResultMessage result) {
                    normalized.add(result);
                    returned.add(result.id());
                    i++;
                }
                for (ToolExecutionRequest request : ai.toolExecutionRequests()) {
                    if (!returned.contains(request.id())) normalized.add(ToolExecutionResultMessage.from(request,
                            "任务中断或预算暂停，未记录此调用的最终结果；请读取当前状态核对，不要直接重复写入。"));
                }
            }
        }
        return normalized;
    }

    private ChatResponse stream(StreamingChatModel model, ChatRequest request, AiAgentService.AgentExecutionContext context,
                               String assistantMessageId, long timeoutSeconds) {
        return stream(model, request, context, assistantMessageId, timeoutSeconds, null, null);
    }

    private ChatResponse stream(StreamingChatModel model, ChatRequest request, AiAgentService.AgentExecutionContext context,
                               String assistantMessageId, long timeoutSeconds, AiAgentDebugTrace trace, String callId) {
        CompletableFuture<ChatResponse> responseFuture = new CompletableFuture<>();
        AtomicBoolean outputStarted = new AtomicBoolean();
        StringBuilder partialText = new StringBuilder();
        try {
            AiModelWireTrace.withContext(AiModelWireTrace.context(trace, callId), () -> model.chat(request, new StreamingChatResponseHandler() {
                @Override
                public void onPartialResponse(String token) {
                    if (token == null || token.isEmpty()) {
                        return;
                    }
                    synchronized (responseFuture) {
                        if (responseFuture.isDone()) return;
                        outputStarted.set(true);
                        if (trace != null && trace.enabled()) partialText.append(token);
                        agentService.appendEvent(context.threadId(), context.turnId(), context.runId(), "assistant.message.delta", Map.of(
                            "itemId", assistantMessageId,
                            "itemType", "agentMessage",
                            "text", token
                        ));
                    }
                }

                @Override
                public void onCompleteResponse(ChatResponse response) {
                    responseFuture.complete(response);
                }

                @Override
                public void onError(Throwable error) {
                    responseFuture.completeExceptionally(error);
                }
            }));
            return responseFuture.get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (Exception e) {
            synchronized (responseFuture) {
                responseFuture.completeExceptionally(e);
                if (trace != null) trace.modelFailed(callId, e, partialText.toString());
            }
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            if (outputStarted.get()) throw new AiProviderFallback.ResponseStartedException(e);
            throw new IllegalStateException("流式模型调用失败", e);
        }
    }

    private ChatResponse chatWithTimeout(ChatModel model, ChatRequest request, long timeoutSeconds) {
        return chatWithTimeout(model, request, timeoutSeconds, null, null);
    }

    private ChatResponse chatWithTimeout(ChatModel model, ChatRequest request, long timeoutSeconds,
                                         AiAgentDebugTrace trace, String callId) {
        try {
            return CompletableFuture.supplyAsync(() -> AiModelWireTrace.withContext(
                            AiModelWireTrace.context(trace, callId), () -> model.chat(request)))
                    .get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new IllegalStateException("模型调用失败", e);
        }
    }

    private void reportToolOutcome(AiAgentService.AgentExecutionContext context, AiAgentToolFailurePolicy.Outcome outcome) {
        if (outcome.result().status().equals("rejected") || outcome.result().status().equals("failed"))
            agentService.appendEvent(context.threadId(), context.turnId(), context.runId(), "agent.tool_call.failed",
                    Map.of("toolName", outcome.result().toolName(), "message", "工具执行未成功", "code",
                            outcome.result().result().getOrDefault("code", "tool_execution_failed")));
        if (outcome.strategyRequired()) agentService.appendEvent(context.threadId(), context.turnId(), context.runId(),
                "agent.tool_call.strategy_required", Map.of("toolName", outcome.result().toolName(),
                        "message", "同类工具失败已发生两次，正在调整执行策略"));
    }

    private ToolResult executeRegisteredTool(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context, long timeout, AiAgentToolGuard guard) {
        return isRegisteredTool(request.name()) ? executeToolWithTimeout(request, context, timeout, guard)
                : new ToolResult(request.id(), request.name(), "failed", AiAgentErrorFeedback.error("invalid_tool",
                "未注册的 AI Agent 工具：" + request.name(), "toolName", request.name(),
                Map.of("allowedValues", toolCatalog.specifications().stream().map(specification -> specification.name()).toList())), false);
    }

    private ToolResult executeToolWithTimeout(ToolExecutionRequest request,
                                               AiAgentService.AgentExecutionContext context,
                                               long timeoutSeconds, AiAgentToolGuard guard) {
        AtomicBoolean expired = new AtomicBoolean();
        String scope = JSON.toJSONString(List.of(context.projectId(), context.threadId(), context.turnId()));
        CompletableFuture<ToolResult> execution = CompletableFuture.supplyAsync(() -> AiAgentToolScheduling.execute(scope, request.name(),
                () -> expired.get() || agentService.isCancelRequested(context.runId())
                        ? new ToolResult(request.id(), request.name(), "cancelled", AiAgentErrorFeedback.error("cancelled",
                        "任务已取消或工具等待已过期，未启动本次工具执行", "runId", context.runId(),
                        Map.of("state", "任务未取消且工具等待未过期")), false)
                        : toolCatalog.executeWithRepairGuard(request, context, guard::beforeResume)));
        try {
            return execution.get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (Exception e) {
            expired.set(true);
            execution.cancel(true);
            Throwable cause = e.getCause() == null ? e : e.getCause();
            String message = cause instanceof AppException appException && appException.getMsg() != null
                    ? appException.getMsg()
                    : cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
            String code = cause instanceof java.util.concurrent.TimeoutException ? "agent.tool.timeout"
                    : cause instanceof AiAgentToolFailurePolicy.Stop stop ? stop.code
                    : cause instanceof AppException app && app.getCode() == 403 ? "permission_denied"
                    : cause instanceof AppException app && app.getCode() < 500 ? "invalid_arguments" : "tool_execution_failed";
            if (cause instanceof AppException && message.startsWith("agent.") && message.contains(":"))
                code = message.substring(0, message.indexOf(':'));
            Map<String, Object> feedback;
            if (cause instanceof AiAgentErrorFeedback.Failure failure) feedback = failure.result();
            else if (cause instanceof AiAgentDataValidation.Violation violation) feedback = violation.result();
            else if (cause instanceof AiAgentWorkspaceService.WorkspaceException workspace) feedback = workspace.result();
            else if (cause instanceof ComponentDocumentParser.DocumentException document) feedback = document.result();
            else if (cause instanceof java.util.concurrent.TimeoutException) {
                feedback = AiAgentErrorFeedback.error(code, "工具 " + request.name() + " 在 " + timeoutSeconds + " 秒内未返回结果",
                        "execution.durationSeconds", ">=" + timeoutSeconds, Map.of("maximumSeconds", timeoutSeconds));
                feedback.put("timeoutSeconds", timeoutSeconds);
                feedback.put("cancellationRequested", true);
                feedback.put("executionOutcome", "unknown");
                feedback.put("recovery", "已请求取消执行，但无法据此确认没有副作用；先读取真实操作状态或工作区版本，再决定是否重试，不能直接重复写入。");
            } else {
                feedback = AiAgentErrorFeedback.error(code, message, "execution",
                        Map.of("exceptionType", cause.getClass().getSimpleName(), "reason", message),
                        Map.of("state", "工具执行成功返回", "recovery", "依据实际异常原因检查授权、输入或服务状态"));
                feedback.put("exceptionType", cause.getClass().getSimpleName());
            }
            feedback.put("toolName", request.name());
            feedback.putIfAbsent("retryable", cause instanceof AppException app && app.getCode() < 500);
            return new ToolResult(request.id(), request.name(), "failed", feedback, false);
        }
    }

    private boolean isRegisteredTool(String name) {
        return name != null && toolCatalog.specifications().stream()
                .anyMatch(specification -> name.equals(specification.name()));
    }

    private ContextSummary summarizeContext(ChatModel model, ChatRequest request, long timeoutSeconds, AiAgentDebugTrace trace,
                                            AiModelConfig modelConfig, int round) {
        long inputTokens = estimateTokens(request.messages());
        String callId = trace.modelStarted(request, modelConfig, round, "summary", "synchronous");
        try {
            ChatResponse response = chatWithTimeout(model, request, timeoutSeconds, trace, callId);
            trace.modelReceived(callId, response);
            trace.modelCompleted(callId, response);
            String text = response.aiMessage() == null ? null : response.aiMessage().text();
            if (text == null || text.isBlank()) throw new IllegalStateException("上下文摘要为空");
            TokenUsage usage = response.tokenUsage();
            long actualInput = usage != null && usage.inputTokenCount() != null ? usage.inputTokenCount() : inputTokens;
            long actualOutput = usage != null && usage.outputTokenCount() != null
                    ? usage.outputTokenCount() : Math.max(1, (AiAgentContextHistory.bytes(text) + 3) / 4);
            return new ContextSummary(text, actualInput, actualOutput, false, usage);
        } catch (RuntimeException error) {
            trace.modelFailed(callId, error, null);
            throw new IllegalStateException("整体上下文压缩失败，完整历史已保留：" + error.getMessage(), error);
        }
    }

    private record ContextSummary(String text, long inputTokens, long outputTokens, boolean fallback, TokenUsage usage) {}

    /**
     * 模型可能在一条 assistant 消息中返回多个工具调用，但前端工具是异步的，
     * 当前轮可挂起整组独立读取，写入或交互后的调用延后。必须为其余 tool_call_id 补齐 tool 消息，否则下一次
     * 请求会被 OpenAI 兼容接口拒绝为 malformed tool-call history。
     */
    private void appendDeferredToolResults(AiAgentChatMemory memory,
                                           List<ToolExecutionRequest> toolRequests,
                                           int startIndex,
                                           Map<String, Object> waitingEffect, AiAgentDebugTrace trace) {
        if (startIndex >= toolRequests.size()) {
            return;
        }
        Map<String, Object> deferredResult = new LinkedHashMap<>();
        deferredResult.put("code", "tool_call_deferred");
        deferredResult.put("status", "deferred");
        deferredResult.put("message", "前序工具形成执行屏障或用户追加了要求，此调用尚未执行；请依据真实结果和最新要求重新规划。");
        if (waitingEffect != null && !waitingEffect.isEmpty()) {
            Object operationId = waitingEffect.get("operationId");
            if (operationId != null) {
                deferredResult.put("waitingOperationId", operationId);
            }
        }
        String serializedResult = com.alibaba.fastjson2.JSON.toJSONString(deferredResult);
        for (int index = startIndex; index < toolRequests.size(); index++) {
            ToolExecutionRequest deferredRequest = toolRequests.get(index);
            memory.add(ToolExecutionResultMessage.from(deferredRequest, serializedResult));
            trace.record("tool.deferred", () -> map("requestId", deferredRequest.id(), "name", deferredRequest.name(),
                    "arguments", AiAgentDebugTrace.jsonOrText(deferredRequest.arguments()), "result", deferredResult));
        }
    }

    private long estimateTokens(ChatResponse response) {
        String text = response == null || response.aiMessage() == null ? "" : String.valueOf(response.aiMessage());
        return Math.max(1, (text.length() + 3L) / 4L);
    }

    private UserMessage userMessage(String text, List<Map<String, Object>> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return UserMessage.from(text);
        }
        List<Content> contents = new ArrayList<>();
        contents.add(TextContent.from(text));
        for (Map<String, Object> attachment : attachments) {
            String dataUrl = text(attachment.get("dataUrl"));
            String mimeType = text(attachment.get("mimeType"));
            int comma = dataUrl == null ? -1 : dataUrl.indexOf(',');
            if (mimeType == null || !mimeType.startsWith("image/") || comma <= 0
                    || !dataUrl.startsWith("data:" + mimeType + ";base64,")) {
                throw new IllegalStateException("AI 图片附件内容不合法");
            }
            contents.add(ImageContent.from(dataUrl.substring(comma + 1), mimeType));
        }
        return UserMessage.from(contents);
    }

    private long estimateTokens(List<ChatMessage> messages) {
        long bytes = AiAgentContextHistory.bytes(new JacksonChatMessageJsonCodec().messagesToJson(messages));
        return Math.max(1, (bytes + 3L) / 4L);
    }

    private long appendSteerMessages(AiAgentChatMemory memory,
                                     List<AiAgentService.SteerMessage> messages,
                                     long consumedVersion, AiAgentDebugTrace trace) {
        long latest = consumedVersion;
        for (AiAgentService.SteerMessage message : messages) {
            UserMessage appended = UserMessage.from("用户在运行中追加要求：" + message.text());
            memory.add(appended);
            trace.record("context.appended", () -> map("reason", "steer", "steerVersion", message.version(),
                    "messages", AiAgentDebugTrace.messages(List.of(appended))));
            latest = Math.max(latest, message.version());
        }
        return latest;
    }

    private long longValue(Object value, long fallback) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return value == null ? fallback : Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private Map<String, Object> usage(long inputTokens, long outputTokens) {
        return Map.of(
                "inputTokens", inputTokens,
                "outputTokens", outputTokens,
                "totalTokens", inputTokens + outputTokens
        );
    }

    private long elapsedSeconds(long startedNanos) {
        return (System.nanoTime() - startedNanos) / 1_000_000_000L;
    }

    static boolean isWriteTool(String name) {
        return name != null && List.of(
                "create_canvas_components", "patch_canvas_components", "delete_canvas_components", "render_draft",
                "confirm_canvas_patch", "discard_canvas_draft", "apply_workspace_patch",
                "move_workspace_path", "delete_workspace_path", "repair_artifact",
                "begin_canvas_artifact", "write_canvas_artifact", "validate_canvas_artifact"
        ).contains(name);
    }

    private AiModelConfig resolveModel(AiAgentService.AgentExecutionContext context) {
        Long userId = Long.valueOf(context.userId());
        String modelConfigId = text(context.context().get("modelConfigId"));
        AiModelPO model = null;
        if (modelConfigId != null) {
            try {
                model = aiModelMapper.selectById(Long.parseLong(modelConfigId));
            } catch (NumberFormatException ignored) {
                throw new IllegalArgumentException("modelConfigId 格式不正确");
            }
            if (model == null || !userId.equals(model.getUserId())
                    || Integer.valueOf(1).equals(model.getDeleted())) {
                throw new IllegalStateException("未找到对应的 AI 模型");
            }
        }
        if (model == null) {
            model = aiModelMapper.selectOne(new LambdaQueryWrapper<AiModelPO>()
                    .eq(AiModelPO::getUserId, userId)
                    .eq(AiModelPO::getEnabled, 1)
                    .eq(AiModelPO::getIsDefault, 1)
                    .last("limit 1"));
        }
        if (model == null) {
            throw new IllegalStateException("未配置可用的 AI 模型");
        }
        if (!Integer.valueOf(1).equals(model.getEnabled())) {
            throw new IllegalStateException("该 AI 模型已停用，请先启用后再试");
        }
        String runtimeModelId = text(context.context().get("runtimeModelId"));
        if (runtimeModelId == null) {
            runtimeModelId = model.getName();
        }
        String apiKey = model.getApiKey();
        if (AiModelApiKeyCodec.isEncrypted(apiKey)) {
            apiKey = AiModelApiKeyCodec.decrypt(apiKey);
        }
        return new AiModelConfig(
                model.getProvider(),
                model.getBaseUrl(),
                apiKey,
                runtimeModelId,
                model.getTemperature(),
                AiDrivenModelCatalog.resolveMaxOutputTokens(model.getProvider(), runtimeModelId, model.getMaxTokens())
        );
    }

    private String systemPrompt(AiAgentService.AgentExecutionContext context) {
        String prompt = SYSTEM_PROMPT + selectionScopePrompt(context);
        String shortcut = shortcutCommand(context);
        if ("style".equals(shortcut)) {
            return prompt + "\n本轮入口意图为样式优化；任务完成前需要产生至少一次组件补丁效果。";
        }
        if ("data".equals(shortcut)) {
            return prompt + "\n本轮入口意图为数据优化；任务完成前需要产生至少一次组件补丁效果。";
        }
        return prompt;
    }

    private String selectionScopePrompt(AiAgentService.AgentExecutionContext context) {
        Map<String, Object> selection = context.selection();
        if (selection == null || selection.isEmpty() || !hasSelectionTargets(selection)) {
            return "";
        }
        Map<String, Object> facts = new LinkedHashMap<>();
        facts.put("targetIds", selection.get("targetIds"));
        facts.put("components", selection.get("components"));
        return """

                任务启动时的选区是本轮既有组件操作的目标范围（taskStart scope）：%s。
                修改或删除已有组件时只能使用这个范围内的组件 ID；历史消息里的组件 ID 不能决定本轮目标。
                先用 get_component_snapshots 读取这些目标的实时必要快照。不要为了确认已选目标而调用 get_component_catalog 或 get_project_snapshot；仅在确有组件能力或全局页面信息需求时才调用它们。
                """.formatted(JSON.toJSONString(facts));
    }

    private boolean hasSelectionTargets(Map<String, Object> selection) {
        return hasNonBlankId(selection.get("targetIds")) || hasComponentId(selection.get("components"));
    }

    private boolean hasNonBlankId(Object value) {
        if (!(value instanceof List<?> ids)) {
            return false;
        }
        return ids.stream().anyMatch(id -> text(id) != null);
    }

    private boolean hasComponentId(Object value) {
        if (!(value instanceof List<?> components)) {
            return false;
        }
        return components.stream().anyMatch(component -> component instanceof Map<?, ?> raw
                && text(raw.get("id")) != null);
    }

    private String shortcutCommand(AiAgentService.AgentExecutionContext context) {
        Object shortcut = context.context().get("shortcut");
        if (shortcut instanceof Map<?, ?> shortcutMap) {
            String command = text(shortcutMap.get("command"));
            if (command != null) {
                return command;
            }
        }
        return null;
    }

    private String text(Object value) {
        if (value == null) {
            return null;
        }
        String valueText = String.valueOf(value).trim();
        return valueText.isEmpty() ? null : valueText;
    }
}
