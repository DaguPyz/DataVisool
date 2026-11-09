/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.zsq.datavisoolservice.mapper.AiAgentEventMapper;
import com.zsq.datavisoolservice.mapper.AiAgentThreadMapper;
import org.apache.ibatis.mapping.Environment;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** 默认使用 H2；ai.agent.test.mysql.url 可指向独立 MySQL 测试库验证其真实快照语义。 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AiAgentEventSequenceDatabaseTest {
    private AiAgentService service;
    private JdbcTemplate jdbc;
    private TransactionTemplate transactions;
    private String threadId;
    private boolean mysql;

    @BeforeAll
    void initializeDatabase() {
        String mysqlUrl = System.getProperty("ai.agent.test.mysql.url");
        mysql = mysqlUrl != null;
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                mysqlUrl == null ? "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000" : mysqlUrl,
                mysqlUrl == null ? "sa" : "root", "");
        jdbc = new JdbcTemplate(dataSource);
        new ResourceDatabasePopulator(new ClassPathResource("migration/V2026.8.18.1__ai_agent.sql"))
                .execute(dataSource);
        jdbc.execute("alter table ai_agent_thread add column event_sequence_no bigint not null default 0");

        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new SpringManagedTransactionFactory(), dataSource));
        configuration.addMapper(AiAgentThreadMapper.class);
        configuration.addMapper(AiAgentEventMapper.class);
        var session = new SqlSessionTemplate(new MybatisSqlSessionFactoryBuilder().build(configuration));
        service = new AiAgentService();
        ReflectionTestUtils.setField(service, "threadMapper", session.getMapper(AiAgentThreadMapper.class));
        ReflectionTestUtils.setField(service, "eventMapper", session.getMapper(AiAgentEventMapper.class));
        transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        // H2 的 RR 锁定读取会拒绝已变化的行，不能替代 MySQL 的当前读。
        transactions.setIsolationLevel(mysql ? TransactionDefinition.ISOLATION_REPEATABLE_READ
                : TransactionDefinition.ISOLATION_READ_COMMITTED);
        transactions.setTimeout(10);
    }

    @BeforeEach
    void seedThread() {
        threadId = "thread-" + UUID.randomUUID();
        jdbc.update("insert into ai_agent_thread(thread_id, project_id, user_id, created_at, updated_at, event_sequence_no) values (?, 'project-1', 'user-1', 1, 1, 100)", threadId);
    }

    @Test
    void reservesLatestSequenceAfterAnotherTransactionCommitsBeyondItsSnapshot() {
        assumeTrue(mysql, "旧快照后的锁定当前读必须使用真实 MySQL 验证");
        var writer = Executors.newSingleThreadExecutor();
        try {
            transactions.executeWithoutResult(status -> {
                // 先建立旧快照，再让另一个事务完整写入事件并提交。
                assertEquals(100L, sequence());
                var committed = writer.submit(() -> transactions.executeWithoutResult(other ->
                        append("frontend.effect.completed")));
                try {
                    committed.get(5, TimeUnit.SECONDS);
                } catch (Exception error) {
                    throw new AssertionError("并发事件未能提交", error);
                }
                append("checkpoint.created");
            });

            assertEquals(102L, sequence());
            assertEquals(List.of(101L, 102L), eventSequences());
            assertEquals(List.of("frontend.effect.completed", "checkpoint.created"), jdbc.queryForList(
                    "select event_type from ai_agent_event where thread_id=? order by sequence_no", String.class, threadId));
        } finally {
            writer.shutdownNow();
        }
    }

    @Test
    void concurrentWritersPersistDistinctConsecutiveEvents() throws Exception {
        int count = 4;
        var writers = Executors.newFixedThreadPool(count);
        var start = new CountDownLatch(1);
        var finished = new ArrayList<java.util.concurrent.Future<?>>();
        try {
            for (int index = 0; index < count; index++) {
                finished.add(writers.submit(() -> {
                    try {
                        if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("并发写入未启动");
                    } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        throw new AssertionError(error);
                    }
                    transactions.executeWithoutResult(status -> append("checkpoint.created"));
                }));
            }
            start.countDown();
            for (var future : finished) future.get(5, TimeUnit.SECONDS);

            assertEquals(104L, sequence());
            assertEquals(List.of(101L, 102L, 103L, 104L), eventSequences());
        } finally {
            writers.shutdownNow();
        }
    }

    @Test
    void rollbackRevertsBothReservedSequenceAndEvent() {
        assertThrows(IllegalStateException.class, () -> transactions.executeWithoutResult(status -> {
            append("checkpoint.created");
            throw new IllegalStateException("模拟检查点事务失败");
        }));

        assertEquals(100L, sequence());
        assertEquals(List.of(), eventSequences());
        transactions.executeWithoutResult(status -> append("checkpoint.created"));
        assertEquals(101L, sequence());
        assertEquals(List.of(101L), eventSequences());
    }

    private void append(String type) {
        service.appendEvent(threadId, "turn-1", "run-1", type, Map.of());
    }

    private long sequence() {
        return jdbc.queryForObject("select event_sequence_no from ai_agent_thread where thread_id=?", Long.class, threadId);
    }

    private List<Long> eventSequences() {
        return jdbc.queryForList("select sequence_no from ai_agent_event where thread_id=? order by sequence_no", Long.class, threadId);
    }
}
