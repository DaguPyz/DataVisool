/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.mapper.AiAgentCheckpointMapper;
import com.zsq.datavisoolservice.mapper.AiAgentEventMapper;
import com.zsq.datavisoolservice.mapper.AiAgentItemMapper;
import com.zsq.datavisoolservice.mapper.AiAgentOperationMapper;
import com.zsq.datavisoolservice.mapper.AiAgentRunMapper;
import com.zsq.datavisoolservice.mapper.AiAgentThreadMapper;
import com.zsq.datavisoolservice.mapper.AiAgentTurnMapper;
import com.zsq.datavisoolservice.mapper.ProjectMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.po.AiAgentCheckpointPO;
import com.zsq.datavisoolservice.model.po.AiAgentEventPO;
import com.zsq.datavisoolservice.model.po.AiAgentItemPO;
import com.zsq.datavisoolservice.model.po.AiAgentOperationPO;
import com.zsq.datavisoolservice.model.po.AiAgentRunPO;
import com.zsq.datavisoolservice.model.po.AiAgentThreadPO;
import com.zsq.datavisoolservice.model.po.AiAgentTurnPO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.util.AppContextUtil;
import dev.langchain4j.data.message.*;
import jakarta.annotation.Resource;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AI Agent 的产品级生命周期服务。LangChain4j 只负责模型协议，历史、事件和运行状态由本服务保存。
 */
@Service
public class AiAgentService {
    private static final Logger log = LoggerFactory.getLogger(AiAgentService.class);
    private static final int MAX_EVENT_LIMIT = 500;
    private static final int MAX_ITEM_LIMIT = 500;
    private static final int MAX_INPUT_LENGTH = 32_000;
    private static final int MAX_EVENT_SEQUENCE_RESERVATION_RETRIES = 8;
    private static final String WAITING_FRONTEND_OPERATION_IDS = "waitingFrontendOperationIds";
    private static final String WAITING_FRONTEND_DEADLINE_AT = "waitingFrontendDeadlineAt";

    private final Map<String, Object> threadLocks = new ConcurrentHashMap<>();
    private final Map<String, Object> turnLocks = new ConcurrentHashMap<>();
    private final Map<String, Object> projectLocks = new ConcurrentHashMap<>();

    @Resource
    private AiAgentThreadMapper threadMapper;
    @Resource
    private AiAgentTurnMapper turnMapper;
    @Resource
    private AiAgentItemMapper itemMapper;
    @Resource
    private AiAgentRunMapper runMapper;
    @Resource
    private AiAgentEventMapper eventMapper;
    @Resource
    private AiAgentCheckpointMapper checkpointMapper;
    @Resource
    private AiAgentOperationMapper operationMapper;
    @Resource
    private ComponentDocumentService componentDocuments;
    @Resource
    private ProjectMapper projectMapper;
    @Resource
    private AiDrivenAttachmentService attachmentService;
    @Resource
    @Lazy
    private AiAgentRuntime runtime;
    @Resource
    private AiAgentRuntimeSettingsService runtimeSettingsService;

    @Transactional(rollbackFor = Exception.class)
    public ThreadView createThread(ThreadCreateRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        User user = currentUser();
        String projectId = required(request.projectId(), "projectId");
        requireProject(projectId, user);
        String requestedId = trimToNull(request.threadId());
        String threadId = requestedId == null ? id("thread") : requestedId;
        validateId(threadId, "threadId");
        synchronized (threadLock(threadId)) {
            AiAgentThreadPO existing = threadMapper.selectById(threadId);
            if (existing != null) {
                requireThread(existing, user, projectId);
                return toThreadView(existing);
            }
            long now = System.currentTimeMillis();
            AiAgentThreadPO thread = new AiAgentThreadPO();
            thread.setThreadId(threadId);
            thread.setProjectId(projectId);
            thread.setUserId(userId(user));
            thread.setTitle(normalizeTitle(request.title()));
            thread.setStatus("active");
            thread.setEventSequenceNo(0L);
            thread.setCreatedAt(now);
            thread.setUpdatedAt(now);
            threadMapper.insert(thread);
            appendEvent(threadId, null, null, "thread.created", Map.of(
                    "threadId", threadId,
                    "projectId", projectId
            ));
            return toThreadView(thread);
        }
    }

    public List<ThreadView> listThreads(String projectId) {
        User user = currentUser();
        String normalizedProjectId = required(projectId, "projectId");
        requireProject(normalizedProjectId, user);
        List<AiAgentThreadPO> records = threadMapper.selectList(new LambdaQueryWrapper<AiAgentThreadPO>()
                .eq(AiAgentThreadPO::getProjectId, normalizedProjectId)
                .eq(AiAgentThreadPO::getUserId, userId(user))
                .orderByDesc(AiAgentThreadPO::getUpdatedAt));
        return records.stream().map(this::toThreadView).toList();
    }

    public ThreadView readThread(String threadId, String projectId) {
        AiAgentThreadPO thread = requireThreadForCurrentUser(threadId);
        requireScopeValue(projectId, thread.getProjectId(), "projectId");
        return toThreadView(thread);
    }

    @Transactional(rollbackFor = Exception.class)
    public ThreadView updateThread(ThreadUpdateRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        AiAgentThreadPO thread = requireThreadForCurrentUser(request.threadId());
        requireScopeValue(request.projectId(), thread.getProjectId(), "projectId");
        String title = request.title() == null ? thread.getTitle() : normalizeTitle(request.title());
        String status = request.status() == null ? thread.getStatus() : normalizeThreadStatus(request.status());
        thread.setTitle(title);
        thread.setStatus(status);
        thread.setUpdatedAt(System.currentTimeMillis());
        threadMapper.update(null, new LambdaUpdateWrapper<AiAgentThreadPO>()
                .eq(AiAgentThreadPO::getThreadId, thread.getThreadId())
                .set(AiAgentThreadPO::getTitle, title)
                .set(AiAgentThreadPO::getStatus, status)
                .set(AiAgentThreadPO::getUpdatedAt, thread.getUpdatedAt()));
        appendEvent(thread.getThreadId(), null, null, "archived".equals(status) ? "thread.archived" : "thread.updated", Map.of(
                "threadId", thread.getThreadId(),
                "status", status
        ));
        return toThreadView(thread);
    }

    @Transactional(rollbackFor = Exception.class)
    public ThreadView archiveThread(String threadId, String projectId) {
        return updateThread(new ThreadUpdateRequest(projectId, threadId, null, "archived"));
    }

    public List<EventView> events(EventQueryRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        AiAgentThreadPO thread = requireThreadForCurrentUser(request.threadId());
        requireScopeValue(request.projectId(), thread.getProjectId(), "projectId");
        if (request.turnId() != null && !request.turnId().isBlank()) {
            AiAgentTurnPO scopedTurn = turnMapper.selectById(request.turnId());
            if (scopedTurn == null || !thread.getThreadId().equals(scopedTurn.getThreadId())) {
                throw new AppException(409, "事件查询的 turnId 不属于当前会话");
            }
        }
        long cursor = request.cursor() == null ? 0L : Math.max(0L, request.cursor());
        int limit = boundedLimit(request.limit(), MAX_EVENT_LIMIT);
        List<AiAgentEventPO> events = eventMapper.selectList(new LambdaQueryWrapper<AiAgentEventPO>()
                .eq(AiAgentEventPO::getThreadId, thread.getThreadId())
                .eq(request.turnId() != null && !request.turnId().isBlank(), AiAgentEventPO::getTurnId, request.turnId())
                .eq(request.runId() != null && !request.runId().isBlank(), AiAgentEventPO::getRunId, request.runId())
                .gt(AiAgentEventPO::getSequenceNo, cursor)
                .orderByAsc(AiAgentEventPO::getSequenceNo)
                .last("limit " + limit));
        return events.stream().map(value -> toEventView(value, thread.getProjectId())).toList();
    }

    public List<TurnView> listTurns(String threadId, String projectId) {
        AiAgentThreadPO thread = requireThreadForCurrentUser(threadId);
        requireScopeValue(projectId, thread.getProjectId(), "projectId");
        return turnMapper.selectList(new LambdaQueryWrapper<AiAgentTurnPO>()
                        .eq(AiAgentTurnPO::getThreadId, thread.getThreadId())
                        .orderByAsc(AiAgentTurnPO::getCreatedAt))
                .stream().map(this::toTurnView).toList();
    }

    public TurnView readTurn(String turnId, String projectId) {
        AiAgentTurnPO turn = requireTurnForCurrentUser(turnId);
        AiAgentThreadPO thread = requireThreadForCurrentUser(turn.getThreadId());
        requireScopeValue(projectId, thread.getProjectId(), "projectId");
        return toTurnView(turn);
    }

    public List<ItemView> listItems(ItemListRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        AiAgentTurnPO turn = requireTurnForCurrentUser(request.turnId());
        AiAgentThreadPO thread = requireThreadForCurrentUser(turn.getThreadId());
        requireScopeValue(request.projectId(), thread.getProjectId(), "projectId");
        int limit = boundedLimit(request.limit(), MAX_ITEM_LIMIT);
        return itemMapper.selectList(new LambdaQueryWrapper<AiAgentItemPO>()
                        .eq(AiAgentItemPO::getTurnId, turn.getTurnId())
                        .orderByAsc(AiAgentItemPO::getSequenceNo)
                        .last("limit " + limit))
                .stream().map(this::toItemView).toList();
    }

    public ItemView readItem(String itemId, String projectId) {
        AiAgentItemPO item = itemMapper.selectById(required(itemId, "itemId"));
        if (item == null) {
            throw new AppException(404, "AI Agent 条目不存在");
        }
        AiAgentTurnPO turn = requireTurnForCurrentUser(item.getTurnId());
        AiAgentThreadPO thread = requireThreadForCurrentUser(turn.getThreadId());
        requireScopeValue(projectId, thread.getProjectId(), "projectId");
        return toItemView(item);
    }

    @Transactional(rollbackFor = Exception.class)
    public TaskView submit(AgentSubmitRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        User user = currentUser();
        String threadId = required(request.threadId(), "threadId");
        AiAgentThreadPO thread = requireThread(threadId, user);
        requireScopeValue(required(request.projectId(), "projectId"), thread.getProjectId(), "projectId");
        if ("archived".equals(thread.getStatus())) {
            throw new AppException(409, "归档会话不能创建新的轮次");
        }
        String requestId = required(request.requestId(), "requestId");
        validateId(requestId, "requestId");
        String inputText = required(request.normalizedInputText(), "inputText");
        if (inputText.length() > MAX_INPUT_LENGTH) {
            throw new AppException(400, "inputText 超过长度限制");
        }
        String turnId = trimToNull(request.turnId());
        if (turnId == null) {
            turnId = id("turn");
        }
        validateId(turnId, "turnId");
        String runId = id("run");
        long now = System.currentTimeMillis();
        synchronized (projectLock(thread.getProjectId())) {
            ProjectPO lockedProject = projectMapper.selectOne(new LambdaQueryWrapper<ProjectPO>()
                    .eq(ProjectPO::getId, Long.parseLong(thread.getProjectId()))
                    .eq(ProjectPO::getDeleted, 0)
                    .last("for update"));
            if (lockedProject == null) {
                throw new AppException(409, "项目已不存在，不能创建 AI Agent 轮次");
            }
            AiAgentTurnPO duplicate = turnMapper.selectOne(new LambdaQueryWrapper<AiAgentTurnPO>()
                    .eq(AiAgentTurnPO::getThreadId, threadId)
                    .eq(AiAgentTurnPO::getRequestId, requestId)
                    .last("limit 1"));
            if (duplicate != null) {
                return taskView(duplicate, requireRunForTurn(duplicate.getTurnId()));
            }
            List<String> projectThreadIds = threadMapper.selectList(new LambdaQueryWrapper<AiAgentThreadPO>()
                            .eq(AiAgentThreadPO::getProjectId, thread.getProjectId())
                            .eq(AiAgentThreadPO::getUserId, userId(user)))
                    .stream().map(AiAgentThreadPO::getThreadId).toList();
            if (!projectThreadIds.isEmpty()) {
                long activeTurns = turnMapper.selectCount(new LambdaQueryWrapper<AiAgentTurnPO>()
                        .in(AiAgentTurnPO::getThreadId, projectThreadIds)
                        .in(AiAgentTurnPO::getStatus, List.of(
                                "queued", "running", "verifying", "waiting_input",
                                "waiting_user_input", "waiting_frontend_tool", "waiting_user_confirmation"
                        )));
                if (activeTurns > 0) {
                    throw new AppException(409, "当前项目已有正在执行的 AI Agent 轮次");
                }
            }
            AiAgentTurnPO existing = turnMapper.selectById(turnId);
            if (existing != null) {
                if (!threadId.equals(existing.getThreadId())) {
                    throw new AppException(409, "turnId 已属于其他会话");
                }
                return taskView(existing, requireRunForTurn(existing.getTurnId()));
            }
            AiAgentTurnPO turn = new AiAgentTurnPO();
            turn.setTurnId(turnId);
            turn.setThreadId(threadId);
            turn.setRequestId(requestId);
            turn.setInputText(inputText);
            List<Map<String, Object>> attachments = resolveAttachments(request);
            turn.setInputAttachments(JSON.toJSONString(attachments));
            Map<String, Object> executionContext = request.context() == null
                    ? new LinkedHashMap<>()
                    : new LinkedHashMap<>(request.context());
            executionContext.put("schemaVersion", request.schemaVersion());
            executionContext.put("requestId", request.requestId());
            executionContext.put("sessionId", request.sessionId());
            executionContext.put("projectId", request.projectId());
            executionContext.put("modelConfigId", request.normalizedModelConfigId());
            executionContext.put("runtimeModelId", request.normalizedRuntimeModelId());
            executionContext.put("provider", request.normalizedProvider());
            turn.setContextJson(JSON.toJSONString(executionContext));
            turn.setStatus("queued");
            turn.setSteerVersion(0);
            turn.setCreatedAt(now);
            turnMapper.insert(turn);

            AiAgentRunPO run = new AiAgentRunPO();
            run.setRunId(runId);
            run.setTurnId(turnId);
            run.setStatus("queued");
            run.setCancelRequested(0);
            run.setConsumedSteerVersion(0);
            run.setLimitsJson(JSON.toJSONString(AiAgentBudget.limits(runtimeSettingsService.load(user.getId()).execution())));
            run.setUsageJson("{}");
            run.setCreatedAt(now);
            runMapper.insert(run);

            appendItem(thread, turn, "user_message", Map.of(
                    "text", inputText,
                    "attachments", attachments
            ));
            appendEvent(threadId, turnId, runId, "turn.started", Map.of("turnId", turnId, "runId", runId));
            thread.setCurrentTurnId(turnId);
            thread.setUpdatedAt(now);
            threadMapper.update(null, new LambdaUpdateWrapper<AiAgentThreadPO>()
                    .eq(AiAgentThreadPO::getThreadId, threadId)
                    .set(AiAgentThreadPO::getCurrentTurnId, turnId)
                    .set(AiAgentThreadPO::getUpdatedAt, now));
            startRuntimeAfterCommit(runId, userId(user));
            return taskView(turn, run);
        }
    }

    private void startRuntimeAfterCommit(String runId, String userId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            runtime.start(runId, userId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                runtime.start(runId, userId);
            }
        });
    }

    @Transactional(rollbackFor = Exception.class)
    public TaskView resume(AgentResumeRequest request) {
        if (request == null) throw new AppException(400, "请求体不能为空");
        User user = currentUser();
        AiAgentTurnPO original = requireTurnForCurrentUser(request.turnId());
        AiAgentThreadPO thread = requireThreadForCurrentUser(original.getThreadId());
        requireScopeValue(required(request.projectId(), "projectId"), thread.getProjectId(), "projectId");
        requireScopeValue(required(request.threadId(), "threadId"), thread.getThreadId(), "threadId");
        String sessionId = required(request.sessionId(), "sessionId");
        if ("archived".equals(thread.getStatus())) throw new AppException(409, "归档会话不能恢复任务");
        synchronized (projectLock(thread.getProjectId())) {
            projectMapper.selectOne(new LambdaQueryWrapper<ProjectPO>()
                    .eq(ProjectPO::getId, Long.parseLong(thread.getProjectId())).last("for update"));
            AiAgentTurnPO turn = turnMapper.selectOne(new LambdaQueryWrapper<AiAgentTurnPO>()
                    .eq(AiAgentTurnPO::getTurnId, original.getTurnId()).last("for update"));
            AiAgentRunPO previous = requireRunForTurn(turn.getTurnId());
            Map<String, Object> context = parseMap(turn.getContextJson());
            if (isActiveStatus(turn.getStatus()) && request.previousRunId() != null
                    && Objects.equals(request.previousRunId(), context.get("resumedFromRunId"))) {
                return taskView(turn, previous);
            }
            if (!List.of("interrupted", "budget_exhausted").contains(turn.getStatus())
                    || !Objects.equals(previous.getStatus(), turn.getStatus())) {
                throw new AppException(409, "只有中断或预算耗尽的任务可以恢复");
            }
            if (request.previousRunId() != null && !request.previousRunId().equals(previous.getRunId())) {
                throw new AppException(409, "任务运行已发生变化，请刷新历史记录");
            }
            AiAgentCheckpointPO checkpoint = checkpoint(previous);
            long version = checkpoint == null || checkpoint.getRevision() == null ? 0 : checkpoint.getRevision();
            if (request.expectedCheckpointVersion() != null && request.expectedCheckpointVersion() != version) {
                throw new AppException(409, "任务检查点已发生变化，请刷新历史记录");
            }
            if (!recoverable(turn, previous)) throw new AppException(409, "任务缺少安全恢复的检查点");
            if (checkpoint != null) {
                try {
                    new dev.langchain4j.data.message.JacksonChatMessageJsonCodec().messagesFromJson(checkpoint.getStateJson());
                } catch (RuntimeException error) {
                    throw new AppException(409, "任务检查点无法读取，不能恢复");
                }
            }
            List<String> projectThreads = threadMapper.selectList(new LambdaQueryWrapper<AiAgentThreadPO>()
                    .eq(AiAgentThreadPO::getProjectId, thread.getProjectId()))
                    .stream().map(AiAgentThreadPO::getThreadId).toList();
            if (turnMapper.selectCount(new LambdaQueryWrapper<AiAgentTurnPO>()
                    .in(AiAgentTurnPO::getThreadId, projectThreads)
                    .ne(AiAgentTurnPO::getTurnId, turn.getTurnId())
                    .in(AiAgentTurnPO::getStatus, activeStatuses())) > 0) {
                throw new AppException(409, "当前项目已有正在执行的 AI Agent 轮次");
            }
            Map<String, Object> limits = AiAgentBudget.extend(runLimits(previous), runUsage(previous),
                    request.budgetExtension(), "budget_exhausted".equals(turn.getStatus()));
            long now = Math.max(System.currentTimeMillis(), previous.getCreatedAt() + 1);
            AiAgentRunPO run = new AiAgentRunPO();
            run.setRunId(id("run"));
            run.setTurnId(turn.getTurnId());
            run.setStatus("queued");
            run.setCancelRequested(0);
            run.setConsumedSteerVersion(previous.getConsumedSteerVersion());
            run.setCheckpointId(previous.getCheckpointId());
            run.setLimitsJson(JSON.toJSONString(limits));
            run.setUsageJson(JSON.toJSONString(runUsage(previous)));
            run.setCreatedAt(now);
            runMapper.insert(run);
            context.put("sessionId", sessionId);
            context.put("projectId", thread.getProjectId());
            context.put("requestId", turnRequestId(turn));
            context.put("resumedFromRunId", previous.getRunId());
            // 浏览器刷新后 Manager 会重建，恢复时绑定当前画布并重新读取实时状态。
            if (request.canvasSnapshot() != null) context.put("canvasSnapshot", request.canvasSnapshot());
            turnMapper.update(null, new LambdaUpdateWrapper<AiAgentTurnPO>()
                    .eq(AiAgentTurnPO::getTurnId, turn.getTurnId())
                    .set(AiAgentTurnPO::getStatus, "queued")
                    .set(AiAgentTurnPO::getContextJson, JSON.toJSONString(context))
                    .set(AiAgentTurnPO::getEndedAt, null));
            turn.setStatus("queued");
            turn.setContextJson(JSON.toJSONString(context));
            turn.setEndedAt(null);
            threadMapper.update(null, new LambdaUpdateWrapper<AiAgentThreadPO>()
                    .eq(AiAgentThreadPO::getThreadId, thread.getThreadId())
                    .set(AiAgentThreadPO::getCurrentTurnId, turn.getTurnId())
                    .set(AiAgentThreadPO::getUpdatedAt, now));
            appendEvent(thread.getThreadId(), turn.getTurnId(), run.getRunId(), "turn.resumed", Map.of(
                    "previousRunId", previous.getRunId(), "runId", run.getRunId(), "limits", limits));
            startRuntimeAfterCommit(run.getRunId(), userId(user));
            return taskView(turn, run);
        }
    }

    private static List<String> activeStatuses() {
        return List.of("queued", "running", "verifying", "waiting_input", "waiting_user_input",
                "waiting_frontend_tool", "waiting_user_confirmation");
    }

    private static boolean isActiveStatus(String status) { return activeStatuses().contains(status); }

    private AiAgentCheckpointPO checkpoint(AiAgentRunPO run) {
        return run.getCheckpointId() == null ? null : checkpointMapper.selectById(run.getCheckpointId());
    }

    private boolean recoverable(AiAgentTurnPO turn, AiAgentRunPO run) {
        if (!List.of("interrupted", "budget_exhausted").contains(turn.getStatus())) return false;
        if (run.getCheckpointId() != null) return checkpoint(run) != null;
        // 尚未调用工具的任务可从原始输入恢复；已产生效果的旧任务必须有检查点。
        return eventMapper.selectCount(new LambdaQueryWrapper<AiAgentEventPO>()
                .eq(AiAgentEventPO::getTurnId, turn.getTurnId()).eq(AiAgentEventPO::getEventType, "tool.requested")) == 0;
    }

    private Map<String, Object> runLimits(AiAgentRunPO run) {
        if (run.getLimitsJson() == null) throw new AppException(409, "AI 任务预算格式不受支持");
        Map<String, Object> limits = parseMap(run.getLimitsJson());
        for (String flag : List.of("tokenBudgetEnabled", "callBudgetEnabled", "durationBudgetEnabled")) {
            if (!(limits.get(flag) instanceof Boolean)) throw new AppException(409, "AI 任务预算格式不受支持");
        }
        return limits;
    }

    private Map<String, Object> runUsage(AiAgentRunPO run) {
        if (run.getUsageJson() == null) throw new AppException(409, "AI 任务用量格式不受支持");
        return parseMap(run.getUsageJson());
    }

    private Map<String, Object> visibleUsage(AiAgentRunPO run) {
        return new AiAgentBudget(runLimits(run), runUsage(run)).snapshot();
    }

    /** 会话按 Turn 累加；恢复 Run 已继承本轮用量，只取每轮最新 Run，避免重复计数。 */
    private Map<String, Object> withThreadTokenUsage(String threadId, String turnId, Map<String, Object> currentUsage) {
        Map<String, Object> totals = new LinkedHashMap<>(Map.of("inputTokens", 0L, "outputTokens", 0L, "totalTokens", 0L));
        List<String> otherTurnIds = turnMapper.selectList(new LambdaQueryWrapper<AiAgentTurnPO>()
                        .select(AiAgentTurnPO::getTurnId)
                        .eq(AiAgentTurnPO::getThreadId, threadId)
                        .ne(AiAgentTurnPO::getTurnId, turnId))
                .stream().map(AiAgentTurnPO::getTurnId).toList();
        if (!otherTurnIds.isEmpty()) {
            Map<String, AiAgentRunPO> latestRuns = new LinkedHashMap<>();
            for (AiAgentRunPO run : runMapper.selectList(new LambdaQueryWrapper<AiAgentRunPO>()
                    .select(AiAgentRunPO::getRunId, AiAgentRunPO::getTurnId, AiAgentRunPO::getUsageJson, AiAgentRunPO::getCreatedAt)
                    .in(AiAgentRunPO::getTurnId, otherTurnIds)
                    .orderByDesc(AiAgentRunPO::getCreatedAt).orderByDesc(AiAgentRunPO::getRunId))) {
                latestRuns.putIfAbsent(run.getTurnId(), run);
            }
            for (AiAgentRunPO run : latestRuns.values()) addTokenTotals(totals, runUsage(run));
        }
        // 事件中的当前用量可能比数据库快照更新，始终以本次调用传入的值为准。
        addTokenTotals(totals, currentUsage);
        Map<String, Object> result = new LinkedHashMap<>(currentUsage);
        result.put("threadUsage", totals);
        return result;
    }

    private static void addTokenTotals(Map<String, Object> totals, Map<String, Object> usage) {
        for (String key : List.of("inputTokens", "outputTokens", "cachedInputTokens", "cacheCreationInputTokens")) {
            if (usage.get(key) instanceof Number)
                totals.put(key, AiAgentBudget.number(totals, key) + Math.max(0, AiAgentBudget.number(usage, key)));
        }
        long total = usage.get("totalTokens") instanceof Number ? AiAgentBudget.number(usage, "totalTokens")
                : AiAgentBudget.number(usage, "inputTokens") + AiAgentBudget.number(usage, "outputTokens");
        totals.put("totalTokens", AiAgentBudget.number(totals, "totalTokens") + Math.max(0, total));
    }

    public void saveUsage(AgentExecutionContext context, Map<String, Object> usage) {
        runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId()).in(AiAgentRunPO::getStatus, activeStatuses())
                .set(AiAgentRunPO::getUsageJson, JSON.toJSONString(usage)));
    }

    private List<Map<String, Object>> resolveAttachments(AgentSubmitRequest request) {
        List<Map<String, Object>> attachments = request.normalizedAttachments();
        if (attachments == null || attachments.isEmpty()) {
            return List.of();
        }
        if (attachments.size() > 3) {
            throw new AppException(400, "单次最多提交 3 张图片附件");
        }
        List<String> attachmentIds = attachments.stream()
                .map(attachment -> required(stringValue(attachment.get("attachmentId")), "attachmentId"))
                .distinct()
                .toList();
        if (attachmentIds.size() != attachments.size()) {
            throw new AppException(400, "AI 图片附件不能重复");
        }
        String sessionId = required(request.sessionId(), "sessionId");
        return attachmentService.resolveForCurrentUser(attachmentIds, request.projectId(), sessionId).stream()
                .map(attachment -> {
                    Map<String, Object> value = new LinkedHashMap<>();
                    value.put("attachmentId", attachment.attachmentId());
                    value.put("mimeType", attachment.mimeType());
                    value.put("originalName", attachment.originalName());
                    value.put("sha256", attachment.sha256());
                    value.put("width", attachment.width());
                    value.put("height", attachment.height());
                    value.put("dataUrl", "data:" + attachment.mimeType() + ";base64," + attachment.base64Data());
                    return value;
                })
                .toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public TaskView steer(AgentSteerRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        String turnId = request.normalizedTurnId();
        AiAgentTurnPO turn = requireTurnForCurrentUser(turnId);
        AiAgentThreadPO thread = requireThreadForCurrentUser(turn.getThreadId());
        turn = turnMapper.selectOne(new LambdaQueryWrapper<AiAgentTurnPO>()
                .eq(AiAgentTurnPO::getTurnId, turnId)
                .last("for update"));
        if (turn == null || !Objects.equals(turn.getThreadId(), thread.getThreadId())) {
            throw new AppException(409, "追加要求的 turnId 已发生变化");
        }
        requireScopeValue(request.projectId(), thread.getProjectId(), "projectId");
        requireScopeValue(request.threadId(), thread.getThreadId(), "threadId");
        if (request.runId() != null && !request.runId().isBlank()
                && !requireRunForTurn(turn.getTurnId()).getRunId().equals(request.runId())) {
            throw new AppException(409, "追加要求的 runId 与当前轮次不匹配");
        }
        String text = required(request.normalizedInputText(), "inputText");
        if ("completed".equals(turn.getStatus()) || "failed".equals(turn.getStatus()) || "cancelled".equals(turn.getStatus())) {
            throw new AppException(409, "当前轮次已结束，不能追加要求");
        }
        Map<String, Object> context = parseMap(turn.getContextJson());
        String inputId = trimToNull(request.inputId());
        List<String> steerInputIds = stringList(context.get("steerInputIds"));
        if (inputId != null && (steerInputIds.contains(inputId)
                || Objects.equals(inputId, stringValue(context.get("lastInputId"))))) {
            return taskView(turn, requireRunForTurn(turn.getTurnId()));
        }
        turn.setSteerVersion(turn.getSteerVersion() == null ? 1 : turn.getSteerVersion() + 1);
        turn.setInputText(turn.getInputText() + "\n\n追加要求：" + text);
        if (inputId != null) {
            steerInputIds = new ArrayList<>(steerInputIds);
            steerInputIds.add(inputId);
            if (steerInputIds.size() > 100) {
                steerInputIds = new ArrayList<>(steerInputIds.subList(steerInputIds.size() - 100, steerInputIds.size()));
            }
            context.put("steerInputIds", steerInputIds);
            context.put("lastInputId", inputId);
            turn.setContextJson(JSON.toJSONString(context));
        }
        turnMapper.updateById(turn);
        AiAgentRunPO run = requireRunForTurn(turn.getTurnId());
        boolean resume = "waiting_input".equals(turn.getStatus())
                || "waiting_user_input".equals(turn.getStatus());
        if (resume) {
            run.setStatus("queued");
            run.setCancelRequested(0);
            run.setWorkerId(null);
            run.setLeaseExpiresAt(null);
            runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                    .eq(AiAgentRunPO::getRunId, run.getRunId())
                    .set(AiAgentRunPO::getStatus, "queued")
                    .set(AiAgentRunPO::getCancelRequested, 0)
                    .set(AiAgentRunPO::getWorkerId, null)
                    .set(AiAgentRunPO::getLeaseExpiresAt, null));
            turn.setStatus("queued");
            turnMapper.updateById(turn);
        }
        appendItem(thread, turn, "user_message", Map.of(
                "text", text,
                "steer", true,
                "steerVersion", turn.getSteerVersion()
        ));
        appendEvent(thread.getThreadId(), turn.getTurnId(), run.getRunId(), "turn.steered", Map.of(
                "turnId", turn.getTurnId(),
                "steerVersion", turn.getSteerVersion(),
                "resumed", resume
        ));
        if (resume) {
            startRuntimeAfterCommit(run.getRunId(), userId(currentUser()));
        }
        return taskView(turn, run);
    }

    @Transactional(rollbackFor = Exception.class)
    public TaskView cancel(AgentCancelRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        String id = required(request.runId(), "runId");
        AiAgentRunPO run = runMapper.selectById(id);
        if (run == null && turnMapper.selectById(id) != null) {
            run = requireRunForTurn(id);
        }
        if (run == null) {
            throw new AppException(404, "AI Agent 运行不存在");
        }
        run = runMapper.selectOne(new LambdaQueryWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, run.getRunId())
                .last("for update"));
        if (run == null) {
            throw new AppException(404, "AI Agent 运行不存在");
        }
        AiAgentTurnPO turn = requireTurnForCurrentUser(run.getTurnId());
        AiAgentThreadPO thread = requireThreadForCurrentUser(turn.getThreadId());
        requireScopeValue(request.projectId(), thread.getProjectId(), "projectId");
        requireScopeValue(request.threadId(), thread.getThreadId(), "threadId");
        requireScopeValue(request.turnId(), turn.getTurnId(), "turnId");
        requireScopeValue(request.runId(), run.getRunId(), "runId");
        if (!List.of("completed", "failed", "cancelled").contains(run.getStatus())) {
            run.setCancelRequested(1);
            run.setStatus("cancelled");
            run.setEndedAt(System.currentTimeMillis());
            run.setWorkerId(null);
            run.setLeaseExpiresAt(null);
            runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                    .eq(AiAgentRunPO::getRunId, run.getRunId())
                    .set(AiAgentRunPO::getStatus, "cancelled")
                    .set(AiAgentRunPO::getCancelRequested, 1)
                    .set(AiAgentRunPO::getWorkerId, null)
                    .set(AiAgentRunPO::getLeaseExpiresAt, null)
                    .set(AiAgentRunPO::getEndedAt, run.getEndedAt()));
            turn.setStatus("cancelled");
            turn.setEndedAt(run.getEndedAt());
            turnMapper.updateById(turn);
            closePendingOperations(thread, turn, run, "cancelled", "run_cancelled");
            appendEvent(thread.getThreadId(), turn.getTurnId(), run.getRunId(), "run.cancelled", Map.of("runId", run.getRunId()));
        }
        return taskView(turn, run);
    }

    public TaskView status(AgentStatusRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        AiAgentRunPO run = runMapper.selectById(required(request.runId(), "runId"));
        if (run == null) {
            throw new AppException(404, "AI Agent 运行不存在");
        }
        AiAgentTurnPO turn = requireTurnForCurrentUser(run.getTurnId());
        AiAgentThreadPO thread = requireThreadForCurrentUser(turn.getThreadId());
        requireScopeValue(request.projectId(), thread.getProjectId(), "projectId");
        requireScopeValue(request.threadId(), thread.getThreadId(), "threadId");
        requireScopeValue(request.turnId(), turn.getTurnId(), "turnId");
        return taskView(turn, run);
    }

    public TaskView taskByTurn(String turnId) {
        AiAgentTurnPO turn = requireTurnForCurrentUser(turnId);
        return taskView(turn, requireRunForTurn(turn.getTurnId()));
    }

    @Transactional(rollbackFor = Exception.class)
    public OperationView completeOperation(FrontendOperationCompleteRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        String operationId = required(request.operationId(), "operationId");
        AiAgentOperationPO operation = operationMapper.selectById(operationId);
        if (operation == null) {
            throw new AppException(404, "前端效果操作不存在");
        }
        // 同一批回执先锁运行再锁操作；避免同时完成时双方都看到另一项尚未提交而漏掉恢复。
        runMapper.selectOne(new LambdaQueryWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, operation.getRunId()).last("for update"));
        operation = operationMapper.selectOne(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getOperationId, operationId).last("for update"));
        AiAgentTurnPO turn = requireTurnForCurrentUser(operation.getTurnId());
        AiAgentThreadPO operationThread = requireThreadForCurrentUser(turn.getThreadId());
        requireScopeValue(request.projectId(), operationThread.getProjectId(), "projectId");
        requireScopeValue(request.threadId(), operationThread.getThreadId(), "threadId");
        requireScopeValue(request.turnId(), turn.getTurnId(), "turnId");
        requireScopeValue(request.runId(), operation.getRunId(), "runId");
        Map<String, Object> result = request.result() == null ? new LinkedHashMap<>() : new LinkedHashMap<>(request.result());
        String status = normalizeOperationStatus(request.status());
        if (result.get("failed") instanceof List<?> failures && !failures.isEmpty()) {
            status = "failed";
            boolean partial = Boolean.TRUE.equals(result.get("partial")) || Boolean.TRUE.equals(result.get("partiallyApplied"))
                    || result.get("applied") instanceof List<?> applied && !applied.isEmpty()
                    || result.get("deletedComponentIds") instanceof List<?> deleted && !deleted.isEmpty();
            result.put("partial", partial);
            result.putIfAbsent("code", partial ? "canvas_partial_failure" : "canvas_operation_failed");
            result.putIfAbsent("message", "有 " + failures.size() + " 项画布操作失败" + (partial ? "，已完成项保留在回执中" : ""));
            result.putIfAbsent("fieldPath", "failed");
            result.putIfAbsent("actualValue", AiAgentDebugTrace.redact(failures));
            result.putIfAbsent("actualType", "array");
            result.putIfAbsent("expected", Map.of("maxItems", 0, "rule", "所有请求项均成功，failed 应为空数组"));
            result.putIfAbsent("recovery", "根据 failed 中各项错误修正对应组件；先核对已完成项和当前版本，避免重复执行已生效的操作。");
        }
        if (!"pending".equals(operation.getStatus())) {
            if (!Objects.equals(operation.getStatus(), status)) {
                throw new AppException(409, "前端效果操作已经完成，不能重复提交其他状态");
            }
            return toOperationView(operation);
        }
        long now = System.currentTimeMillis();
        if (AiAgentComponentSpecs.TOOL_NAME.equals(operation.getOperationType())) {
            result = new LinkedHashMap<>(result);
            result.remove(AiAgentComponentSpecs.EVIDENCE_KEY);
            if ("applied".equals(status)) {
                if (componentDocuments != null) componentDocuments.verifyResultIdentities(result, Long.valueOf(operationThread.getUserId()));
                result.put(AiAgentComponentSpecs.EVIDENCE_KEY, AiAgentComponentSpecs.completeEvidence(
                        parseMap(operation.getRequestJson()), result));
            }
        }
        if ("get_component_data_contract".equals(operation.getOperationType()) && "applied".equals(status) && componentDocuments != null)
            result = componentDocuments.verifyDataContractResult(parseMap(operation.getRequestJson()), result, Long.valueOf(operationThread.getUserId()));
        operation.setStatus(status);
        operation.setResultJson(JSON.toJSONString(result, com.alibaba.fastjson2.JSONWriter.Feature.WriteNulls));
        operation.setResultRevision(request.resultRevision());
        operation.setUpdatedAt(now);
        operationMapper.updateById(operation);
        Map<String, Object> completionEvent = new LinkedHashMap<>();
        completionEvent.put("operationId", operationId);
        completionEvent.put("projectId", operation.getProjectId());
        completionEvent.put("operationType", operation.getOperationType());
        completionEvent.put("status", status);
        completionEvent.put("result", result);
        completionEvent.put("resultRevision", request.resultRevision() == null ? "" : request.resultRevision());
        String toolCallId = stringValue(parseMap(operation.getRequestJson()).get("toolCallId"));
        if (toolCallId != null) {
            completionEvent.put("toolCallId", toolCallId);
        }
        try {
            appendEvent(operation.getThreadId(), turn.getTurnId(), operation.getRunId(), "frontend.effect.completed", completionEvent);
        } catch (EventSequenceConflictException error) {
            Map<String, Object> failure = Map.of(
                    "code", "ai_agent_event_sequence_conflict",
                    "message", error.getMsg()
            );
            operation.setStatus("failed");
            operation.setResultJson(JSON.toJSONString(failure));
            operation.setUpdatedAt(System.currentTimeMillis());
            operationMapper.updateById(operation);
            log.error("AI Agent frontend operation was recorded as failed after event sequence conflict: operationId={}, threadId={}",
                    operationId, operation.getThreadId());
            return toOperationView(operation);
        }
        if (!"cancelled".equals(status)) {
            resumeFrontendBatchIfComplete(operationThread, turn, operation.getRunId());
        }
        return toOperationView(operation);
    }

    public AgentExecutionContext executionContext(String runId, String userId) {
        AiAgentRunPO run = runMapper.selectById(required(runId, "runId"));
        if (run == null) {
            throw new AppException(404, "AI Agent 运行不存在");
        }
        AiAgentTurnPO turn = turnMapper.selectById(run.getTurnId());
        AiAgentThreadPO thread = turn == null ? null : threadMapper.selectById(turn.getThreadId());
        if (turn == null || thread == null || !Objects.equals(thread.getUserId(), userId)) {
            throw new AppException(403, "无权执行该 AI Agent 运行");
        }
        Map<String, Object> context = parseMap(turn.getContextJson());
        context.put("consumedSteerVersion", run.getConsumedSteerVersion() == null ? 0 : run.getConsumedSteerVersion());
        Map<String, Object> limits = runLimits(run);
        if (run.getLimitsJson() == null) {
            runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                    .eq(AiAgentRunPO::getRunId, runId).isNull(AiAgentRunPO::getLimitsJson)
                    .set(AiAgentRunPO::getLimitsJson, JSON.toJSONString(limits)));
        }
        context.put("executionLimits", limits);
        context.put("executionUsage", runUsage(run));
        Map<String, Object> selection = mapValue(context.get("selection"));
        Map<String, Object> canvasSnapshot = mapValue(context.get("canvasSnapshot"));
        AiAgentCheckpointPO checkpoint = run.getCheckpointId() == null
                ? null
                : checkpointMapper.selectById(run.getCheckpointId());
        String resumeMessage = checkpoint == null ? null : frontendBatchResumeMessage(run.getRunId(), context);
        context.put("checkpointVersion", checkpoint == null || checkpoint.getRevision() == null ? 0L : checkpoint.getRevision());
        if (context.get("resumedFromRunId") instanceof String && run.getStartedAt() == null) {
            List<AiAgentOperationPO> operations = operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                    .eq(AiAgentOperationPO::getTurnId, turn.getTurnId()).orderByAsc(AiAgentOperationPO::getCreatedAt));
            resumeMessage = "用户已明确恢复此任务。当前 runId=" + runId
                    + "。继续之前先读取当前画布和工作区，核对已完成效果，勿重复写入；未完成的工具调用需重新规划。前序操作真实结果："
                    + JSON.toJSONString(operations.stream().map(this::toOperationView).toList());
        }
        return new AgentExecutionContext(
                thread.getThreadId(),
                thread.getProjectId(),
                turn.getTurnId(),
                run.getRunId(),
                userId,
                turn.getInputText(),
                context,
                selection,
                canvasSnapshot,
                checkpoint == null ? null : checkpoint.getStateJson(),
                resumeMessage,
                turn.getSteerVersion() == null ? 0 : turn.getSteerVersion()
        );
    }

    public List<HistoryMessage> conversationHistory(AgentExecutionContext context, int limit) {
        var query = new LambdaQueryWrapper<AiAgentItemPO>()
                .eq(AiAgentItemPO::getThreadId, context.threadId())
                .ne(AiAgentItemPO::getTurnId, context.turnId())
                .in(AiAgentItemPO::getItemType, List.of("user_message", "assistant_message"))
                .orderByDesc(AiAgentItemPO::getCreatedAt)
                .orderByDesc(AiAgentItemPO::getSequenceNo);
        if (limit > 0) query.last("limit " + limit);
        List<AiAgentItemPO> items = itemMapper.selectList(query);
        Collections.reverse(items);
        return items.stream()
                .map(item -> {
                    String text = stringValue(parseMap(item.getContentJson()).get("text"));
                    if (text == null || text.isBlank()) {
                        return null;
                    }
                    return new HistoryMessage(
                            "user_message".equals(item.getItemType()) ? "user" : "assistant",
                            text
                    );
                })
                .filter(Objects::nonNull)
                .toList();
    }

    /** 新任务沿用上一任务的完整上下文（或整体摘要），不再按消息条数截断。 */
    public List<ChatMessage> conversationContext(AgentExecutionContext context) {
        List<AiAgentTurnPO> turns = turnMapper.selectList(new LambdaQueryWrapper<AiAgentTurnPO>()
                .eq(AiAgentTurnPO::getThreadId, context.threadId())
                .ne(AiAgentTurnPO::getTurnId, context.turnId())
                .orderByAsc(AiAgentTurnPO::getCreatedAt));
        List<ChatMessage> messages = new ArrayList<>();
        if (!turns.isEmpty()) {
            AiAgentRunPO previous = runMapper.selectOne(new LambdaQueryWrapper<AiAgentRunPO>()
                    .in(AiAgentRunPO::getTurnId, turns.stream().map(AiAgentTurnPO::getTurnId).toList())
                    .isNotNull(AiAgentRunPO::getCheckpointId)
                    .orderByDesc(AiAgentRunPO::getCreatedAt).last("limit 1"));
            AiAgentCheckpointPO checkpoint = previous == null ? null : checkpointMapper.selectById(previous.getCheckpointId());
            if (checkpoint != null && checkpoint.getStateJson() != null && !checkpoint.getStateJson().isBlank()) {
                List<ChatMessage> saved = new JacksonChatMessageJsonCodec().messagesFromJson(checkpoint.getStateJson());
                if (saved.stream().noneMatch(message -> message instanceof SystemMessage system
                        && system.text().contains(AiAgentContextHistory.FULL_HISTORY_MARKER)))
                    throw new AppException(409, "AI 任务检查点格式不受支持");
                messages.addAll(saved.stream()
                        .filter(message -> !(message instanceof SystemMessage)).toList());
                int covered = 0;
                while (covered < turns.size() && !turns.get(covered).getTurnId().equals(previous.getTurnId())) covered++;
                List<String> laterTurns = turns.subList(Math.min(covered + 1, turns.size()), turns.size()).stream()
                        .map(AiAgentTurnPO::getTurnId).toList();
                if (!laterTurns.isEmpty()) {
                    List<AiAgentItemPO> laterItems = itemMapper.selectList(new LambdaQueryWrapper<AiAgentItemPO>()
                            .eq(AiAgentItemPO::getThreadId, context.threadId()).in(AiAgentItemPO::getTurnId, laterTurns)
                            .in(AiAgentItemPO::getItemType, List.of("user_message", "assistant_message"))
                            .orderByAsc(AiAgentItemPO::getCreatedAt).orderByAsc(AiAgentItemPO::getSequenceNo));
                    for (AiAgentItemPO item : laterItems) {
                        String text = stringValue(parseMap(item.getContentJson()).get("text"));
                        if (text != null && !text.isBlank()) messages.add("assistant_message".equals(item.getItemType())
                                ? AiMessage.from(text) : UserMessage.from(text));
                    }
                }
                return AiAgentContextHistory.normalize(messages);
            }
        }
        for (HistoryMessage message : conversationHistory(context, 0))
            messages.add("assistant".equals(message.role()) ? AiMessage.from(message.text()) : UserMessage.from(message.text()));
        return messages;
    }

    public List<Map<String, Object>> inputAttachments(AgentExecutionContext context) {
        AiAgentTurnPO turn = turnMapper.selectById(context.turnId());
        if (turn == null || turn.getInputAttachments() == null || turn.getInputAttachments().isBlank()) {
            return List.of();
        }
        List<Map> values = JSON.parseArray(turn.getInputAttachments(), Map.class);
        if (values == null) {
            return List.of();
        }
        return values.stream().map(this::mapValue).toList();
    }

    public List<SteerMessage> steerMessagesAfter(AgentExecutionContext context, long consumedVersion) {
        return itemMapper.selectList(new LambdaQueryWrapper<AiAgentItemPO>()
                        .eq(AiAgentItemPO::getTurnId, context.turnId())
                        .eq(AiAgentItemPO::getItemType, "user_message")
                        .orderByAsc(AiAgentItemPO::getSequenceNo))
                .stream()
                .map(item -> parseMap(item.getContentJson()))
                .filter(payload -> Boolean.TRUE.equals(payload.get("steer")))
                .map(payload -> new SteerMessage(
                        numberValue(payload.get("steerVersion")),
                        stringValue(payload.get("text"))
                ))
                .filter(message -> message.version() > consumedVersion
                        && message.text() != null && !message.text().isBlank())
                .toList();
    }

    public void markSteersConsumed(AgentExecutionContext context, long consumedVersion) {
        runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId())
                .lt(AiAgentRunPO::getConsumedSteerVersion, consumedVersion)
                .set(AiAgentRunPO::getConsumedSteerVersion, consumedVersion));
    }

    private String resumeMessage(AiAgentOperationPO operation) {
        String resultJson = operation.getResultJson();
        String operationResult = resultJson == null || resultJson.isBlank() ? "{}" : resultJson;
        String status = operation.getStatus();
        if ("applied".equals(status)) {
            return "前端画布操作已完成：operationId=" + operation.getOperationId()
                    + "，operationType=" + operation.getOperationType()
                    + "，真实返回结果=" + operationResult
                    + "。请不要重复调用该 operationId，必须依据真实返回结果继续执行后续步骤；如无后续步骤，直接返回完成说明。";
        }
        if ("rejected".equals(status)) {
            return "用户未确认前端画布操作：operationId=" + operation.getOperationId()
                    + "，真实返回结果=" + operationResult
                    + "。请不要重复调用该 operationId，根据真实返回结果调整方案或等待用户追加要求。";
        }
        return "前端画布操作未生效：operationId=" + operation.getOperationId()
                + "，operationType=" + operation.getOperationType()
                + "，状态=" + status + "，真实错误结果=" + operationResult
                + "。请不要重复调用该 operationId，必须先处理这个错误。";
    }

    private void resumeFrontendBatchIfComplete(AiAgentThreadPO thread, AiAgentTurnPO turn, String runId) {
        AiAgentRunPO run = runMapper.selectOne(new LambdaQueryWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, runId).last("for update"));
        if (run == null || !List.of("waiting_frontend_tool", "waiting_user_confirmation").contains(run.getStatus())) {
            return;
        }
        // 回执可能在等待登记前开始事务，不能用旧读取对象中的上一批/空操作列表恢复。
        turn = turnMapper.selectOne(new LambdaQueryWrapper<AiAgentTurnPO>()
                .eq(AiAgentTurnPO::getTurnId, run.getTurnId()).last("for update"));
        if (turn == null) return;
        Map<String, Object> turnContext = parseMap(turn.getContextJson());
        List<String> operationIds = stringList(turnContext.get(WAITING_FRONTEND_OPERATION_IDS));
        if (!operationIds.isEmpty() && !frontendBatchCompleted(runId, operationIds)) {
            return;
        }
        int resumed = runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, runId)
                .in(AiAgentRunPO::getStatus, List.of("waiting_frontend_tool", "waiting_user_confirmation"))
                .set(AiAgentRunPO::getStatus, "queued")
                .set(AiAgentRunPO::getCancelRequested, 0)
                .set(AiAgentRunPO::getWorkerId, null)
                .set(AiAgentRunPO::getLeaseExpiresAt, null));
        if (resumed == 0) {
            return;
        }
        turn.setStatus("queued");
        turnMapper.updateById(turn);
        appendEvent(thread.getThreadId(), turn.getTurnId(), runId, "turn.resumed", Map.of(
                "turnId", turn.getTurnId(),
                "runId", runId,
                "status", "running",
                "operationIds", operationIds
        ));
        startRuntimeAfterCommit(runId, thread.getUserId());
    }

    private boolean frontendBatchCompleted(String runId, List<String> operationIds) {
        List<AiAgentOperationPO> operations = operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getRunId, runId)
                .in(AiAgentOperationPO::getOperationId, operationIds).last("for update"));
        return allFrontendOperationsCompleted(operationIds, operations);
    }

    static boolean allFrontendOperationsCompleted(List<String> operationIds, List<AiAgentOperationPO> operations) {
        if (operationIds.isEmpty()) {
            return false;
        }
        Map<String, AiAgentOperationPO> operationsById = new LinkedHashMap<>();
        operations.forEach(operation -> operationsById.put(operation.getOperationId(), operation));
        return operationIds.stream().allMatch(operationId -> {
            AiAgentOperationPO operation = operationsById.get(operationId);
            return operation != null && !"pending".equals(operation.getStatus());
        });
    }

    private String frontendBatchResumeMessage(String runId, Map<String, Object> turnContext) {
        List<String> operationIds = stringList(turnContext.get(WAITING_FRONTEND_OPERATION_IDS));
        if (operationIds.isEmpty()) {
            AiAgentOperationPO completedOperation = operationMapper.selectOne(new LambdaQueryWrapper<AiAgentOperationPO>()
                    .eq(AiAgentOperationPO::getRunId, runId)
                    .ne(AiAgentOperationPO::getStatus, "pending")
                    .orderByDesc(AiAgentOperationPO::getUpdatedAt)
                    .last("limit 1"));
            return completedOperation == null ? null : resumeMessage(completedOperation);
        }
        Map<String, AiAgentOperationPO> operationsById = new LinkedHashMap<>();
        operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                        .eq(AiAgentOperationPO::getRunId, runId)
                        .in(AiAgentOperationPO::getOperationId, operationIds))
                .forEach(operation -> operationsById.put(operation.getOperationId(), operation));
        List<String> messages = operationIds.stream()
                .map(operationsById::get)
                .filter(Objects::nonNull)
                .filter(operation -> !frontendBatchTimedOut(operation))
                .map(this::resumeMessage)
                .toList();
        return messages.isEmpty() ? null : String.join("\n\n", messages);
    }

    private boolean frontendBatchTimedOut(AiAgentOperationPO operation) {
        return "frontend_batch_timeout".equals(stringValue(parseMap(operation.getResultJson()).get("code")));
    }

    public boolean isCancelRequested(String runId) {
        AiAgentRunPO run = runMapper.selectById(runId);
        return run == null || Integer.valueOf(1).equals(run.getCancelRequested())
                || List.of("cancelled", "completed", "failed", "interrupted", "budget_exhausted").contains(run.getStatus());
    }

    @Scheduled(fixedDelay = 5_000L, initialDelay = 5_000L)
    @Transactional(rollbackFor = Exception.class)
    public void expireFrontendBatches() {
        long now = System.currentTimeMillis();
        List<AiAgentRunPO> waitingRuns = runMapper.selectList(new LambdaQueryWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getStatus, "waiting_frontend_tool"));
        for (AiAgentRunPO run : waitingRuns) {
            run = runMapper.selectOne(new LambdaQueryWrapper<AiAgentRunPO>()
                    .eq(AiAgentRunPO::getRunId, run.getRunId()).last("for update"));
            if (run == null || !"waiting_frontend_tool".equals(run.getStatus())) continue;
            AiAgentTurnPO turn = turnMapper.selectOne(new LambdaQueryWrapper<AiAgentTurnPO>()
                    .eq(AiAgentTurnPO::getTurnId, run.getTurnId()).last("for update"));
            if (turn == null) {
                continue;
            }
            Map<String, Object> turnContext = parseMap(turn.getContextJson());
            long deadlineAt = numberValue(turnContext.get(WAITING_FRONTEND_DEADLINE_AT));
            List<String> operationIds = stringList(turnContext.get(WAITING_FRONTEND_OPERATION_IDS));
            if (operationIds.isEmpty()) {
                continue;
            }
            AiAgentThreadPO thread = threadMapper.selectById(turn.getThreadId());
            if (thread == null) {
                continue;
            }
            if (frontendBatchCompleted(run.getRunId(), operationIds)) {
                resumeFrontendBatchIfComplete(thread, turn, run.getRunId());
                continue;
            }
            if (deadlineAt == 0L || deadlineAt > now) {
                continue;
            }
            List<AiAgentOperationPO> pendingOperations = operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                    .eq(AiAgentOperationPO::getRunId, run.getRunId())
                    .in(AiAgentOperationPO::getOperationId, operationIds)
                    .eq(AiAgentOperationPO::getStatus, "pending"));
            for (AiAgentOperationPO operation : pendingOperations) {
                Map<String, Object> result = Map.of(
                        "code", "frontend_batch_timeout",
                        "message", "前端操作在批次超时时间内未返回，结果已丢弃"
                );
                int expired = operationMapper.update(null, new LambdaUpdateWrapper<AiAgentOperationPO>()
                        .eq(AiAgentOperationPO::getOperationId, operation.getOperationId())
                        .eq(AiAgentOperationPO::getStatus, "pending")
                        .set(AiAgentOperationPO::getStatus, "failed")
                        .set(AiAgentOperationPO::getResultJson, JSON.toJSONString(result, com.alibaba.fastjson2.JSONWriter.Feature.WriteNulls))
                        .set(AiAgentOperationPO::getUpdatedAt, now));
                if (expired == 0) {
                    continue;
                }
                log.warn("AI Agent frontend batch timed out: runId={}, operationId={}, operationType={}",
                        run.getRunId(), operation.getOperationId(), operation.getOperationType());
                appendEvent(thread.getThreadId(), turn.getTurnId(), run.getRunId(), "frontend.effect.completed", Map.of(
                        "operationId", operation.getOperationId(),
                        "projectId", operation.getProjectId(),
                        "operationType", operation.getOperationType(),
                        "status", "failed",
                        "result", result,
                        "resultRevision", ""
                ));
            }
            resumeFrontendBatchIfComplete(thread, turn, run.getRunId());
        }
    }

    @Scheduled(fixedDelay = 60_000L, initialDelay = 60_000L)
    @Transactional(rollbackFor = Exception.class)
    public void recoverInterruptedRuns() {
        List<AiAgentRunPO> activeRuns = runMapper.selectList(new LambdaQueryWrapper<AiAgentRunPO>()
                .in(AiAgentRunPO::getStatus, List.of("queued", "running", "verifying")));
        long now = System.currentTimeMillis();
        long queuedCutoff = now - 5 * 60_000L;
        for (AiAgentRunPO run : activeRuns) {
            Long activeSince = run.getStartedAt() == null ? run.getCreatedAt() : run.getStartedAt();
            boolean stale = "queued".equals(run.getStatus())
                    ? run.getCreatedAt() != null && run.getCreatedAt() < queuedCutoff
                    : run.getLeaseExpiresAt() != null
                    ? run.getLeaseExpiresAt() < now
                    : activeSince != null && activeSince < queuedCutoff;
            if (!stale) {
                continue;
            }
            LambdaUpdateWrapper<AiAgentRunPO> recovery = new LambdaUpdateWrapper<AiAgentRunPO>()
                    .eq(AiAgentRunPO::getRunId, run.getRunId())
                    .eq(AiAgentRunPO::getStatus, run.getStatus());
            if ("queued".equals(run.getStatus())) {
                recovery.lt(AiAgentRunPO::getCreatedAt, queuedCutoff);
            } else if (run.getLeaseExpiresAt() != null) {
                recovery.lt(AiAgentRunPO::getLeaseExpiresAt, now);
            } else {
                recovery.isNull(AiAgentRunPO::getLeaseExpiresAt);
                if (run.getStartedAt() == null) {
                    recovery.lt(AiAgentRunPO::getCreatedAt, queuedCutoff);
                } else {
                    recovery.lt(AiAgentRunPO::getStartedAt, queuedCutoff);
                }
            }
            int recovered = runMapper.update(null, recovery
                    .set(AiAgentRunPO::getStatus, "interrupted")
                    .set(AiAgentRunPO::getWorkerId, null)
                    .set(AiAgentRunPO::getLeaseExpiresAt, null)
                    .set(AiAgentRunPO::getEndedAt, now));
            if (recovered == 0) {
                continue;
            }
            run.setStatus("interrupted");
            run.setEndedAt(now);
            AiAgentTurnPO turn = turnMapper.selectById(run.getTurnId());
            if (turn == null || List.of("completed", "failed", "cancelled", "interrupted").contains(turn.getStatus())) {
                continue;
            }
            turn.setStatus("interrupted");
            turn.setEndedAt(now);
            turnMapper.updateById(turn);
            AiAgentThreadPO thread = threadMapper.selectById(turn.getThreadId());
            if (thread != null) {
                closePendingOperations(thread, turn, run, "cancelled", "server_restart");
            }
            appendEvent(turn.getThreadId(), turn.getTurnId(), run.getRunId(), "run.interrupted", Map.of(
                    "runId", run.getRunId(),
                    "reason", "server_restart"
            ));
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean claimRun(AgentExecutionContext context, String workerId, long leaseMillis) {
        long now = System.currentTimeMillis();
        int updated = runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId())
                .eq(AiAgentRunPO::getStatus, "queued")
                .and(wrapper -> wrapper.isNull(AiAgentRunPO::getLeaseExpiresAt)
                        .or().lt(AiAgentRunPO::getLeaseExpiresAt, now))
                .set(AiAgentRunPO::getStatus, "running")
                .set(AiAgentRunPO::getWorkerId, workerId)
                .set(AiAgentRunPO::getLeaseExpiresAt, now + leaseMillis)
                .set(AiAgentRunPO::getStartedAt, now));
        if (updated == 0) {
            return false;
        }
        turnMapper.update(null, new LambdaUpdateWrapper<AiAgentTurnPO>()
                .eq(AiAgentTurnPO::getTurnId, context.turnId())
                .set(AiAgentTurnPO::getStatus, "running")
                .set(AiAgentTurnPO::getStartedAt, now));
        appendEvent(context.threadId(), context.turnId(), context.runId(), "agent.started", Map.of("runId", context.runId()));
        return true;
    }

    public void renewRunLease(AgentExecutionContext context, String workerId, long leaseMillis) {
        int updated = runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId())
                .eq(AiAgentRunPO::getWorkerId, workerId)
                .in(AiAgentRunPO::getStatus, List.of("running", "verifying"))
                .set(AiAgentRunPO::getLeaseExpiresAt, System.currentTimeMillis() + leaseMillis));
        if (updated == 0 && !isCancelRequested(context.runId())) {
            throw new IllegalStateException("AI Agent 运行租约已失效");
        }
    }

    private void closePendingOperations(AiAgentThreadPO thread, AiAgentTurnPO turn, AiAgentRunPO run,
                                        String status, String reason) {
        List<AiAgentOperationPO> pending = operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getRunId, run.getRunId())
                .eq(AiAgentOperationPO::getStatus, "pending"));
        long now = System.currentTimeMillis();
        for (AiAgentOperationPO operation : pending) {
            Map<String, Object> result = Map.of("code", reason, "message", "Agent 运行已结束，前端操作未执行");
            operation.setStatus(status);
            operation.setResultJson(JSON.toJSONString(result, com.alibaba.fastjson2.JSONWriter.Feature.WriteNulls));
            operation.setUpdatedAt(now);
            operationMapper.updateById(operation);
            appendEvent(thread.getThreadId(), turn.getTurnId(), run.getRunId(), "frontend.effect.completed", Map.of(
                    "operationId", operation.getOperationId(),
                    "projectId", operation.getProjectId(),
                    "operationType", operation.getOperationType(),
                    "status", status,
                    "result", result,
                    "resultRevision", ""
            ));
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void markRunVerifying(AgentExecutionContext context) {
        runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId())
                .set(AiAgentRunPO::getStatus, "verifying"));
        turnMapper.update(null, new LambdaUpdateWrapper<AiAgentTurnPO>()
                .eq(AiAgentTurnPO::getTurnId, context.turnId())
                .set(AiAgentTurnPO::getStatus, "verifying"));
        appendEvent(context.threadId(), context.turnId(), context.runId(), "turn.verifying", Map.of("runId", context.runId()));
    }

    public List<String> declareCompletionRequirements(AgentExecutionContext context, List<String> requestedEffects) {
        AiAgentItemPO previousPlan = itemMapper.selectOne(new LambdaQueryWrapper<AiAgentItemPO>()
                .eq(AiAgentItemPO::getTurnId, context.turnId())
                .eq(AiAgentItemPO::getItemType, "plan")
                .orderByDesc(AiAgentItemPO::getSequenceNo)
                .last("limit 1"));
        List<String> previousEffects = previousPlan == null
                ? List.of()
                : completionRequirements(parseMap(previousPlan.getContentJson()));
        long appliedCanvasWrites = operationMapper.selectCount(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getTurnId, context.turnId())
                .eq(AiAgentOperationPO::getStatus, "applied")
                .in(AiAgentOperationPO::getOperationType, List.of(
                        "create_canvas_components", "render_draft", "patch_canvas_components",
                        "delete_canvas_components"
                )));
        boolean forcePatch = "style".equals(shortcutCommand(context)) || "data".equals(shortcutCommand(context));
        return mergeCompletionRequirements(requestedEffects, previousEffects, appliedCanvasWrites > 0, forcePatch);
    }

    static List<String> mergeCompletionRequirements(List<String> requestedEffects,
                                                    List<String> previousEffects,
                                                    boolean canvasWriteStarted,
                                                    boolean forcePatch) {
        List<String> previous = previousEffects == null ? List.of() : previousEffects;
        // 仅更新进度时继续保留已声明条件；显式空数组仍可在首次写入前纠正条件。
        List<String> requested = requestedEffects == null ? previous : requestedEffects;
        List<String> allowed = List.of("createComponents", "patchComponents", "deleteComponents");
        List<String> combined = new ArrayList<>();
        if (canvasWriteStarted) {
            combined.addAll(previous);
        }
        if (forcePatch) {
            combined.add("patchComponents");
        }
        combined.addAll(requested);
        return allowed.stream().filter(combined::contains).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public CompletionCheck checkCompletion(AgentExecutionContext context) {
        AiAgentItemPO planItem = itemMapper.selectOne(new LambdaQueryWrapper<AiAgentItemPO>()
                .eq(AiAgentItemPO::getTurnId, context.turnId())
                .eq(AiAgentItemPO::getItemType, "plan")
                .orderByDesc(AiAgentItemPO::getSequenceNo)
                .last("limit 1"));
        Map<String, Object> plan = planItem == null ? Map.of() : parseMap(planItem.getContentJson());
        Map<String, Object> requirements = mapValue(plan.get("completionRequirements"));
        boolean requirementsDeclared = requirements.get("requiredCanvasEffects") instanceof List<?>;
        List<String> requiredEffects = completionRequirements(plan);
        if (("style".equals(shortcutCommand(context)) || "data".equals(shortcutCommand(context)))
                && !requiredEffects.contains("patchComponents")) {
            requiredEffects = new ArrayList<>(requiredEffects);
            requiredEffects.add("patchComponents");
        }
        long pending = operationMapper.selectCount(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getRunId, context.runId())
                .eq(AiAgentOperationPO::getStatus, "pending"));
        if (pending > 0) {
            return new CompletionCheck(false, "仍有前端画布操作尚未完成");
        }
        List<AiAgentOperationPO> appliedOperations = operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getTurnId, context.turnId())
                .eq(AiAgentOperationPO::getStatus, "applied"));
        List<String> appliedEffects = appliedOperations.stream()
                .map(this::canvasEffect)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        List<AiAgentOperationPO> turnOperations = operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getTurnId, context.turnId())
                .in(AiAgentOperationPO::getOperationType, List.of("render_draft", "discard_canvas_draft")));
        List<AiAgentOperationPO> orderedDraftOperations = orderedDraftOperations(context, turnOperations);
        boolean draftPreviewCancelled = hasTerminalCancelledDraftPreview(orderedDraftOperations);
        List<String> cancelledEffects = draftPreviewCancelled && !appliedEffects.contains("createComponents")
                ? List.of("createComponents") : List.of();
        List<String> missingEffects = requiredEffects.stream()
                .filter(effect -> !appliedEffects.contains(effect) && !cancelledEffects.contains(effect))
                .toList();
        List<String> unacceptedDraftIds = unacceptedDraftIds(orderedDraftOperations);
        if (!unacceptedDraftIds.isEmpty()) {
            Map<String, Object> check = new LinkedHashMap<>();
            check.put("status", "waiting");
            check.put("requirementsDeclared", requirementsDeclared);
            check.put("requiredCanvasEffects", requiredEffects);
            check.put("appliedCanvasEffects", appliedEffects);
            check.put("missingRequiredCanvasEffects", missingEffects);
            check.put("unacceptedDraftIds", unacceptedDraftIds);
            check.put("cancelledCanvasEffects", cancelledEffects);
            appendEvent(context.threadId(), context.turnId(), context.runId(),
                    "agent.completion.fact_check", Map.of("check", check));
            return new CompletionCheck(false, "存在尚未统一预览确认的画布草稿："
                    + String.join(", ", unacceptedDraftIds)
                    + "。请调用 render_draft action=preview 确认全部区域后再结束。");
        }
        boolean passed = missingEffects.isEmpty();
        Map<String, Object> check = new LinkedHashMap<>();
        check.put("status", passed ? "passed" : "waiting");
        check.put("requirementsDeclared", requirementsDeclared);
        check.put("requiredCanvasEffects", requiredEffects);
        check.put("appliedCanvasEffects", appliedEffects);
        check.put("missingRequiredCanvasEffects", missingEffects);
        check.put("cancelledCanvasEffects", cancelledEffects);
        appendEvent(context.threadId(), context.turnId(), context.runId(),
                "agent.completion.fact_check", Map.of("check", check));
        return new CompletionCheck(passed, passed ? "任务完成事实校验通过"
                : "尚缺少已生效的画布动作：" + String.join(", ", missingEffects));
    }

    private List<String> completionRequirements(Map<String, Object> plan) {
        Map<String, Object> requirements = mapValue(plan.get("completionRequirements"));
        Object value = requirements.get("requiredCanvasEffects");
        if (!(value instanceof List<?> effects)) {
            return List.of();
        }
        return effects.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .filter(effect -> List.of("createComponents", "patchComponents", "deleteComponents").contains(effect))
                .distinct()
                .toList();
    }

    private String canvasEffect(AiAgentOperationPO operation) {
        String type = operation.getOperationType();
        if ("render_draft".equals(type)) {
            Map<String, Object> result = parseMap(operation.getResultJson());
            Map<String, Object> request = parseMap(operation.getRequestJson());
            String action = stringValue(request.get("action"));
            if ("preview".equals(action) || "accept".equals(action)) {
                Object bindings = result.get("componentBindings");
                return Boolean.TRUE.equals(result.get("confirmed"))
                        && bindings instanceof Map<?, ?> map && !map.isEmpty()
                        ? "createComponents" : null;
            }
            // 分区草稿只改变临时预览，layerCount 不代表已创建正式组件。
            if ("draft-rendered".equals(result.get("status"))
                    || isDraftCleanupAction(action)
                    || Boolean.FALSE.equals(request.get("interactive"))) return null;
            Object bindings = result.get("componentBindings");
            return "render".equals(action)
                    && Boolean.TRUE.equals(result.get("confirmed"))
                    && bindings instanceof Map<?, ?> confirmedBindings && !confirmedBindings.isEmpty()
                    ? "createComponents" : null;
        }
        if ("create_canvas_components".equals(type)) {
            Map<String, Object> result = parseMap(operation.getResultJson());
            Object bindings = result.get("componentBindings");
            long layerCount = numberValue(result.get("layerCount"));
            return (bindings instanceof Map<?, ?> map && !map.isEmpty()) || layerCount > 0
                    ? "createComponents" : null;
        }
        if ("patch_canvas_components".equals(type)) {
            return "patchComponents";
        }
        return "delete_canvas_components".equals(type) ? "deleteComponents" : null;
    }

    private List<String> unacceptedDraftIds(List<AiAgentOperationPO> operations) {
        Map<String, DraftRevisionState> drafts = new LinkedHashMap<>();
        for (AiAgentOperationPO operation : operations) {
            Map<String, Object> request = parseMap(operation.getRequestJson());
            Map<String, Object> result = parseMap(operation.getResultJson());
            String action = stringValue(request.get("action"));
            String requestDraftId = stringValue(request.get("draftId"));
            String resultDraftId = stringValue(result.get("draftId"));
            String draftId = resultDraftId == null ? requestDraftId : resultDraftId;
            if ("applied".equals(operation.getStatus()) && "draft-rendered".equals(result.get("status"))) {
                if (draftId == null) throw new AppException(409, "草稿回执缺少草稿标识");
                drafts.computeIfAbsent(draftId, ignored -> new DraftRevisionState())
                        .rendered(nullableLong(result.get("revision")));
            } else if ("applied".equals(operation.getStatus())
                    && ("preview".equals(action) || "accept".equals(action))
                    && Boolean.TRUE.equals(result.get("confirmed"))
                    && result.get("componentBindings") instanceof Map<?, ?> bindings && !bindings.isEmpty()) {
                Long revision = nullableLong(request.get("expectedDraftRevision"));
                if (revision == null) revision = nullableLong(result.get("revision"));
                Long acceptedRevision = revision;
                if (draftId == null) throw new AppException(409, "草稿确认回执缺少草稿标识");
                drafts.computeIfAbsent(draftId, ignored -> new DraftRevisionState()).accepted(acceptedRevision);
            } else if (isCancelledDraftPreview(operation)) {
                if (draftId == null) throw new AppException(409, "草稿取消回执缺少草稿标识");
                drafts.remove(draftId);
            } else if ("applied".equals(operation.getStatus())
                    && (isDraftCleanupAction(action) || "discard_canvas_draft".equals(operation.getOperationType()))) {
                String clearedDraftId = stringValue(result.get("draftId"));
                if (clearedDraftId == null) clearedDraftId = draftId;
                Long clearedRevision = nullableLong(result.get("revision"));
                if (clearedDraftId == null) {
                    if (Boolean.FALSE.equals(result.get("cleared"))) drafts.clear();
                    else throw new AppException(409, "草稿清理回执缺少草稿标识");
                } else {
                    DraftRevisionState state = drafts.get(clearedDraftId);
                    if (state != null && (clearedRevision == null || !state.renderedAfter(clearedRevision))) {
                        drafts.remove(clearedDraftId);
                    }
                }
            }
        }
        return drafts.entrySet().stream().filter(entry -> entry.getValue().unaccepted())
                .map(Map.Entry::getKey).toList();
    }

    private boolean hasTerminalCancelledDraftPreview(List<AiAgentOperationPO> operations) {
        boolean cancelled = false;
        for (AiAgentOperationPO operation : operations) {
            Map<String, Object> request = parseMap(operation.getRequestJson());
            Object action = request.get("action");
            if ("render_draft".equals(operation.getOperationType()) && "render".equals(action)) cancelled = false;
            if (isCancelledDraftPreview(operation)) cancelled = true;
        }
        return cancelled;
    }

    private List<AiAgentOperationPO> orderedDraftOperations(AgentExecutionContext context, List<AiAgentOperationPO> operations) {
        String turnId = context.turnId();
        String threadId = context.threadId();
        Map<String, Long> operationSequences = new LinkedHashMap<>();
        if (turnId != null && threadId != null) {
            eventMapper.selectList(new LambdaQueryWrapper<AiAgentEventPO>()
                            .eq(AiAgentEventPO::getThreadId, threadId)
                            .eq(AiAgentEventPO::getTurnId, turnId)
                            .eq(AiAgentEventPO::getEventType, "frontend.effect.requested")
                            .orderByAsc(AiAgentEventPO::getSequenceNo))
                    .forEach(event -> {
                        String operationId = stringValue(parseMap(event.getPayloadJson()).get("operationId"));
                        if (operationId != null) operationSequences.putIfAbsent(operationId, numberValue(event.getSequenceNo()));
                    });
        }
        return operations.stream().sorted(Comparator
                .comparing((AiAgentOperationPO operation) -> operationSequences.get(operation.getOperationId()),
                        Comparator.nullsLast(Long::compareTo))
                .thenComparing(AiAgentOperationPO::getCreatedAt, Comparator.nullsLast(Long::compareTo))
                .thenComparing(AiAgentOperationPO::getOperationId, Comparator.nullsLast(String::compareTo)))
                .toList();
    }

    private static final class DraftRevisionState {
        private Long latestRenderedRevision;
        private Long latestAcceptedRevision;
        private boolean renderedWithoutRevision;
        private boolean acceptedWithoutRevision;

        private void rendered(Long revision) {
            acceptedWithoutRevision = false;
            if (revision == null) renderedWithoutRevision = true;
            else latestRenderedRevision = latestRenderedRevision == null ? revision : Math.max(latestRenderedRevision, revision);
        }

        private void accepted(Long revision) {
            renderedWithoutRevision = false;
            if (revision == null) acceptedWithoutRevision = true;
            else latestAcceptedRevision = latestAcceptedRevision == null ? revision : Math.max(latestAcceptedRevision, revision);
        }

        private boolean renderedAfter(Long revision) {
            return renderedWithoutRevision || latestRenderedRevision != null && latestRenderedRevision > revision;
        }

        private boolean unaccepted() {
            if (acceptedWithoutRevision) return false;
            if (renderedWithoutRevision) return true;
            return latestRenderedRevision != null
                    && (latestAcceptedRevision == null || latestRenderedRevision > latestAcceptedRevision);
        }
    }

    private boolean isCancelledDraftPreview(AiAgentOperationPO operation) {
        Map<String, Object> request = parseMap(operation.getRequestJson());
        Map<String, Object> result = parseMap(operation.getResultJson());
        return "preview".equals(request.get("action"))
                && "draft-rejected".equals(result.get("status"))
                && Boolean.FALSE.equals(result.get("confirmed"))
                && ("applied".equals(operation.getStatus()) || "rejected".equals(operation.getStatus())
                || "cancelled".equals(operation.getStatus()));
    }

    private boolean isDraftCleanupAction(String action) {
        return "clear".equals(action) || "discard".equals(action) || "cancel".equals(action);
    }

    @Transactional(rollbackFor = Exception.class)
    public void markRunCompleted(AgentExecutionContext context) {
        long now = System.currentTimeMillis();
        int updated = runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId())
                .in(AiAgentRunPO::getStatus, activeStatuses())
                .set(AiAgentRunPO::getStatus, "completed")
                .set(AiAgentRunPO::getWorkerId, null)
                .set(AiAgentRunPO::getLeaseExpiresAt, null)
                .set(AiAgentRunPO::getEndedAt, now));
        if (updated == 0) return;
        turnMapper.update(null, new LambdaUpdateWrapper<AiAgentTurnPO>()
                .eq(AiAgentTurnPO::getTurnId, context.turnId())
                .set(AiAgentTurnPO::getStatus, "completed")
                .set(AiAgentTurnPO::getEndedAt, now));
        appendEvent(context.threadId(), context.turnId(), context.runId(), "run.completed", Map.of("runId", context.runId()));
    }

    @Transactional(rollbackFor = Exception.class)
    public void markRunFailed(AgentExecutionContext context, String code, String message) {
        long now = System.currentTimeMillis();
        int updated = runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId())
                .in(AiAgentRunPO::getStatus, activeStatuses())
                .set(AiAgentRunPO::getStatus, "failed")
                .set(AiAgentRunPO::getWorkerId, null)
                .set(AiAgentRunPO::getLeaseExpiresAt, null)
                .set(AiAgentRunPO::getEndedAt, now));
        if (updated == 0) return;
        appendItem(context, "diagnostic", Map.of("code", code, "message", message));
        appendEvent(context.threadId(), context.turnId(), context.runId(), "run.failed", Map.of("code", code, "message", message));
        turnMapper.update(null, new LambdaUpdateWrapper<AiAgentTurnPO>()
                .eq(AiAgentTurnPO::getTurnId, context.turnId())
                .set(AiAgentTurnPO::getStatus, "failed")
                .set(AiAgentTurnPO::getEndedAt, now));
    }

    @Transactional(rollbackFor = Exception.class)
    public void markRunBudgetExhausted(AgentExecutionContext context, String message) {
        long now = System.currentTimeMillis();
        int updated = runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId()).in(AiAgentRunPO::getStatus, activeStatuses())
                .set(AiAgentRunPO::getStatus, "budget_exhausted")
                .set(AiAgentRunPO::getWorkerId, null).set(AiAgentRunPO::getLeaseExpiresAt, null)
                .set(AiAgentRunPO::getEndedAt, now));
        if (updated == 0) return;
        turnMapper.update(null, new LambdaUpdateWrapper<AiAgentTurnPO>()
                .eq(AiAgentTurnPO::getTurnId, context.turnId())
                .set(AiAgentTurnPO::getStatus, "budget_exhausted").set(AiAgentTurnPO::getEndedAt, now));
        appendEvent(context.threadId(), context.turnId(), context.runId(), "run.budget_exhausted", Map.of(
                "message", message, "usage", visibleUsage(runMapper.selectById(context.runId()))));
    }

    @Transactional(rollbackFor = Exception.class)
    public void markWaitingForInput(AgentExecutionContext context, Map<String, Object> prompt) {
        runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId())
                .set(AiAgentRunPO::getStatus, "waiting_user_input")
                .set(AiAgentRunPO::getWorkerId, null)
                .set(AiAgentRunPO::getLeaseExpiresAt, null));
        turnMapper.update(null, new LambdaUpdateWrapper<AiAgentTurnPO>()
                .eq(AiAgentTurnPO::getTurnId, context.turnId())
                .set(AiAgentTurnPO::getStatus, "waiting_user_input"));
        appendItem(context, "input_required", prompt);
        appendEvent(context.threadId(), context.turnId(), context.runId(), "input.required", prompt);
    }

    @Transactional(rollbackFor = Exception.class)
    public void markWaitingForFrontendEffects(AgentExecutionContext context, List<Map<String, Object>> effects,
                                              long timeoutSeconds) {
        List<String> operationIds = effects.stream()
                .map(effect -> stringValue(effect.get("operationId")))
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (operationIds.isEmpty()) {
            throw new IllegalArgumentException("前端工具批次缺少 operationId");
        }
        boolean confirmation = effects.stream().anyMatch(effect -> {
            String operationType = stringValue(effect.get("operationType"));
            if ("create_canvas_components".equals(operationType)
                    || "confirm_canvas_patch".equals(operationType)
                    || "request_component_selection".equals(operationType)) {
                return true;
            }
            if (!"render_draft".equals(operationType)) return false;
            AiAgentOperationPO operation = operationMapper.selectById(stringValue(effect.get("operationId")));
            Map<String, Object> request = operation == null ? effect : parseMap(operation.getRequestJson());
            String action = stringValue(request.get("action"));
            if (isDraftCleanupAction(action)) return false;
            if ("preview".equals(action) || "accept".equals(action)) return true;
            if (!"render".equals(action)) throw new IllegalArgumentException("render_draft.action 必须为当前支持的动作");
            // 普通单次 render 可以省略 interactive，默认需要用户确认。
            return !Boolean.FALSE.equals(request.get("interactive"));
        });
        String status = confirmation ? "waiting_user_confirmation" : "waiting_frontend_tool";
        long deadlineAt = confirmation ? 0L : System.currentTimeMillis() + timeoutSeconds * 1_000L;
        AiAgentTurnPO turn = turnMapper.selectById(context.turnId());
        if (turn == null) {
            throw new AppException(404, "AI Agent 运行上下文不存在");
        }
        Map<String, Object> turnContext = parseMap(turn.getContextJson());
        turnContext.put(WAITING_FRONTEND_OPERATION_IDS, operationIds);
        // 用户决策没有期限，也清除上一批自动执行留下的截止时间。
        if (confirmation) turnContext.remove(WAITING_FRONTEND_DEADLINE_AT);
        else turnContext.put(WAITING_FRONTEND_DEADLINE_AT, deadlineAt);
        runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId())
                .set(AiAgentRunPO::getStatus, status)
                .set(AiAgentRunPO::getWorkerId, null)
                .set(AiAgentRunPO::getLeaseExpiresAt, null));
        turn.setStatus(status);
        turn.setContextJson(JSON.toJSONString(turnContext));
        turnMapper.updateById(turn);
        Map<String, Object> waitingEffects = new LinkedHashMap<>();
        waitingEffects.put("operationIds", operationIds);
        if (!confirmation) waitingEffects.put("deadlineAt", deadlineAt);
        waitingEffects.put("status", confirmation ? "waitingUserConfirmation" : "waitingFrontendTool");
        appendEvent(context.threadId(), context.turnId(), context.runId(), "approval.required", waitingEffects);
        AiAgentThreadPO thread = threadMapper.selectById(context.threadId());
        if (thread != null) {
            resumeFrontendBatchIfComplete(thread, turn, context.runId());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveCheckpoint(AgentExecutionContext context, String stateJson, long revision) {
        AiAgentRunPO run = runMapper.selectOne(new LambdaQueryWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId()).last("for update"));
        if (run == null || !isActiveStatus(run.getStatus())) return;
        AiAgentCheckpointPO previous = checkpoint(run);
        revision = previous == null || previous.getRevision() == null ? 1 : previous.getRevision() + 1;
        String checkpointId = id("checkpoint");
        AiAgentCheckpointPO checkpoint = new AiAgentCheckpointPO();
        checkpoint.setCheckpointId(checkpointId);
        checkpoint.setRunId(context.runId());
        checkpoint.setStateJson(stateJson);
        checkpoint.setRevision(revision);
        checkpoint.setStatus("active");
        checkpoint.setCreatedAt(System.currentTimeMillis());
        checkpointMapper.insert(checkpoint);
        runMapper.update(null, new LambdaUpdateWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId())
                .set(AiAgentRunPO::getCheckpointId, checkpointId));
        appendEvent(context.threadId(), context.turnId(), context.runId(), "checkpoint.created", Map.of(
                "checkpointId", checkpointId,
                "revision", revision
        ));
    }

    @Transactional(rollbackFor = Exception.class)
    public ItemView appendAssistantMessage(AgentExecutionContext context, String text) {
        AiAgentThreadPO thread = threadMapper.selectById(context.threadId());
        AiAgentTurnPO turn = turnMapper.selectById(context.turnId());
        return toItemView(appendItem(thread, turn, "assistant_message", Map.of("text", text == null ? "" : text)));
    }

    @Transactional(rollbackFor = Exception.class)
    public ItemView appendItem(AgentExecutionContext context, String type, Map<String, Object> payload) {
        AiAgentThreadPO thread = threadMapper.selectById(context.threadId());
        AiAgentTurnPO turn = thread == null ? null : turnMapper.selectById(context.turnId());
        if (thread == null || turn == null) {
            throw new AppException(404, "AI Agent 运行上下文不存在");
        }
        return toItemView(appendItem(thread, turn, type, payload));
    }

    @Transactional(rollbackFor = Exception.class)
    public OperationView createFrontendOperation(AgentExecutionContext context, String operationType, Map<String, Object> request, String baseRevision) {
        AiAgentRunPO run = runMapper.selectOne(new LambdaQueryWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getRunId, context.runId()).last("for update"));
        if (run == null || !isActiveStatus(run.getStatus())) throw new AppException(409, "AI Agent 运行已结束，不能发起新的前端操作");
        String operationId = required(stringValue(request.get("operationId")), "operationId");
        AiAgentOperationPO existing = operationMapper.selectById(operationId);
        if (existing != null) {
            if (!Objects.equals(existing.getRunId(), context.runId())) {
                throw new AppException(409, "operationId 已属于其他运行");
            }
            if (!Objects.equals(existing.getOperationType(), operationType)
                    || !Objects.equals(parseMap(existing.getRequestJson()), request)) {
                throw new AppException(409, "相同 operationId 不能复用不同的前端操作");
            }
            return toOperationView(existing);
        }
        long now = System.currentTimeMillis();
        AiAgentOperationPO operation = new AiAgentOperationPO();
        operation.setOperationId(operationId);
        operation.setProjectId(context.projectId());
        operation.setThreadId(context.threadId());
        operation.setTurnId(context.turnId());
        operation.setRunId(context.runId());
        operation.setOperationType(operationType);
        operation.setStatus("pending");
        operation.setRequestJson(JSON.toJSONString(request));
        operation.setBaseRevision(baseRevision);
        operation.setCreatedAt(now);
        operation.setUpdatedAt(now);
        operationMapper.insert(operation);
        appendItem(context, "frontend_effect", Map.of(
                "operationId", operationId,
                "operationType", operationType,
                "request", request
        ));
        appendEvent(context.threadId(), context.turnId(), context.runId(), "frontend.effect.requested", Map.of(
                "operationId", operationId,
                "operationType", operationType,
                "request", request
        ));
        return toOperationView(operation);
    }

    public OperationView readOperationStatus(AgentExecutionContext context, String operationId) {
        AiAgentOperationPO operation = operationMapper.selectById(required(operationId, "operationId"));
        if (operation == null) {
            throw new AppException(404, "前端效果操作不存在");
        }
        if (!Objects.equals(operation.getProjectId(), context.projectId())
                || !Objects.equals(operation.getThreadId(), context.threadId())
                || !Objects.equals(operation.getTurnId(), context.turnId())) {
            throw new AppException(409, "前端效果操作不属于当前 Agent 作用域");
        }
        return toOperationView(operation);
    }

    /** 恢复模型窗口时使用真实回执更新等待状态，避免把已生效动作继续标记为待执行。 */
    public List<OperationView> contextOperationReceipts(AgentExecutionContext context) {
        return operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                        .eq(AiAgentOperationPO::getProjectId, context.projectId())
                        .eq(AiAgentOperationPO::getThreadId, context.threadId())
                        .eq(AiAgentOperationPO::getTurnId, context.turnId())
                        .orderByAsc(AiAgentOperationPO::getUpdatedAt))
                .stream().map(this::toOperationView).toList();
    }

    /** 仅提取本任务已成功读取的规格身份，不把正文放入长期证据缓存。 */
    List<Map<String, Object>> componentSpecEvidence(AgentExecutionContext context) {
        List<Map<String, Object>> evidence = new ArrayList<>();
        var operations = operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getTurnId, context.turnId()).eq(AiAgentOperationPO::getProjectId, context.projectId())
                .eq(AiAgentOperationPO::getOperationType, AiAgentComponentSpecs.TOOL_NAME).eq(AiAgentOperationPO::getStatus, "applied")
                .orderByDesc(AiAgentOperationPO::getUpdatedAt).last("limit 20"));
        for (var operation : operations) {
            Object raw = parseMap(operation.getResultJson()).get(AiAgentComponentSpecs.EVIDENCE_KEY);
            if (raw instanceof List<?> list) for (Object item : list) if (item instanceof Map<?, ?> map)
                evidence.add(new LinkedHashMap<>(ComponentDocumentParser.cast(map)));
        }
        return evidence;
    }

    /** 同一任务按组件保留最后一次成功查询的数据源契约，正文不进入长期内存缓存。 */
    List<Map<String, Object>> componentDataContractEvidence(AgentExecutionContext context) {
        var evidence = new LinkedHashMap<String, Map<String, Object>>();
        var operations = operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getTurnId, context.turnId()).eq(AiAgentOperationPO::getProjectId, context.projectId())
                .eq(AiAgentOperationPO::getOperationType, "get_component_data_contract").eq(AiAgentOperationPO::getStatus, "applied")
                .orderByDesc(AiAgentOperationPO::getUpdatedAt).last("limit 20"));
        for (var operation : operations) {
            var result = parseMap(operation.getResultJson());
            if (!(result.get("components") instanceof List<?> list) || !(result.get("sourceContract") instanceof Map<?, ?> source)) continue;
            for (Object raw : list) if (raw instanceof Map<?, ?> map) {
                var component = new LinkedHashMap<>(ComponentDocumentParser.cast(map));
                component.put("contractSourceType", source.get("sourceType"));
                evidence.putIfAbsent(String.valueOf(component.get("componentId")), component);
            }
        }
        return new ArrayList<>(evidence.values());
    }

    /** 返回本次运行最近一次成功的前端读取结果，作为后续写操作的并发基线。 */
    public Map<String, Object> latestFrontendReadResult(AgentExecutionContext context) {
        AiAgentOperationPO operation = operationMapper.selectOne(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getRunId, context.runId())
                .eq(AiAgentOperationPO::getStatus, "applied")
                .in(AiAgentOperationPO::getOperationType, List.of(
                        "get_component_snapshots", "inspect_current_page"
                ))
                .orderByDesc(AiAgentOperationPO::getUpdatedAt)
                .last("limit 1"));
        return operation == null ? new LinkedHashMap<>() : parseMap(operation.getResultJson());
    }

    public Map<String, Object> currentCanvasContext(AgentExecutionContext context) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("projectId", context.projectId());
        value.put("canvasSnapshot", context.canvasSnapshot());
        value.put("canvasRevision", context.canvasSnapshot().get("revision"));
        value.put("selection", context.selection());
        return value;
    }

    @Transactional(rollbackFor = Exception.class)
    public void appendEvent(String threadId, String turnId, String runId, String type, Map<String, Object> payload) {
        long sequence = reserveEventSequence(threadId);
        AiAgentEventPO event = new AiAgentEventPO();
        event.setEventId(id("event"));
        event.setThreadId(threadId);
        event.setTurnId(turnId);
        event.setRunId(runId);
        event.setSequenceNo(sequence);
        event.setEventType(type);
        Map<String, Object> eventPayload = new LinkedHashMap<>(payload == null ? Map.of() : payload);
        if (eventPayload.get("usage") instanceof Map<?, ?>)
            eventPayload.put("usage", withThreadTokenUsage(threadId, turnId, mapValue(eventPayload.get("usage"))));
        event.setPayloadJson(JSON.toJSONString(eventPayload));
        event.setCreatedAt(System.currentTimeMillis());
        eventMapper.insert(event);
        AiAgentDebugTrace.committedEvent(event);
    }

    private long reserveEventSequence(String threadId) {
        for (int attempt = 1; attempt <= MAX_EVENT_SEQUENCE_RESERVATION_RETRIES; attempt++) {
            // 普通查询在 REPEATABLE READ 下可能持续读到旧序号；锁定读取最新值直到事件事务提交。
            AiAgentThreadPO thread = threadMapper.selectOne(new LambdaQueryWrapper<AiAgentThreadPO>()
                    .eq(AiAgentThreadPO::getThreadId, threadId)
                    .last("for update"));
            if (thread == null) {
                throw new AppException(404, "AI Agent 会话不存在");
            }
            Long currentSequence = thread.getEventSequenceNo();
            if (currentSequence == null || currentSequence == Long.MAX_VALUE) {
                throw new EventSequenceConflictException("AI Agent 事件序号无效，操作未完成");
            }
            long nextSequence = currentSequence + 1L;
            int reserved = threadMapper.update(null, new UpdateWrapper<AiAgentThreadPO>()
                    .eq("thread_id", threadId)
                    .eq("event_sequence_no", currentSequence)
                    .set("event_sequence_no", nextSequence));
            if (reserved == 1) {
                return nextSequence;
            }
        }
        throw new EventSequenceConflictException("AI Agent 事件序号并发冲突，操作未完成，请重试");
    }

    private AiAgentItemPO appendItem(AiAgentThreadPO thread, AiAgentTurnPO turn, String type, Map<String, Object> payload) {
        synchronized (turnLock(turn.getTurnId())) {
            turnMapper.selectOne(new LambdaQueryWrapper<AiAgentTurnPO>()
                    .eq(AiAgentTurnPO::getTurnId, turn.getTurnId())
                    .last("for update"));
            AiAgentItemPO last = itemMapper.selectOne(new LambdaQueryWrapper<AiAgentItemPO>()
                    .eq(AiAgentItemPO::getTurnId, turn.getTurnId())
                    .orderByDesc(AiAgentItemPO::getSequenceNo)
                    .last("limit 1"));
            AiAgentItemPO item = new AiAgentItemPO();
            item.setItemId(id("item"));
            item.setThreadId(thread.getThreadId());
            item.setTurnId(turn.getTurnId());
            item.setItemType(type);
            item.setContentJson(JSON.toJSONString(payload == null ? Map.of() : payload));
            item.setSequenceNo(last == null || last.getSequenceNo() == null ? 1L : last.getSequenceNo() + 1L);
            item.setCreatedAt(System.currentTimeMillis());
            itemMapper.insert(item);
            return item;
        }
    }

    AiAgentOperationPO findOperation(String operationId) {
        return operationMapper.selectById(operationId);
    }

    private AiAgentThreadPO requireThreadForCurrentUser(String threadId) {
        return requireThread(required(threadId, "threadId"), currentUser());
    }

    private AiAgentTurnPO requireTurnForCurrentUser(String turnId) {
        AiAgentTurnPO turn = turnMapper.selectById(required(turnId, "turnId"));
        if (turn == null) {
            throw new AppException(404, "AI Agent 轮次不存在");
        }
        AiAgentThreadPO thread = requireThreadForCurrentUser(turn.getThreadId());
        if (!Objects.equals(thread.getThreadId(), turn.getThreadId())) {
            throw new AppException(403, "无权访问该 AI Agent 轮次");
        }
        return turn;
    }

    private AiAgentRunPO requireRunForTurn(String turnId) {
        AiAgentRunPO run = runMapper.selectOne(new LambdaQueryWrapper<AiAgentRunPO>()
                .eq(AiAgentRunPO::getTurnId, turnId)
                .orderByDesc(AiAgentRunPO::getCreatedAt)
                .last("limit 1"));
        if (run == null) {
            throw new AppException(404, "AI Agent 运行不存在");
        }
        return run;
    }

    private AiAgentThreadPO requireThread(String threadId, User user) {
        AiAgentThreadPO thread = threadMapper.selectById(required(threadId, "threadId"));
        if (thread == null) {
            throw new AppException(404, "AI Agent 会话不存在");
        }
        requireThread(thread, user, thread.getProjectId());
        return thread;
    }

    private void requireThread(AiAgentThreadPO thread, User user, String projectId) {
        if (!Objects.equals(thread.getUserId(), userId(user)) || !Objects.equals(thread.getProjectId(), projectId)) {
            throw new AppException(403, "无权访问该 AI Agent 会话");
        }
        requireProject(projectId, user);
    }

    private void requireProject(String projectId, User user) {
        long id;
        try {
            id = Long.parseLong(projectId);
        } catch (NumberFormatException e) {
            throw new AppException(400, "projectId 格式不正确");
        }
        LambdaQueryWrapper<ProjectPO> wrapper = new LambdaQueryWrapper<ProjectPO>()
                .eq(ProjectPO::getId, id)
                .eq(ProjectPO::getDeleted, 0);
        if (!user.isAdmin()) {
            wrapper.eq(ProjectPO::getUserId, user.getId());
        }
        if (projectMapper.selectCount(wrapper) <= 0) {
            throw new AppException(403, "无权访问该项目");
        }
    }

    private User currentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null) {
            throw new AppException(401, "用户未登录");
        }
        return user;
    }

    private String userId(User user) {
        return String.valueOf(user.getId());
    }

    private Object threadLock(String threadId) {
        return threadLocks.computeIfAbsent(threadId, ignored -> new Object());
    }

    private Object turnLock(String turnId) {
        return turnLocks.computeIfAbsent(turnId, ignored -> new Object());
    }

    private Object projectLock(String projectId) {
        return projectLocks.computeIfAbsent(projectId, ignored -> new Object());
    }

    private String id(String prefix) {
        return prefix + "-" + UUID.randomUUID();
    }

    private String required(String value, String field) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new AppException(400, "请求参数错误：" + field + " 不能为空");
        }
        return trimmed;
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        return value.trim();
    }

    private String normalizeTitle(String value) {
        String title = trimToNull(value);
        return title == null ? "新建 AI 会话" : title.substring(0, Math.min(255, title.length()));
    }

    private String normalizeThreadStatus(String value) {
        String status = required(value, "status").toLowerCase();
        if (!List.of("active", "archived").contains(status)) {
            throw new AppException(400, "会话状态只能是 active 或 archived");
        }
        return status;
    }

    private String normalizeOperationStatus(String value) {
        String status = required(value, "status").toLowerCase();
        if (!List.of("applied", "rejected", "failed", "cancelled", "conflict").contains(status)) {
            throw new AppException(400, "前端效果状态不合法");
        }
        return status;
    }

    private void validateId(String value, String field) {
        if (value.length() > 64 || value.contains("/") || value.contains("\\")) {
            throw new AppException(400, "请求参数错误：" + field + " 不合法");
        }
    }

    private int boundedLimit(Integer value, int max) {
        return value == null ? 100 : Math.min(max, Math.max(1, value));
    }

    private Map<String, Object> parseMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        JSONObject object = JSON.parseObject(json);
        return object == null ? new LinkedHashMap<>() : new LinkedHashMap<>(object);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : new LinkedHashMap<>();
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private long numberValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return value == null ? 0L : Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private Long nullableLong(Object value) {
        if (value instanceof Number number) return number.longValue();
        if (value == null) return null;
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private List<String> stringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .filter(item -> !item.isBlank())
                .distinct()
                .toList();
    }

    private String shortcutCommand(AgentExecutionContext context) {
        Object shortcut = context.context().get("shortcut");
        if (shortcut instanceof Map<?, ?> shortcutMap) {
            String command = trimToNull(stringValue(shortcutMap.get("command")));
            if (command != null) {
                return command;
            }
        }
        return null;
    }

    private ThreadView toThreadView(AiAgentThreadPO value) {
        AiAgentTurnPO currentTurn = value.getCurrentTurnId() == null
                ? null : turnMapper.selectById(value.getCurrentTurnId());
        if (currentTurn != null && List.of("completed", "failed", "cancelled", "interrupted", "budget_exhausted").contains(currentTurn.getStatus())) {
            currentTurn = null;
        }
        AiAgentRunPO currentRun = currentTurn == null ? null : requireRunForTurn(currentTurn.getTurnId());
        return new ThreadView(value.getThreadId(), value.getProjectId(), value.getTitle(), value.getStatus(),
                currentTurn == null ? null : currentTurn.getTurnId(),
                currentRun == null ? null : currentRun.getRunId(),
                currentTurn == null ? null : currentTurn.getStatus(),
                value.getCreatedAt(), value.getUpdatedAt());
    }

    private TurnView toTurnView(AiAgentTurnPO value) {
        Map<String, Object> context = parseMap(value.getContextJson());
        AiAgentThreadPO thread = threadMapper.selectById(value.getThreadId());
        AiAgentItemPO diagnostic = "failed".equals(value.getStatus())
                ? itemMapper.selectOne(new LambdaQueryWrapper<AiAgentItemPO>()
                        .eq(AiAgentItemPO::getTurnId, value.getTurnId())
                        .eq(AiAgentItemPO::getItemType, "diagnostic")
                        .orderByDesc(AiAgentItemPO::getSequenceNo)
                        .last("limit 1"))
                : null;
        Map<String, Object> error = diagnostic == null ? Map.of() : parseMap(diagnostic.getContentJson());
        AiAgentRunPO run = requireRunForTurn(value.getTurnId());
        AiAgentCheckpointPO checkpoint = checkpoint(run);
        Map<String, Object> usage = visibleUsage(run);
        return new TurnView(value.getTurnId(), value.getThreadId(),
                thread == null ? stringValue(context.get("projectId")) : thread.getProjectId(),
                turnRequestId(value), value.getInputText(), value.getStatus(),
                stringValue(context.get("modelConfigId")), stringValue(context.get("runtimeModelId")),
                stringValue(context.get("provider")), usage,
                stringValue(error.get("code")), stringValue(error.get("message")),
                value.getSteerVersion(), value.getCreatedAt(), value.getStartedAt(), value.getEndedAt(),
                run.getRunId(), runLimits(run), checkpoint == null ? 0L : checkpoint.getRevision(), recoverable(value, run));
    }

    private ItemView toItemView(AiAgentItemPO value) {
        return new ItemView(value.getItemId(), value.getThreadId(), value.getTurnId(), value.getItemType(),
                parseMap(value.getContentJson()), value.getSequenceNo(), value.getCreatedAt());
    }

    private EventView toEventView(AiAgentEventPO value, String projectId) {
        AiAgentTurnPO turn = value.getTurnId() == null ? null : turnMapper.selectById(value.getTurnId());
        Map<String, Object> context = turn == null ? Map.of() : parseMap(turn.getContextJson());
        return new EventView(value.getEventId(), value.getThreadId(), value.getTurnId(), value.getRunId(),
                value.getSequenceNo(), value.getEventType(), parseMap(value.getPayloadJson()), value.getCreatedAt(), projectId,
                stringValue(context.get("requestId")), "ai-driven-task/v3");
    }

    private OperationView toOperationView(AiAgentOperationPO value) {
        return new OperationView(value.getOperationId(), value.getOperationType(), value.getStatus(),
                parseMap(value.getResultJson()), value.getBaseRevision(), value.getResultRevision(), value.getUpdatedAt());
    }

    private TaskView taskView(AiAgentTurnPO turn, AiAgentRunPO run) {
        Map<String, Object> context = parseMap(turn.getContextJson());
        String projectId = stringValue(context.get("projectId"));
        String requestId = stringValue(context.get("requestId"));
        String sessionId = stringValue(context.get("sessionId"));
        AiAgentCheckpointPO checkpoint = checkpoint(run);
        return new TaskView(turn.getThreadId(), turn.getTurnId(), run.getRunId(), run.getStatus(), run.getStatus(),
                turn.getCreatedAt(), run.getStartedAt(), run.getEndedAt(), "ai-driven-task/v3", requestId,
                projectId, sessionId, 0L, runLimits(run), withThreadTokenUsage(turn.getThreadId(), turn.getTurnId(), visibleUsage(run)),
                checkpoint == null ? 0L : checkpoint.getRevision(), recoverable(turn, run), canvasOperations(turn.getTurnId()));
    }

    private String turnRequestId(AiAgentTurnPO turn) {
        String requestId = trimToNull(turn.getRequestId());
        if (requestId == null) requestId = trimToNull(stringValue(parseMap(turn.getContextJson()).get("requestId")));
        return requestId == null ? turn.getTurnId() : requestId;
    }

    private List<Map<String, Object>> canvasOperations(String turnId) {
        return operationMapper.selectList(new LambdaQueryWrapper<AiAgentOperationPO>()
                .eq(AiAgentOperationPO::getTurnId, turnId)
                .in(AiAgentOperationPO::getOperationType, List.of("create_canvas_components", "render_draft", "patch_canvas_components"))
                .orderByAsc(AiAgentOperationPO::getCreatedAt)).stream()
                .filter(operation -> !isTemporaryRenderOperation(operation))
                .map(operation -> {
                    Map<String, Object> receipt = new LinkedHashMap<>();
                    receipt.put("operationId", operation.getOperationId());
                    receipt.put("toolCallId", parseMap(operation.getRequestJson()).getOrDefault("toolCallId", operation.getOperationId()));
                    receipt.put("kind", "patch_canvas_components".equals(operation.getOperationType()) ? "patchComponents" : "createComponents");
                    receipt.put("status", "pending".equals(operation.getStatus()) ? "prepared"
                            : "applied".equals(operation.getStatus()) ? "applied" : "rejected".equals(operation.getStatus()) ? "rejected" : "failed");
                    receipt.put("projectId", operation.getProjectId());
                    Map<String, Object> result = parseMap(operation.getResultJson());
                    Map<String, Object> bindings = mapValue(result.get("componentBindings"));
                    receipt.put("componentIds", new ArrayList<>(bindings.keySet()));
                    receipt.put("componentBindings", bindings);
                    receipt.put("baseRevision", operation.getBaseRevision());
                    receipt.put("resultRevision", operation.getResultRevision());
                    receipt.put("appliedAt", operation.getUpdatedAt());
                    return receipt;
                }).toList();
    }

    private boolean isTemporaryRenderOperation(AiAgentOperationPO operation) {
        if (!"render_draft".equals(operation.getOperationType())) return false;
        Map<String, Object> request = parseMap(operation.getRequestJson());
        Map<String, Object> result = parseMap(operation.getResultJson());
        String action = stringValue(request.get("action"));
        return "clear".equals(action)
                || Boolean.FALSE.equals(request.get("interactive"))
                || "draft-rendered".equals(result.get("status"))
                || "draft-cleared".equals(result.get("status"));
    }

    private void requireScopeValue(String actual, String expected, String field) {
        if (actual != null && !actual.isBlank() && !Objects.equals(actual, expected)) {
            throw new AppException(409, "请求作用域不匹配：" + field);
        }
    }

    public record ThreadCreateRequest(String threadId, String projectId, String title) {
    }

    public record ThreadUpdateRequest(String projectId, String threadId, String title, String status) {
    }

    public record EventQueryRequest(String projectId, String threadId, String turnId, String runId, Long cursor, Integer limit) {
    }

    public record ItemListRequest(String projectId, String turnId, Integer limit) {
    }

    public record AgentSubmitRequest(
            String schemaVersion,
            String requestId,
            String sessionId,
            String projectId,
            String threadId,
            String turnId,
            String inputText,
            String requirement,
            Map<String, Object> model,
            List<Map<String, Object>> attachments,
            List<Map<String, Object>> inputAttachments,
            String modelConfigId,
            String runtimeModelId,
            Map<String, Object> context,
            String provider
    ) {
        public String normalizedInputText() {
            return inputText == null || inputText.isBlank() ? requirement : inputText;
        }

        public List<Map<String, Object>> normalizedAttachments() {
            return attachments == null ? (inputAttachments == null ? List.of() : inputAttachments) : attachments;
        }

        public String normalizedModelConfigId() {
            if (modelConfigId != null && !modelConfigId.isBlank()) {
                return modelConfigId;
            }
            return model == null ? null : string(model.get("modelConfigId"));
        }

        public String normalizedRuntimeModelId() {
            if (runtimeModelId != null && !runtimeModelId.isBlank()) {
                return runtimeModelId;
            }
            return model == null ? null : string(model.get("runtimeModelId"));
        }

        public String normalizedProvider() {
            if (provider != null && !provider.isBlank()) {
                return provider;
            }
            return model == null ? null : string(model.get("provider"));
        }

        private static String string(Object value) {
            return value == null ? null : String.valueOf(value);
        }
    }

    public record AgentSteerRequest(String projectId, String threadId, String turnId, String expectedTurnId,
                                    String runId, String inputId, String inputText, String input) {
        public String normalizedTurnId() {
            return expectedTurnId == null || expectedTurnId.isBlank() ? turnId : expectedTurnId;
        }

        public String normalizedInputText() {
            return inputText == null || inputText.isBlank() ? input : inputText;
        }
    }

    public record AgentCancelRequest(String projectId, String threadId, String turnId, String runId) {
    }

    public record AgentResumeRequest(String projectId, String threadId, String turnId, String sessionId,
                                     String previousRunId, Long expectedCheckpointVersion,
                                     Map<String, Object> budgetExtension, Map<String, Object> canvasSnapshot) {
    }

    public record AgentStatusRequest(String projectId, String threadId, String turnId, String runId) {
    }

    public record FrontendOperationCompleteRequest(
            String operationId,
            String status,
            String resultRevision,
            Map<String, Object> result,
            String projectId,
            String threadId,
            String turnId,
            String runId
    ) {
    }

    public record ThreadView(String threadId, String projectId, String title, String status, String currentTurnId,
                             String currentRunId, String currentTurnStatus, Long createdAt, Long updatedAt) {
    }

    public record TurnView(String turnId, String threadId, String projectId, String requestId,
                           String inputText, String status, String modelConfigId, String runtimeModelId,
                           String provider, Map<String, Object> usage, String errorCode, String errorMessage,
                           Integer steerVersion, Long createdAt, Long startedAt, Long endedAt,
                           String runId, Map<String, Object> limits, Long checkpointVersion, boolean recoverable) {
    }

    public record ItemView(String itemId, String threadId, String turnId, String type, Map<String, Object> content,
                           Long sequence, Long createdAt) {
    }

    public record EventView(String eventId, String threadId, String turnId, String runId, Long sequence,
                            String type, Map<String, Object> payload, Long createdAt, String projectId,
                            String requestId, String schemaVersion) {
    }

    public record TaskView(String threadId, String turnId, String runId, String turnStatus, String runStatus,
                           Long createdAt, Long startedAt, Long endedAt, String schemaVersion, String requestId,
                           String projectId, String clientSessionId, Long eventCursor,
                           Map<String, Object> limits, Map<String, Object> usage, Long checkpointVersion, boolean recoverable,
                           List<Map<String, Object>> operations) {
    }

    public record OperationView(String operationId, String operationType, String status, Map<String, Object> result,
                                String baseRevision, String resultRevision, Long updatedAt) {
    }

    static final class EventSequenceConflictException extends AppException {
        private EventSequenceConflictException(String message) {
            super(409, message);
        }
    }

    public record HistoryMessage(String role, String text) {
    }

    public record SteerMessage(long version, String text) {
    }

    public record CompletionCheck(boolean passed, String message) {
    }

    public record AgentExecutionContext(
            String threadId,
            String projectId,
            String turnId,
            String runId,
            String userId,
            String inputText,
            Map<String, Object> context,
            Map<String, Object> selection,
            Map<String, Object> canvasSnapshot,
            String checkpointStateJson,
            String resumeMessage,
            int steerVersion
    ) {
    }
}
