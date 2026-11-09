/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.mapper.*;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.po.*;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.*;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.output.TokenUsage;
import org.apache.ibatis.mapping.Environment;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.lang.reflect.Proxy;

import static org.junit.Assert.*;

/** 真实 Mapper、数据库事务和迁移，验证恢复不会新建 Turn、清零用量或重放已生效的动作。 */
public class AiAgentResumeTest {
    private AiAgentService service;
    private SqlSessionTemplate session;
    private JdbcTemplate jdbc;
    private TransactionTemplate transactions;
    private final RecordingRuntime runtime = new RecordingRuntime();
    private AiAgentRunMapper runs;
    private AiAgentTurnMapper turns;

    @Before
    public void setUp() {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(dataSource);
        new ResourceDatabasePopulator(new ClassPathResource("migration/V2026.8.18.1__ai_agent.sql")).execute(dataSource);
        jdbc.execute("alter table ai_agent_thread add column event_sequence_no bigint not null default 0");
        jdbc.execute("alter table ai_agent_turn add column request_id varchar(64)");
        jdbc.execute("alter table ai_agent_run add column consumed_steer_version int not null default 0");
        jdbc.execute("alter table ai_agent_run add column worker_id varchar(64)");
        jdbc.execute("alter table ai_agent_run add column lease_expires_at bigint");
        new ResourceDatabasePopulator(new ClassPathResource("migration/V2026.10.6.2__ai_agent_resume_budget.sql")).execute(dataSource);
        jdbc.execute("create table project(id bigint primary key, user_id bigint, deleted int default 0, name varchar(128), des text, create_time timestamp, update_time timestamp, data_json text, cover text, pid bigint)");
        jdbc.update("insert into project(id, user_id, deleted) values(10, 2, 0)");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new SpringManagedTransactionFactory(), dataSource));
        for (Class<?> mapper : List.of(AiAgentThreadMapper.class, AiAgentTurnMapper.class, AiAgentRunMapper.class,
                AiAgentCheckpointMapper.class, AiAgentEventMapper.class, AiAgentItemMapper.class, AiAgentOperationMapper.class, ProjectMapper.class)) {
            configuration.addMapper(mapper);
        }
        session = new SqlSessionTemplate(new MybatisSqlSessionFactoryBuilder().build(configuration));
        transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        service = createService();
        runs = session.getMapper(AiAgentRunMapper.class);
        turns = session.getMapper(AiAgentTurnMapper.class);
        login(2, "ROLE_USER");
        seed("interrupted");
    }

    @After
    public void tearDown() { SecurityContextHolder.clearContext(); }

    @Test
    public void oldCheckpointIsRejectedInsteadOfReconstructingHistory() {
        jdbc.update("update ai_agent_checkpoint set state_json=? where checkpoint_id='checkpoint-1'",
                new JacksonChatMessageJsonCodec().messagesToJson(List.of(SystemMessage.from("old"), UserMessage.from("请求"))));
        AppException error = assertThrows(AppException.class, () -> service.conversationContext(newTurnContext()));
        assertEquals(409, error.getCode());
        assertTrue(error.getMsg().contains("检查点格式不受支持"));
    }

    @Test
    public void newTurnReusesWholeCheckpointIncludingToolHistoryOrExistingSummary() {
        var call = ToolExecutionRequest.builder().id("icon").name("create_canvas_components").arguments("{}").build();
        List<ChatMessage> previous = List.of(SystemMessage.from(AiAgentContextHistory.FULL_HISTORY_MARKER + "\n旧作用域"),
                UserMessage.from("[Agent context summary]\n标题已完成，当前生成图标"),
                UserMessage.from("生成图标"), AiMessage.from("准备创建图标"), AiMessage.from(call),
                ToolExecutionResultMessage.from(call, "{\"status\":\"applied\",\"operationId\":\"icon-op\"}"),
                AiMessage.from("图标已生成"));
        jdbc.update("update ai_agent_checkpoint set state_json = ? where checkpoint_id = 'checkpoint-1'",
                new JacksonChatMessageJsonCodec().messagesToJson(previous));
        assertEquals(previous.subList(1, previous.size()), service.conversationContext(newTurnContext()));
    }

    private AiAgentService.AgentExecutionContext newTurnContext() {
        return new AiAgentService.AgentExecutionContext("thread-1", "10", "turn-next", "run-next", "2", "生成图标",
                Map.of(), Map.of(), Map.of(), null, null, 0);
    }

    @Test
    public void threadTokenTotalsIncludeAllTurnsButOnlyTheLatestRunOfEachTurn() {
        seedTokenHistory();
        var result = service.taskByTurn("turn-1");
        assertEquals(900L, ((Number) result.usage().get("totalTokens")).longValue());
        var total = (Map<?, ?>) result.usage().get("threadUsage");
        assertEquals(1130L, total.get("inputTokens"));
        assertEquals(520L, total.get("outputTokens"));
        assertEquals(1650L, total.get("totalTokens"));
        assertEquals(190L, total.get("cachedInputTokens"));
        assertEquals(5L, total.get("cacheCreationInputTokens"));
        // 同一项目另一个会话的用量不应混入当前会话。
        jdbc.update("insert into ai_agent_thread(thread_id, project_id, user_id, status, created_at, updated_at) values('thread-other','10','2','active',1,1)");
        seedTokenTurn("turn-other", "thread-other", "completed");
        seedTokenRun("run-other", "turn-other", 10, Map.of("inputTokens", 90000, "outputTokens", 10000, "totalTokens", 100000));
        assertEquals(total, service.taskByTurn("turn-1").usage().get("threadUsage"));
    }

    @Test
    public void threadTokenTotalsRemainCorrectAfterResumeAndFreshSnapshots() {
        seedTokenHistory();
        var resumed = resume(request(null));
        assertEquals(1650L, ((Map<?, ?>) resumed.usage().get("threadUsage")).get("totalTokens"));
        var context = service.executionContext(resumed.runId(), "2");
        service.saveUsage(context, Map.of("inputTokens", 700, "outputTokens", 300, "totalTokens", 1000));
        assertEquals(1750L, ((Map<?, ?>) service.taskByTurn("turn-1").usage().get("threadUsage")).get("totalTokens"));
        assertEquals(1000L, ((Number) service.taskByTurn("turn-1").usage().get("totalTokens")).longValue());
    }

    @Test
    public void usageEventsCarryThreadTotalsUsingTheEventCurrentTurnSnapshot() {
        seedTokenHistory();
        Map<String, Object> usage = Map.of("inputTokens", 650L, "outputTokens", 300L, "totalTokens", 950L);
        service.appendEvent("thread-1", "turn-1", "run-1", "agent.model_call.completed", Map.of("usage", usage));
        String payload = jdbc.queryForObject("select payload_json from ai_agent_event where event_type='agent.model_call.completed'", String.class);
        var saved = JSON.parseObject(payload).getJSONObject("usage");
        assertEquals(950L, saved.getLongValue("totalTokens"));
        assertEquals(1700L, saved.getJSONObject("threadUsage").getLongValue("totalTokens"));
        assertFalse(usage.containsKey("threadUsage"));
    }

    private void seedTokenHistory() {
        seedTokenTurn("turn-previous", "thread-1", "failed");
        seedTokenRun("run-previous-old", "turn-previous", 3, Map.of("inputTokens", 3000, "outputTokens", 2000, "totalTokens", 5000));
        seedTokenRun("run-previous-latest", "turn-previous", 4, Map.of("inputTokens", 500, "outputTokens", 200,
                "totalTokens", 700, "cachedInputTokens", 180, "cacheCreationInputTokens", 5));
        seedTokenTurn("turn-cancelled", "thread-1", "cancelled");
        // 兼容只有输入和输出、未保存 totalTokens 的旧统计。
        seedTokenRun("run-cancelled", "turn-cancelled", 5, Map.of("inputTokens", 30, "outputTokens", 20, "cachedInputTokens", 10));
    }

    private void seedTokenTurn(String turnId, String threadId, String status) {
        jdbc.update("insert into ai_agent_turn(turn_id, thread_id, input_text, context_json, status, created_at, ended_at) values(?,?, '历史任务','{}',?,0,1)",
                turnId, threadId, status);
    }

    private void seedTokenRun(String runId, String turnId, long createdAt, Map<String, Object> usage) {
        jdbc.update("insert into ai_agent_run(run_id, turn_id, status, usage_json, created_at, ended_at) values(?,?,'completed',?,?,?)",
                runId, turnId, JSON.toJSONString(usage), createdAt, createdAt + 1);
    }

    @Test
    public void readBatchResumesOnlyAfterEveryReceiptAndOnlyOnce() {
        var context = pendingReadBatch();
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context, readEffects(), 30));
        transactions.executeWithoutResult(status -> service.completeOperation(readCompletion("catalog-read")));
        assertEquals("waiting_frontend_tool", runs.selectById("run-1").getStatus());
        assertTrue(runtime.started.isEmpty());
        transactions.executeWithoutResult(status -> service.completeOperation(readCompletion("snapshot-read")));
        assertEquals("queued", runs.selectById("run-1").getStatus());
        assertEquals(List.of("run-1"), runtime.started);
        transactions.executeWithoutResult(status -> service.completeOperation(readCompletion("snapshot-read")));
        assertEquals(1, runtime.started.size());
    }

    @Test
    public void concurrentReadReceiptsResumeTheBatchExactlyOnce() throws Exception {
        var context = pendingReadBatch();
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context, readEffects(), 30));
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<?>> receipts = new ArrayList<>();
            for (String id : List.of("snapshot-read", "catalog-read")) receipts.add(executor.submit(() -> {
                login(2, "ROLE_USER");
                try {
                    start.await();
                    transactions.executeWithoutResult(status -> service.completeOperation(readCompletion(id)));
                } catch (InterruptedException error) { throw new RuntimeException(error); }
                finally { SecurityContextHolder.clearContext(); }
            }));
            start.countDown();
            for (var receipt : receipts) receipt.get(10, TimeUnit.SECONDS);
            assertEquals("queued", runs.selectById("run-1").getStatus());
            assertEquals(List.of("run-1"), runtime.started);
        } finally { executor.shutdownNow(); }
    }

    @Test
    public void receiptsArrivingBeforeTheWaitIsSavedAreNotLost() {
        var context = pendingReadBatch();
        for (String id : List.of("snapshot-read", "catalog-read"))
            transactions.executeWithoutResult(status -> service.completeOperation(readCompletion(id)));
        assertTrue(runtime.started.isEmpty());
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context, readEffects(), 30));
        assertEquals(List.of("run-1"), runtime.started);
    }

    @Test
    public void oldTurnObjectCannotResumeBeforeTheLatestBatchIsComplete() {
        var context = pendingReadBatch();
        var oldTurn = turns.selectById("turn-1");
        var thread = session.getMapper(AiAgentThreadMapper.class).selectById("thread-1");
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context, readEffects(), 30));
        transactions.executeWithoutResult(status -> service.completeOperation(readCompletion("snapshot-read")));
        transactions.executeWithoutResult(status -> ReflectionTestUtils.invokeMethod(service,
                "resumeFrontendBatchIfComplete", thread, oldTurn, "run-1"));
        assertEquals("waiting_frontend_tool", runs.selectById("run-1").getStatus());
        assertTrue(runtime.started.isEmpty());
        transactions.executeWithoutResult(status -> service.completeOperation(readCompletion("catalog-read")));
        assertEquals(List.of("run-1"), runtime.started);
    }

    @Test
    public void userConfirmationWaitDoesNotPersistAnExpiryDeadline() {
        var context = pendingFrontendOperation("confirm-create", "create_canvas_components");
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context,
                frontendEffect("confirm-create", "create_canvas_components"), 30));

        Map<String, Object> turnContext = JSON.parseObject(turns.selectById("turn-1").getContextJson());
        assertFalse(turnContext.containsKey("waitingFrontendDeadlineAt"));
        assertEquals("waiting_user_confirmation", runs.selectById("run-1").getStatus());
        assertApprovalEventHasNoDeadline();
    }

    @Test
    public void canvasPatchConfirmationWaitDoesNotPersistAnExpiryDeadline() {
        assertConfirmationWaitHasNoDeadline("confirm-patch", "confirm_canvas_patch", Map.of("operationId", "confirm-patch"));
    }

    @Test
    public void componentSelectionWaitDoesNotPersistAnExpiryDeadline() {
        assertConfirmationWaitHasNoDeadline("select-component", "request_component_selection", Map.of("operationId", "select-component"));
    }

    @Test
    public void renderDraftConfirmationWaitDoesNotPersistAnExpiryDeadline() {
        assertConfirmationWaitHasNoDeadline("render-preview", "render_draft",
                Map.of("operationId", "render-preview", "action", "render"));
    }

    @Test
    public void renderDraftPreviewConfirmationWaitDoesNotPersistAnExpiryDeadline() {
        assertConfirmationWaitHasNoDeadline("render-final-preview", "render_draft",
                Map.of("operationId", "render-final-preview", "action", "preview", "draftId", "draft-1"));
    }

    @Test
    public void renderWithoutActionIsRejected() {
        var context = pendingFrontendOperation("missing-action", "render_draft", Map.of("operationId", "missing-action"));
        assertThrows(IllegalArgumentException.class, () -> transactions.executeWithoutResult(status ->
                service.markWaitingForFrontendEffects(context, frontendEffect("missing-action", "render_draft"), 30)));
    }

    @Test
    public void nonInteractiveRegionDraftWaitsForFrontendWithDeadline() {
        String operationId = "render-region-draft";
        var context = pendingFrontendOperation(operationId, "render_draft", Map.of(
                "operationId", operationId, "action", "render", "regionId", "hero",
                "draftId", "draft-1", "interactive", false));
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context,
                frontendEffect(operationId, "render_draft"), 30));

        Map<String, Object> turnContext = JSON.parseObject(turns.selectById("turn-1").getContextJson());
        assertTrue(turnContext.containsKey("waitingFrontendDeadlineAt"));
        assertTrue(((Number) turnContext.get("waitingFrontendDeadlineAt")).longValue() > System.currentTimeMillis());
        assertEquals("waiting_frontend_tool", runs.selectById("run-1").getStatus());
        String eventJson = jdbc.queryForObject(
                "select payload_json from ai_agent_event where event_type='approval.required'", String.class);
        assertTrue(JSON.parseObject(eventJson).containsKey("deadlineAt"));
    }

    @Test
    public void clearDraftRemainsAnAutomaticFrontendOperationWithDeadline() {
        String operationId = "clear-preview";
        var context = pendingFrontendOperation(operationId, "render_draft", Map.of("operationId", operationId, "action", "clear"));
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context,
                frontendEffect(operationId, "render_draft"), 30));

        Map<String, Object> turnContext = JSON.parseObject(turns.selectById("turn-1").getContextJson());
        assertTrue(turnContext.containsKey("waitingFrontendDeadlineAt"));
        assertTrue(((Number) turnContext.get("waitingFrontendDeadlineAt")).longValue() > System.currentTimeMillis());
        assertEquals("waiting_frontend_tool", runs.selectById("run-1").getStatus());
        String eventJson = jdbc.queryForObject(
                "select payload_json from ai_agent_event where event_type='approval.required'", String.class);
        assertTrue(JSON.parseObject(eventJson).containsKey("deadlineAt"));
    }

    @Test
    public void legacyExpiredConfirmationDeadlineDoesNotTimeoutAndLateReceiptResumesOnce() {
        var context = pendingFrontendOperation("late-confirm-create", "create_canvas_components");
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context,
                frontendEffect("late-confirm-create", "create_canvas_components"), 30));
        setWaitingDeadline(System.currentTimeMillis() - 60_000L);

        transactions.executeWithoutResult(status -> service.expireFrontendBatches());
        assertEquals("pending", jdbc.queryForObject(
                "select status from ai_agent_operation where operation_id='late-confirm-create'", String.class));
        assertEquals("waiting_user_confirmation", runs.selectById("run-1").getStatus());
        assertTrue(runtime.started.isEmpty());

        var completion = frontendCompletion("late-confirm-create", "applied");
        transactions.executeWithoutResult(status -> service.completeOperation(completion));
        assertEquals("queued", runs.selectById("run-1").getStatus());
        assertEquals(List.of("run-1"), runtime.started);
        transactions.executeWithoutResult(status -> service.completeOperation(completion));
        assertEquals(1, runtime.started.size());
    }

    @Test
    public void expiredAutomaticFrontendOperationStillTimesOutAndResumes() {
        var context = pendingFrontendOperation("expired-snapshot", "get_project_snapshot");
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context,
                frontendEffect("expired-snapshot", "get_project_snapshot"), 30));
        setWaitingDeadline(System.currentTimeMillis() - 60_000L);

        transactions.executeWithoutResult(status -> service.expireFrontendBatches());
        assertEquals("failed", jdbc.queryForObject(
                "select status from ai_agent_operation where operation_id='expired-snapshot'", String.class));
        String resultJson = jdbc.queryForObject(
                "select result_json from ai_agent_operation where operation_id='expired-snapshot'", String.class);
        assertEquals("frontend_batch_timeout", JSON.parseObject(resultJson).getString("code"));
        assertEquals("queued", runs.selectById("run-1").getStatus());
        assertEquals(List.of("run-1"), runtime.started);
    }

    private AiAgentService.AgentExecutionContext pendingFrontendOperation(String operationId, String operationType) {
        return pendingFrontendOperation(operationId, operationType, Map.of("operationId", operationId));
    }

    private AiAgentService.AgentExecutionContext pendingFrontendOperation(String operationId, String operationType,
                                                                          Map<String, Object> request) {
        jdbc.update("update ai_agent_run set status='running'");
        jdbc.update("update ai_agent_turn set status='running'");
        var context = service.executionContext("run-1", "2");
        transactions.executeWithoutResult(status -> service.createFrontendOperation(context, operationType, request, null));
        return context;
    }

    private void assertConfirmationWaitHasNoDeadline(String operationId, String operationType, Map<String, Object> request) {
        var context = pendingFrontendOperation(operationId, operationType, request);
        transactions.executeWithoutResult(status -> service.markWaitingForFrontendEffects(context,
                frontendEffect(operationId, operationType), 30));
        Map<String, Object> turnContext = JSON.parseObject(turns.selectById("turn-1").getContextJson());
        assertFalse(turnContext.containsKey("waitingFrontendDeadlineAt"));
        assertEquals("waiting_user_confirmation", runs.selectById("run-1").getStatus());
        assertApprovalEventHasNoDeadline();
    }

    private void assertApprovalEventHasNoDeadline() {
        String eventJson = jdbc.queryForObject(
                "select payload_json from ai_agent_event where event_type='approval.required'", String.class);
        assertFalse(JSON.parseObject(eventJson).containsKey("deadlineAt"));
    }

    private void insertRenderOperation(String operationId, String status, Map<String, Object> request,
                                       Map<String, Object> result) {
        insertRenderOperationAt(operationId, status, request, result, 1);
    }

    private void insertRenderOperationAt(String operationId, String status, Map<String, Object> request,
                                         Map<String, Object> result, long createdAt) {
        jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, result_json, created_at, updated_at) values(?,'10','thread-1','turn-1','run-1','render_draft',?,?,?,?,?)",
                operationId, status, JSON.toJSONString(request), JSON.toJSONString(result), createdAt, createdAt);
    }

    private List<Map<String, Object>> frontendEffect(String operationId, String operationType) {
        return List.of(Map.of("operationId", operationId, "operationType", operationType));
    }

    private AiAgentService.FrontendOperationCompleteRequest frontendCompletion(String operationId, String status) {
        return new AiAgentService.FrontendOperationCompleteRequest(operationId, status, null, Map.of("value", operationId),
                "10", "thread-1", "turn-1", "run-1");
    }

    private void setWaitingDeadline(long deadlineAt) {
        Map<String, Object> turnContext = new LinkedHashMap<>(JSON.parseObject(turns.selectById("turn-1").getContextJson()));
        turnContext.put("waitingFrontendDeadlineAt", deadlineAt);
        jdbc.update("update ai_agent_turn set context_json=? where turn_id='turn-1'", JSON.toJSONString(turnContext));
    }

    private AiAgentService.AgentExecutionContext pendingReadBatch() {
        jdbc.update("update ai_agent_run set status='running'");
        jdbc.update("update ai_agent_turn set status='running'");
        var context = service.executionContext("run-1", "2");
        transactions.executeWithoutResult(status -> {
            service.createFrontendOperation(context, "get_project_snapshot", Map.of("operationId", "snapshot-read"), null);
            service.createFrontendOperation(context, "get_component_catalog", Map.of("operationId", "catalog-read"), null);
        });
        return context;
    }

    private List<Map<String, Object>> readEffects() {
        return List.of(Map.of("operationId", "snapshot-read", "operationType", "get_project_snapshot"),
                Map.of("operationId", "catalog-read", "operationType", "get_component_catalog"));
    }

    private AiAgentService.FrontendOperationCompleteRequest readCompletion(String id) {
        return new AiAgentService.FrontendOperationCompleteRequest(id, "applied", null, Map.of("value", id),
                "10", "thread-1", "turn-1", "run-1");
    }

    @Test
    public void aLegacyAppliedReceiptWithFailedItemsPersistsFailureAndPreservesThePartialResult() {
        pendingFrontendOperation("partial-patch", "patch_canvas_components");
        var failure = Map.of("componentId", "bad", "code", "invalid_payload", "fieldPath", "patches[1].layerPatch.width",
                "actualValue", -1, "actualType", "number", "expected", Map.of("exclusiveMinimum", 0));
        var payload = Map.<String, Object>of("applied", List.of(Map.of("componentId", "good")), "failed", List.of(failure));
        var request = new AiAgentService.FrontendOperationCompleteRequest("partial-patch", "applied", "2", payload,
                "10", "thread-1", "turn-1", "run-1");
        var completed = transactions.execute(status -> service.completeOperation(request));
        assertEquals("failed", completed.status());
        assertEquals(true, completed.result().get("partial"));
        assertEquals(payload.get("failed"), completed.result().get("failed"));
        assertEquals(payload.get("applied"), completed.result().get("applied"));
        assertEquals("failed", jdbc.queryForObject("select status from ai_agent_operation where operation_id='partial-patch'", String.class));
        assertEquals(completed.result(), transactions.execute(status -> service.completeOperation(request)).result());
    }

    @Test
    public void noPlanAndDisplayOnlyPlanCanComplete() {
        var context = service.executionContext("run-1", "2");
        assertTrue(service.checkCompletion(context).passed());
        var catalog = new AiAgentToolCatalog(service, null);
        catalog.execute(ToolExecutionRequest.builder().id("display-plan").name("update_plan")
                .arguments("{\"plan\":[{\"step\":\"回答问题\",\"status\":\"completed\"}]}").build(), context);
        assertTrue(service.checkCompletion(context).passed());
    }

    @Test
    public void noPlanStillWaitsForActualFrontendReceipt() {
        var context = service.executionContext("run-1", "2");
        jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, created_at, updated_at) values('pending-write','10','thread-1','turn-1','run-1','patch_canvas_components','pending','{}',1,1)");
        assertFalse(service.checkCompletion(context).passed());
        jdbc.update("update ai_agent_operation set status='applied', result_json='{}' where operation_id='pending-write'");
        assertTrue(service.checkCompletion(context).passed());
    }

    @Test
    public void unacceptedRegionDraftBlocksCompletionWithoutAPlanUntilUnifiedPreviewIsAccepted() {
        var context = service.executionContext("run-1", "2");
        insertRenderOperation("region-draft-layout", "applied",
                Map.of("action", "render", "regionId", "hero", "draftId", "draft-1", "interactive", false),
                Map.of("status", "draft-rendered", "draftId", "draft-1", "revision", 3, "layerCount", 2));
        insertRenderOperation("region-draft-content", "applied",
                Map.of("action", "render", "regionId", "content", "draftId", "draft-1", "interactive", false),
                Map.of("status", "draft-rendered", "draftId", "draft-1", "revision", 4, "layerCount", 3));

        var blocked = service.checkCompletion(context);
        assertFalse(blocked.passed());
        assertTrue(blocked.message().contains("action=preview"));

        insertRenderOperation("0-region-preview", "applied",
                Map.of("action", "preview", "draftId", "draft-1", "expectedDraftRevision", 4),
                Map.of("status", "draft-accepted", "confirmed", true,
                        "componentBindings", Map.of("draft-heading", "real-heading"), "resultRevision", "11"));
        assertTrue(service.checkCompletion(context).passed());
    }

    @Test
    public void cancelledUnifiedPreviewClosesDraftAndTerminatesCreateRequirementWithoutClaimingCreation() {
        var context = service.executionContext("run-1", "2");
        jdbc.update("insert into ai_agent_item(item_id, thread_id, turn_id, item_type, content_json, sequence_no, created_at) values('cancelled-draft-plan','thread-1','turn-1','plan',?,1,1)",
                JSON.toJSONString(Map.of("completionRequirements", Map.of("requiredCanvasEffects", List.of("createComponents")))));
        insertRenderOperation("cancelled-region-draft", "applied",
                Map.of("action", "render", "regionId", "hero", "draftId", "draft-1", "interactive", false),
                Map.of("status", "draft-rendered", "draftId", "draft-1", "revision", 3, "layerCount", 2));
        insertRenderOperationAt("cancelled-final-preview", "rejected",
                Map.of("action", "preview", "draftId", "draft-1", "expectedDraftRevision", 3),
                Map.of("status", "draft-rejected", "confirmed", false, "draftId", "draft-1", "layerCount", 0), 2);

        assertTrue(service.checkCompletion(context).passed());
        String factJson = jdbc.queryForObject("select payload_json from ai_agent_event where event_type='agent.completion.fact_check' order by sequence_no desc limit 1", String.class);
        Map<String, Object> check = JSON.parseObject(factJson).getJSONObject("check");
        assertFalse(((List<?>) check.get("appliedCanvasEffects")).contains("createComponents"));
        assertEquals(List.of("createComponents"), check.get("cancelledCanvasEffects"));
        assertEquals(List.of(), check.get("missingRequiredCanvasEffects"));
    }

    @Test
    public void clearOnlyClosesEarlierDraftAndDoesNotHideALaterDraft() {
        var context = service.executionContext("run-1", "2");
        jdbc.update("insert into ai_agent_item(item_id, thread_id, turn_id, item_type, content_json, sequence_no, created_at) values('clear-order-plan','thread-1','turn-1','plan',?,1,1)",
                JSON.toJSONString(Map.of("completionRequirements", Map.of("requiredCanvasEffects", List.of("createComponents")))));
        insertRenderOperationAt("earlier-draft", "applied",
                Map.of("action", "render", "regionId", "hero", "draftId", "draft-1", "interactive", false),
                Map.of("status", "draft-rendered", "draftId", "draft-1", "revision", 3, "layerCount", 2), 1);
        insertRenderOperationAt("clear", "applied",
                Map.of("action", "clear"), Map.of("status", "draft-cleared", "layerCount", 0, "cleared", true, "draftId", "draft-1", "revision", 3), 2);
        insertRenderOperationAt("later-draft", "applied",
                Map.of("action", "render", "regionId", "hero", "draftId", "draft-2", "interactive", false),
                Map.of("status", "draft-rendered", "draftId", "draft-2", "revision", 1, "layerCount", 2), 3);

        var check = service.checkCompletion(context);
        assertFalse(check.passed());
        assertTrue(check.message().contains("draft-2"));
    }

    @Test
    public void emptyClearReceiptClosesEarlierDraft() {
        var context = service.executionContext("run-1", "2");
        insertRenderOperationAt("earlier-draft", "applied",
                Map.of("action", "render", "draftId", "draft-1", "interactive", false),
                Map.of("status", "draft-rendered", "draftId", "draft-1", "revision", 1, "layerCount", 1), 1);
        insertRenderOperationAt("clear", "applied", Map.of("action", "clear"),
                Map.of("status", "draft-cleared", "cleared", false, "layerCount", 0), 2);
        assertTrue(service.checkCompletion(context).passed());
    }

    @Test
    public void incompleteClearReceiptIsRejected() {
        var context = service.executionContext("run-1", "2");
        insertRenderOperationAt("clear", "applied", Map.of("action", "clear"),
                Map.of("status", "draft-cleared", "layerCount", 0), 1);
        var error = assertThrows(AppException.class, () -> service.checkCompletion(context));
        assertEquals("草稿清理回执缺少草稿标识", error.getMsg());
    }

    @Test
    public void laterRenderIntentReactivatesCreateRequirementAfterCancelledPreview() {
        var context = service.executionContext("run-1", "2");
        jdbc.update("insert into ai_agent_item(item_id, thread_id, turn_id, item_type, content_json, sequence_no, created_at) values('retry-after-cancel-plan','thread-1','turn-1','plan',?,1,1)",
                JSON.toJSONString(Map.of("completionRequirements", Map.of("requiredCanvasEffects", List.of("createComponents")))));
        insertRenderOperationAt("retry-source-draft", "applied",
                Map.of("action", "render", "regionId", "hero", "draftId", "draft-1", "interactive", false),
                Map.of("status", "draft-rendered", "draftId", "draft-1", "revision", 3, "layerCount", 2), 1);
        insertRenderOperationAt("retry-cancel-preview", "rejected",
                Map.of("action", "preview", "draftId", "draft-1", "expectedDraftRevision", 3),
                Map.of("status", "draft-rejected", "confirmed", false, "draftId", "draft-1", "layerCount", 0), 2);
        insertRenderOperationAt("retry-render-failed", "failed",
                Map.of("action", "render", "regionId", "hero", "draftId", "draft-2", "interactive", false),
                Map.of("code", "render_failed", "message", "render failed"), 3);

        assertFalse(service.checkCompletion(context).passed());
        String factJson = jdbc.queryForObject("select payload_json from ai_agent_event where event_type='agent.completion.fact_check' order by sequence_no desc limit 1", String.class);
        Map<String, Object> check = JSON.parseObject(factJson).getJSONObject("check");
        assertEquals(List.of("createComponents"), check.get("missingRequiredCanvasEffects"));
        assertEquals(List.of(), check.get("cancelledCanvasEffects"));
    }

    @Test
    public void draftRenderLayerCountDoesNotSatisfyRequiredCreateEffectAndCancelActionsAreNotCreates() {
        var context = service.executionContext("run-1", "2");
        jdbc.update("insert into ai_agent_item(item_id, thread_id, turn_id, item_type, content_json, sequence_no, created_at) values('draft-plan','thread-1','turn-1','plan',?,1,1)",
                JSON.toJSONString(Map.of("completionRequirements", Map.of("requiredCanvasEffects", List.of("createComponents")))));
        insertRenderOperation("region-draft", "applied",
                Map.of("action", "render", "regionId", "hero", "draftId", "draft-1", "interactive", false),
                Map.of("status", "draft-rendered", "draftId", "draft-1", "revision", 4, "layerCount", 3));
        assertFalse(service.checkCompletion(context).passed());

        for (String action : List.of("clear", "discard", "cancel")) {
            insertRenderOperation("non-create-" + action, "applied",
                    Map.of("action", action, "draftId", "draft-1"),
                    Map.of("confirmed", true, "componentBindings", Map.of("draft-heading", "real-heading"), "layerCount", 3));
            assertFalse(service.checkCompletion(context).passed());
            jdbc.update("delete from ai_agent_operation where operation_id=?", "non-create-" + action);
        }
    }

    @Test
    public void renderLayerCountRequiresAnExplicitConfirmedBindingReceipt() {
        var context = service.executionContext("run-1", "2");
        jdbc.update("insert into ai_agent_item(item_id, thread_id, turn_id, item_type, content_json, sequence_no, created_at) values('render-plan','thread-1','turn-1','plan',?,1,1)",
                JSON.toJSONString(Map.of("completionRequirements", Map.of("requiredCanvasEffects", List.of("createComponents")))));
        insertRenderOperation("unconfirmed-render", "applied",
                Map.of("action", "render"), Map.of("layerCount", 3));
        assertFalse(service.checkCompletion(context).passed());

        jdbc.update("update ai_agent_operation set result_json=? where operation_id='unconfirmed-render'",
                JSON.toJSONString(Map.of("confirmed", true, "componentBindings", Map.of("draft-title", "real-title"),
                        "resultRevision", "12", "layerCount", 3)));
        assertTrue(service.checkCompletion(context).passed());
    }

    @Test
    public void taskCanvasOperationSnapshotOmitsTemporaryDraftAndClearButKeepsAcceptedPreview() {
        jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, result_json, created_at, updated_at) values('temporary-region','10','thread-1','turn-1','run-1','render_draft','applied',?,?,1,1)",
                JSON.toJSONString(Map.of("action", "render", "interactive", false, "regionId", "hero")),
                JSON.toJSONString(Map.of("status", "draft-rendered", "draftId", "draft-1", "revision", 1, "layerCount", 2)));
        jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, result_json, created_at, updated_at) values('cleared-region','10','thread-1','turn-1','run-1','render_draft','applied',?,?,2,2)",
                JSON.toJSONString(Map.of("action", "clear")),
                JSON.toJSONString(Map.of("status", "draft-cleared", "layerCount", 0)));
        jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, result_json, created_at, updated_at) values('accepted-preview','10','thread-1','turn-1','run-1','render_draft','applied',?,?,3,3)",
                JSON.toJSONString(Map.of("action", "preview", "draftId", "draft-1", "expectedDraftRevision", 1)),
                JSON.toJSONString(Map.of("status", "draft-accepted", "confirmed", true,
                        "componentBindings", Map.of("draft-title", "real-title"), "resultRevision", "r1")));

        var receipts = service.taskByTurn("turn-1").operations();
        assertEquals(List.of("accepted-preview"), receipts.stream().map(receipt -> receipt.get("operationId")).toList());
        assertEquals(List.of("draft-title"), receipts.get(0).get("componentIds"));
    }

    @Test
    public void renderReceiptWithoutActionDoesNotSatisfyCreateRequirement() {
        var context = service.executionContext("run-1", "2");
        jdbc.update("insert into ai_agent_item(item_id, thread_id, turn_id, item_type, content_json, sequence_no, created_at) values('legacy-render-plan','thread-1','turn-1','plan',?,1,1)",
                JSON.toJSONString(Map.of("completionRequirements", Map.of("requiredCanvasEffects", List.of("createComponents")))));
        insertRenderOperation("legacy-render-result", "applied", Map.of(),
                Map.of("confirmed", true, "componentBindings", Map.of("draft-title", "real-title"), "resultRevision", "12"));

        assertFalse(service.checkCompletion(context).passed());
    }

    @Test
    public void explicitEffectsSurviveProgressOnlyPlanAndRequireAppliedAction() {
        var context = service.executionContext("run-1", "2");
        var catalog = new AiAgentToolCatalog(service, null);
        catalog.execute(ToolExecutionRequest.builder().id("required-plan").name("update_plan")
                .arguments("{\"plan\":[{\"step\":\"创建标题\",\"status\":\"in_progress\"}],\"completionRequirements\":{\"requiredCanvasEffects\":[\"createComponents\"]}}")
                .build(), context);
        assertFalse(service.checkCompletion(context).passed());
        catalog.execute(ToolExecutionRequest.builder().id("progress-plan").name("update_plan")
                .arguments("{\"plan\":[{\"step\":\"创建标题\",\"status\":\"completed\"}]}").build(), context);
        assertFalse(service.checkCompletion(context).passed());
        jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, result_json, created_at, updated_at) values('created-title','10','thread-1','turn-1','run-1','create_canvas_components','applied','{}',?,1,1)",
                JSON.toJSONString(Map.of("componentBindings", Map.of("title", "real-title"))));
        assertTrue(service.checkCompletion(context).passed());
    }

    @Test
    public void styleAndDataShortcutsRequirePatchEvenWithoutPlan() {
        var context = service.executionContext("run-1", "2");
        for (String command : List.of("style", "data")) {
            var metadata = new LinkedHashMap<>(context.context());
            metadata.put("shortcut", Map.of("command", command));
            var shortcut = new AiAgentService.AgentExecutionContext(context.threadId(), context.projectId(), context.turnId(),
                    context.runId(), context.userId(), context.inputText(), metadata, context.selection(), context.canvasSnapshot(),
                    context.checkpointStateJson(), context.resumeMessage(), context.steerVersion());
            assertFalse(service.checkCompletion(shortcut).passed());
            jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, result_json, created_at, updated_at) values(?,'10','thread-1','turn-1','run-1','patch_canvas_components','applied','{}','{}',1,1)", command);
            assertTrue(service.checkCompletion(shortcut).passed());
            jdbc.update("delete from ai_agent_operation where operation_id=?", command);
        }
    }

    @Test
    public void persistsCompleteSpecEvidenceAndKeepsItOnIdempotentCompletion() {
        pendingSpecRead();
        Map<String, Object> result = AiAgentComponentSpecsTest.response();
        result.put(AiAgentComponentSpecs.EVIDENCE_KEY, List.of(Map.of("componentType", "Forged")));
        var request = specCompletion("applied", result);
        var completed = transactions.execute(status -> service.completeOperation(request));
        var evidence = List.of(Map.of("componentType", "BaseText", "intent", "create", "corpusVersion", "corpus-v1"));
        assertEquals(evidence, completed.result().get(AiAgentComponentSpecs.EVIDENCE_KEY));
        assertEquals(evidence, JSON.parseObject(jdbc.queryForObject(
                "select result_json from ai_agent_operation where operation_id='spec-read'", String.class))
                .get(AiAgentComponentSpecs.EVIDENCE_KEY));
        assertEquals(completed.result(), transactions.execute(status -> service.completeOperation(request)).result());
    }

    @Test
    public void failedOrIncompleteSpecsNeverGrantCompleteReadEvidence() {
        pendingSpecRead();
        assertThrows(AppException.class, () -> transactions.execute(status ->
                service.completeOperation(specCompletion("applied", Map.of("specs", List.of())))));
        assertEquals("pending", jdbc.queryForObject("select status from ai_agent_operation where operation_id='spec-read'", String.class));
        var failed = transactions.execute(status -> service.completeOperation(specCompletion("failed",
                Map.of("code", "agent.component_specs.output_limit_exceeded", AiAgentComponentSpecs.EVIDENCE_KEY, List.of("forged")))));
        assertFalse(failed.result().containsKey(AiAgentComponentSpecs.EVIDENCE_KEY));
    }

    private void pendingSpecRead() {
        jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, created_at, updated_at) values('spec-read','10','thread-1','turn-1','run-1','resolve_component_specs','pending',?,1,1)",
                JSON.toJSONString(AiAgentComponentSpecsTest.request()));
    }

    private AiAgentService.FrontendOperationCompleteRequest specCompletion(String status, Map<String, Object> result) {
        return new AiAgentService.FrontendOperationCompleteRequest("spec-read", status, null, result, "10", "thread-1", "turn-1", "run-1");
    }

    @Test
    public void dataContractCompletionUsesHostDocumentCapabilitiesAndIsIdempotent() throws Exception {
        ReflectionTestUtils.setField(service, "componentDocuments", new ComponentDocumentService("target/component-docs", null, null));
        pendingContractRead("contract-read", "static");
        var response = contractResponse("static");
        var completion = new AiAgentService.FrontendOperationCompleteRequest("contract-read", "applied", null, response, "10", "thread-1", "turn-1", "run-1");
        var completed = transactions.execute(status -> service.completeOperation(completion));
        var component = (Map<?, ?>) ((List<?>) completed.result().get("components")).get(0);
        assertEquals(true, component.get("supportsDataInput"));
        assertTrue(component.get("dataFormatRequirements").toString().contains("该组件支持通过 `dataPatch` 修改数据。"));
        assertEquals(completed.result(), transactions.execute(status -> service.completeOperation(completion)).result());
        assertEquals(1, service.componentDataContractEvidence(contractContext()).size());
        assertEquals("static", service.componentDataContractEvidence(contractContext()).get(0).get("contractSourceType"));
    }

    @Test
    public void lastSuccessfulContractWinsAcrossSourcesAndFailedQueriesGrantNoEvidence() throws Exception {
        ReflectionTestUtils.setField(service, "componentDocuments", new ComponentDocumentService("target/component-docs", null, null));
        pendingContractRead("static-contract", "static");
        transactions.execute(status -> service.completeOperation(new AiAgentService.FrontendOperationCompleteRequest("static-contract", "applied", null,
                contractResponseUnchecked("static"), "10", "thread-1", "turn-1", "run-1")));
        jdbc.update("update ai_agent_operation set updated_at=1 where operation_id='static-contract'");
        pendingContractRead("api-contract", "api");
        transactions.execute(status -> service.completeOperation(new AiAgentService.FrontendOperationCompleteRequest("api-contract", "applied", null,
                contractResponseUnchecked("api"), "10", "thread-1", "turn-1", "run-1")));
        pendingContractRead("failed-contract", "static");
        assertThrows(AppException.class, () -> transactions.execute(status -> service.completeOperation(
                new AiAgentService.FrontendOperationCompleteRequest("failed-contract", "applied", null, contractResponseUnchecked("api"), "10", "thread-1", "turn-1", "run-1"))));
        transactions.execute(status -> service.completeOperation(new AiAgentService.FrontendOperationCompleteRequest("failed-contract", "failed", null,
                contractResponseUnchecked("static"), "10", "thread-1", "turn-1", "run-1")));
        var evidence = service.componentDataContractEvidence(contractContext());
        assertEquals(1, evidence.size()); assertEquals("api", evidence.get(0).get("contractSourceType"));
        assertTrue(service.componentDataContractEvidence(new AiAgentService.AgentExecutionContext("thread-other", "10", "turn-other", "run-other", "2", "", Map.of(), Map.of(), Map.of(), null, null, 0)).isEmpty());
    }

    private void pendingContractRead(String id, String source) {
        jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, created_at, updated_at) values(?,'10','thread-1','turn-1','run-1','get_component_data_contract','pending',?,1,1)",
                id, JSON.toJSONString(Map.of("componentIds", List.of("text-1"), "sourceType", source)));
    }
    private AiAgentService.AgentExecutionContext contractContext() {
        return new AiAgentService.AgentExecutionContext("thread-1", "10", "turn-1", "run-1", "2", "", Map.of(), Map.of(), Map.of(), null, null, 0);
    }
    private Map<String, Object> contractResponseUnchecked(String source) {
        try {return contractResponse(source);} catch (Exception e) {throw new IllegalStateException(e);}
    }
    private Map<String, Object> contractResponse(String source) throws Exception {
        var root = java.nio.file.Path.of("target/component-docs");
        String version = JSON.parseObject(java.nio.file.Files.readString(root.resolve("current.json"))).getString("corpusVersion");
        var documents = JSON.parseObject(java.nio.file.Files.readString(root.resolve("builtin").resolve(version).resolve("index.json"))).getJSONArray("documents");
        var document = documents.stream().map(value -> (Map<?, ?>) value).filter(value -> "BaseText".equals(value.get("componentType"))).findFirst().orElseThrow();
        var identity = new LinkedHashMap<String, Object>();
        for (String key : List.of("source", "componentType", "componentVersion", "corpusVersion", "sha256", "documentFormatVersion")) identity.put(key, document.get(key));
        return Map.of("schemaVersion", "component-data-contract/v1", "sourceContract", Map.of("sourceType", source, "branch", source.equals("api") ? "apiData" : "staticData", "structure", Map.of()),
                "components", List.of(Map.of("componentId", "text-1", "componentType", "BaseText", "supportsDataInput", false,
                        "dataFormatRequirements", "forged", "documentIdentity", identity, "currentData", Map.of("valueExample", "标题"), "fieldMapping", Map.of())));
    }

    @Test
    public void resumesTheSameTurnWithANewRunAndPreservesCheckpointUsageAndCanvasFacts() {
        appliedCanvasFact();
        AiAgentService.TaskView result = resume(request(null));
        assertEquals("turn-1", result.turnId());
        assertNotEquals("run-1", result.runId());
        assertEquals("queued", result.turnStatus());
        assertEquals(2L, ((Number) result.usage().get("modelCalls")).longValue());
        assertEquals(900L, ((Number) result.usage().get("totalTokens")).longValue());
        assertEquals(7L, result.checkpointVersion().longValue());
        assertEquals("checkpoint-1", runs.selectById(result.runId()).getCheckpointId());
        assertEquals("interrupted", runs.selectById("run-1").getStatus());
        assertEquals("applied", result.operations().get(0).get("status"));
        assertNull(turns.selectById("turn-1").getEndedAt());
        AiAgentService.AgentExecutionContext context = service.executionContext(result.runId(), "2");
        assertEquals("current-manager", context.canvasSnapshot().get("managerId"));
        assertTrue(context.resumeMessage().contains("勿重复写入"));
        assertTrue(service.checkCompletion(context).passed());
        assertEquals(1, runtime.started.size());
        assertEquals(1, jdbc.queryForObject("select count(*) from ai_agent_turn", Integer.class).intValue());
    }

    @Test
    public void concurrentRetriesFromDifferentServiceInstancesCreateOnlyOneRun() throws Exception {
        AiAgentService other = createService();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Callable<AiAgentService.TaskView> first = () -> { login(2, "ROLE_USER"); start.await(); return resume(request(null)); };
            Callable<AiAgentService.TaskView> second = () -> { login(2, "ROLE_USER"); start.await(); return transactions.execute(s -> other.resume(request(null))); };
            Future<AiAgentService.TaskView> a = executor.submit(first);
            Future<AiAgentService.TaskView> b = executor.submit(second);
            start.countDown();
            assertEquals(a.get(10, TimeUnit.SECONDS).runId(), b.get(10, TimeUnit.SECONDS).runId());
            assertEquals(2, jdbc.queryForObject("select count(*) from ai_agent_run", Integer.class).intValue());
            assertEquals(1, runtime.started.size());
        } finally { executor.shutdownNow(); }
    }

    @Test
    public void budgetRecoveryRequiresStrictlyHigherCumulativeLimitsAndDoesNotResetUsage() {
        jdbc.update("update ai_agent_turn set status='budget_exhausted'");
        jdbc.update("update ai_agent_run set status='budget_exhausted'");
        for (Map<String, Object> invalid : List.of(Map.<String, Object>of(), Map.<String, Object>of("maxModelCalls", 2),
                Map.<String, Object>of("maxModelCalls", 2.5), Map.<String, Object>of("maxModelCalls", 1001), Map.<String, Object>of("unknown", 10))) {
            assertEquals(400, assertThrows(AppException.class, () -> resume(request(invalid))).getCode());
        }
        AiAgentService.TaskView result = resume(request(Map.of("maxModelCalls", 3)));
        assertEquals(3L, ((Number) result.limits().get("maxModelCalls")).longValue());
        AiAgentBudget budget = new AiAgentBudget(result.limits(), result.usage());
        budget.reserveModelCall();
        assertEquals(3L, ((Number) budget.snapshot().get("modelCalls")).longValue());
        assertEquals(900L, ((Number) budget.snapshot().get("totalTokens")).longValue());
        assertTrue(((Number) budget.snapshot().get("elapsedMs")).longValue() >= 1234L);
        assertThrows(AiAgentBudget.Exhausted.class, budget::reserveModelCall);
    }

    @Test
    public void rejectsForeignUsersIncludingAdministratorsAndStaleCheckpoints() {
        for (String role : List.of("ROLE_USER", "ROLE_ADMIN", "ROLE_SYSTEM_ADMIN")) {
            login(3, role);
            assertEquals(403, assertThrows(AppException.class, () -> resume(request(null))).getCode());
        }
        login(2, "ROLE_USER");
        AiAgentService.AgentResumeRequest stale = new AiAgentService.AgentResumeRequest("10", "thread-1", "turn-1", "session", "run-1", 6L, null, null);
        assertEquals(409, assertThrows(AppException.class, () -> resume(stale)).getCode());
        assertTrue(runtime.started.isEmpty());
    }

    @Test
    public void rejectsArchivedThreadsOtherActiveTasksAndUnsafeMissingCheckpoints() {
        jdbc.update("update ai_agent_thread set status='archived'");
        assertEquals(409, assertThrows(AppException.class, () -> resume(request(null))).getCode());
        jdbc.update("update ai_agent_thread set status='active'");
        jdbc.update("insert into ai_agent_turn(turn_id, thread_id, input_text, status, created_at) values('other-turn', 'thread-1', 'other', 'running', 2)");
        assertEquals(409, assertThrows(AppException.class, () -> resume(request(null))).getCode());
        jdbc.update("delete from ai_agent_turn where turn_id='other-turn'");
        jdbc.update("update ai_agent_run set checkpoint_id=null");
        service.appendEvent("thread-1", "turn-1", "run-1", "tool.requested", Map.of("name", "create_canvas_components"));
        assertFalse(service.readTurn("turn-1", "10").recoverable());
        assertEquals(409, assertThrows(AppException.class, () -> resume(new AiAgentService.AgentResumeRequest("10", "thread-1", "turn-1", "session", "run-1", 0L, null, null))).getCode());
    }

    @Test
    public void budgetExhaustionIsPersistedAsARecoverableTerminalState() {
        jdbc.update("update ai_agent_run set status='running'");
        jdbc.update("update ai_agent_turn set status='running'");
        AiAgentService.AgentExecutionContext context = service.executionContext("run-1", "2");
        service.markRunBudgetExhausted(context, "模型调用预算已用尽");
        assertEquals("budget_exhausted", runs.selectById("run-1").getStatus());
        assertTrue(service.readTurn("turn-1", "10").recoverable());
        assertNull(service.readThread("thread-1", "10").currentTurnId());
        assertTrue(service.isCancelRequested("run-1"));
    }

    @Test
    public void repairsIncompleteToolResponsesWithoutRepeatingCompletedToolResults() {
        ToolExecutionRequest first = ToolExecutionRequest.builder().id("write-1").name("create_canvas_components").arguments("{}").build();
        ToolExecutionRequest second = ToolExecutionRequest.builder().id("write-2").name("patch_canvas_components").arguments("{}").build();
        List<ChatMessage> messages = AiAgentRuntime.normalizeRecoveryMessages(List.of(
                AiMessage.from(List.of(first, second)), ToolExecutionResultMessage.from(first, "applied"), UserMessage.from("continue")));
        assertEquals(4, messages.size());
        assertEquals("applied", ((ToolExecutionResultMessage) messages.get(1)).text());
        assertEquals("write-2", ((ToolExecutionResultMessage) messages.get(2)).id());
        assertTrue(((ToolExecutionResultMessage) messages.get(2)).text().contains("不要直接重复写入"));
        assertEquals(4, AiAgentRuntime.normalizeRecoveryMessages(messages).size());
    }

    @Test
    public void runtimeStopsAtTheCumulativeBudgetAndContinuesWithExactlyTheNewAllowance() {
        appliedCanvasFact();
        AtomicInteger modelCalls = new AtomicInteger();
        AiAgentRuntime executor = executor(AiMessage.from("看板已完成"), modelCalls);
        AiAgentService.TaskView first = resume(request(null));
        executor.run(first.runId(), "2");
        assertEquals(0, modelCalls.get());
        AiAgentService.TurnView paused = service.readTurn("turn-1", "10");
        assertEquals("budget_exhausted", paused.status());
        AiAgentService.TaskView extended = resume(new AiAgentService.AgentResumeRequest("10", "thread-1", "turn-1", "session",
                first.runId(), paused.checkpointVersion(), Map.of("maxModelCalls", 3), Map.of("managerId", "current-manager")));
        executor.run(extended.runId(), "2");
        assertEquals(1, modelCalls.get());
        AiAgentService.TurnView completed = service.readTurn("turn-1", "10");
        assertEquals("completed", completed.status());
        assertEquals(3L, ((Number) completed.usage().get("modelCalls")).longValue());
        assertEquals(915L, ((Number) completed.usage().get("totalTokens")).longValue());
        assertEquals("applied", jdbc.queryForObject("select status from ai_agent_operation where operation_id='op-1'", String.class));
    }

    @Test
    public void runtimePausesBeforeIssuingAnyFrontendEffectWhenAdmittedCallExceedsBudget() {
        Map<String, Object> limits = JSON.parseObject(runs.selectById("run-1").getLimitsJson(), Map.class);
        jdbc.update("update ai_agent_run set usage_json=?", JSON.toJSONString(Map.of("modelCalls", 2, "toolCalls", 1)));
        limits.put("maxToolCalls", 1);
        limits.put("maxWriteCalls", 1);
        jdbc.update("update ai_agent_run set limits_json=?", JSON.toJSONString(limits));
        ToolExecutionRequest first = ToolExecutionRequest.builder().id("write-1").name("create_canvas_components").arguments("{}").build();
        ToolExecutionRequest second = ToolExecutionRequest.builder().id("write-2").name("patch_canvas_components").arguments("{}").build();
        AiAgentRuntime executor = executor(AiMessage.from(List.of(first, second)), new AtomicInteger());
        AiAgentService.TaskView resumed = resume(request(Map.of("maxModelCalls", 3)));
        executor.run(resumed.runId(), "2");
        assertEquals("budget_exhausted", runs.selectById(resumed.runId()).getStatus());
        assertEquals(0, jdbc.queryForObject("select count(*) from ai_agent_operation", Integer.class).intValue());
        assertEquals(0, jdbc.queryForObject("select count(*) from ai_agent_event where event_type='tool.requested'", Integer.class).intValue());
    }

    @Test
    public void restoredGuardStateIsPrivateWhileRemainingBudgetsArePublic() {
        AiAgentService.TaskView resumed = resume(request(null));
        var context = service.executionContext(resumed.runId(), "2");
        var usage = new LinkedHashMap<>(resumed.usage());
        usage.put("_toolGuardState", Map.of("progress", Map.of("cache", Map.of("read", "private contents"))));
        service.saveUsage(context, usage);
        assertTrue(((Map<?,?>) service.executionContext(resumed.runId(), "2").context().get("executionUsage")).containsKey("_toolGuardState"));
        assertFalse(service.readTurn("turn-1", "10").usage().containsKey("_toolGuardState"));
        assertEquals(0L, service.readTurn("turn-1", "10").usage().get("remainingModelCalls"));
        service.markRunBudgetExhausted(context, "budget exhausted");
        var payload = jdbc.queryForObject("select payload_json from ai_agent_event where event_type='run.budget_exhausted'", String.class);
        assertFalse(payload.contains("_toolGuardState"));
        assertFalse(payload.contains("private contents"));
    }

    @Test
    public void oldRunsWithoutCurrentBudgetOrUsageAreRejected() {
        jdbc.update("update ai_agent_run set limits_json=null where run_id='run-1'");
        AppException missingLimits = assertThrows(AppException.class, () -> service.executionContext("run-1", "2"));
        assertEquals(409, missingLimits.getCode());
        assertTrue(missingLimits.getMsg().contains("预算格式不受支持"));
        jdbc.update("update ai_agent_run set limits_json=? where run_id='run-1'", JSON.toJSONString(
                AiAgentBudget.limits(AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution())));
        jdbc.update("update ai_agent_run set usage_json=null where run_id='run-1'");
        AppException missingUsage = assertThrows(AppException.class, () -> service.executionContext("run-1", "2"));
        assertEquals(409, missingUsage.getCode());
        assertTrue(missingUsage.getMsg().contains("用量格式不受支持"));
    }

    private AiAgentRuntime executor(AiMessage reply, AtomicInteger calls) {
        AiModelPO model = new AiModelPO();
        model.setId(1L);
        model.setUserId(2L);
        model.setName("gpt-4o");
        model.setProvider("openai");
        model.setBaseUrl("https://example.invalid");
        model.setApiKey("test");
        model.setEnabled(1);
        model.setDeleted(0);
        AiModelMapper models = (AiModelMapper) Proxy.newProxyInstance(AiModelMapper.class.getClassLoader(), new Class[]{AiModelMapper.class},
                (proxy, method, args) -> method.getName().equals("selectById") ? model : null);
        AiAgentRuntime executor = new AiAgentRuntime();
        ReflectionTestUtils.setField(executor, "agentService", service);
        ReflectionTestUtils.setField(executor, "runtimeSettingsService", new AiAgentRuntimeSettingsService() {
            @Override public RuntimeSettings load(Long userId) {
                assertEquals(Long.valueOf(2L), userId);
                return RuntimeSettings.defaults();
            }
        });
        ReflectionTestUtils.setField(executor, "aiModelMapper", models);
        ReflectionTestUtils.setField(executor, "toolCatalog", new AiAgentToolCatalog(service, null));
        ReflectionTestUtils.setField(executor, "modelProviderFactory", new AiModelProviderFactory() {
            @Override public ChatModel createChatModel(AiModelConfig config) { return new ChatModel() {}; }
            @Override public AiModelCapabilities capabilities(AiModelConfig config) { return null; }
            @Override public StreamingChatModel createStreamingChatModel(AiModelConfig config) {
                return new StreamingChatModel() {
                    @Override public void chat(ChatRequest request, StreamingChatResponseHandler handler) {
                        calls.incrementAndGet();
                        handler.onCompleteResponse(ChatResponse.builder().aiMessage(reply).tokenUsage(new TokenUsage(10, 5)).build());
                    }
                };
            }
        });
        return executor;
    }

    private AiAgentService.TaskView resume(AiAgentService.AgentResumeRequest request) {
        return transactions.execute(status -> service.resume(request));
    }

    private AiAgentService.AgentResumeRequest request(Map<String, Object> extension) {
        return new AiAgentService.AgentResumeRequest("10", "thread-1", "turn-1", "new-session", "run-1", 7L, extension,
                Map.of("managerId", "current-manager", "width", 1920, "height", 1080));
    }

    private AiAgentService createService() {
        AiAgentService value = new AiAgentService();
        Map<String, Class<?>> mappers = Map.of("threadMapper", AiAgentThreadMapper.class, "turnMapper", AiAgentTurnMapper.class,
                "runMapper", AiAgentRunMapper.class, "checkpointMapper", AiAgentCheckpointMapper.class, "eventMapper", AiAgentEventMapper.class,
                "itemMapper", AiAgentItemMapper.class, "operationMapper", AiAgentOperationMapper.class, "projectMapper", ProjectMapper.class);
        mappers.forEach((field, mapper) -> ReflectionTestUtils.setField(value, field, session.getMapper(mapper)));
        ReflectionTestUtils.setField(value, "runtime", runtime);
        ReflectionTestUtils.setField(value, "runtimeSettingsService", new AiAgentRuntimeSettingsService() {
            @Override public RuntimeSettings load(Long userId) {
                assertEquals(Long.valueOf(2L), userId);
                return RuntimeSettings.defaults();
            }
        });
        return value;
    }

    private void seed(String status) {
        jdbc.update("insert into ai_agent_thread(thread_id, project_id, user_id, status, current_turn_id, created_at, updated_at) values('thread-1','10','2','active','turn-1',1,1)");
        jdbc.update("insert into ai_agent_turn(turn_id, thread_id, request_id, input_text, context_json, status, created_at, ended_at) values('turn-1','thread-1','request-1','创建看板',?, ?,1,2)",
                JSON.toJSONString(Map.of("projectId", "10", "requestId", "request-1", "sessionId", "old-session", "modelConfigId", "1", "runtimeModelId", "gpt-4o")), status);
        Map<String, Object> limits = AiAgentBudget.limits(AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution());
        limits.put("tokenBudgetEnabled", true); limits.put("callBudgetEnabled", true); limits.put("durationBudgetEnabled", true);
        limits.put("maxModelCalls", 2);
        String state = new JacksonChatMessageJsonCodec().messagesToJson(List.of(SystemMessage.from("test\n" + AiAgentContextHistory.FULL_HISTORY_MARKER), UserMessage.from("创建看板")));
        jdbc.update("insert into ai_agent_checkpoint(checkpoint_id, run_id, state_json, revision, status, created_at) values('checkpoint-1','run-1',?,7,'active',1)", state);
        jdbc.update("insert into ai_agent_run(run_id, turn_id, status, checkpoint_id, limits_json, usage_json, created_at, ended_at) values('run-1','turn-1',?,'checkpoint-1',?,?,1,2)",
                status, JSON.toJSONString(limits), JSON.toJSONString(Map.of("totalTokens", 900, "inputTokens", 600, "outputTokens", 300, "modelCalls", 2, "elapsedMs", 1234)));
    }

    private void appliedCanvasFact() {
        jdbc.update("insert into ai_agent_operation(operation_id, project_id, thread_id, turn_id, run_id, operation_type, status, request_json, result_json, created_at, updated_at) values('op-1','10','thread-1','turn-1','run-1','create_canvas_components','applied','{}',?,1,1)",
                JSON.toJSONString(Map.of("componentBindings", Map.of("draft-1", "component-1"))));
        jdbc.update("insert into ai_agent_item(item_id, thread_id, turn_id, item_type, content_json, sequence_no, created_at) values('plan-1','thread-1','turn-1','plan',?,1,1)",
                JSON.toJSONString(Map.of("completionRequirements", Map.of("requiredCanvasEffects", List.of("createComponents")))));
    }

    private static void login(long id, String role) {
        User user = new User();
        user.setId(id);
        user.setUsername("user-" + id);
        user.setRoles(List.of(role));
        user.setPermissions(List.of());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }

    private static class RecordingRuntime extends AiAgentRuntime {
        final List<String> started = new CopyOnWriteArrayList<>();
        @Override public void start(String runId, String userId) { started.add(runId); }
    }
}
