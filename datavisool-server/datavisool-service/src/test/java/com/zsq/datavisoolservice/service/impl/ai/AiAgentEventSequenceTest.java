/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.mapper.AiAgentEventMapper;
import com.zsq.datavisoolservice.mapper.AiAgentThreadMapper;
import com.zsq.datavisoolservice.model.po.AiAgentEventPO;
import com.zsq.datavisoolservice.model.po.AiAgentThreadPO;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AiAgentEventSequenceTest {
    @Test
    void allocatesTheNextSequenceWithOptimisticVersionRetry() throws Exception {
        AiAgentService service = new AiAgentService();
        List<AiAgentEventPO> inserted = new ArrayList<>();
        AtomicInteger reads = new AtomicInteger();
        AtomicInteger updates = new AtomicInteger();
        setField(service, "threadMapper", mapper(AiAgentThreadMapper.class, (method, arguments) -> {
            if ("selectOne".equals(method.getName())) {
                return thread(reads.getAndIncrement() == 0 ? 187L : 188L);
            }
            if ("update".equals(method.getName())) {
                return updates.getAndIncrement() == 0 ? 0 : 1;
            }
            return defaultValue(method.getReturnType());
        }));
        setField(service, "eventMapper", mapper(AiAgentEventMapper.class, (method, arguments) -> {
            if ("insert".equals(method.getName())) {
                inserted.add((AiAgentEventPO) arguments[0]);
                return 1;
            }
            return defaultValue(method.getReturnType());
        }));

        service.appendEvent("thread-1", "turn-1", "run-1", "frontend.effect.completed", Map.of());

        assertEquals(2, updates.get());
        assertEquals(1, inserted.size());
        assertEquals(189L, inserted.get(0).getSequenceNo());
    }

    @Test
    void reportsAConflictInsteadOfWritingAnAmbiguousEvent() throws Exception {
        AiAgentService service = new AiAgentService();
        setField(service, "threadMapper", mapper(AiAgentThreadMapper.class, (method, arguments) -> {
            if ("selectOne".equals(method.getName())) {
                return thread(187L);
            }
            if ("update".equals(method.getName())) {
                return 0;
            }
            return defaultValue(method.getReturnType());
        }));
        setField(service, "eventMapper", mapper(AiAgentEventMapper.class,
                (method, arguments) -> defaultValue(method.getReturnType())));

        AiAgentService.EventSequenceConflictException error = assertThrows(
                AiAgentService.EventSequenceConflictException.class,
                () -> service.appendEvent("thread-1", "turn-1", "run-1", "frontend.effect.completed", Map.of())
        );

        assertEquals(409, error.getCode());
        assertEquals("AI Agent 事件序号并发冲突，操作未完成，请重试", error.getMsg());
    }

    private AiAgentThreadPO thread(long sequenceNo) {
        AiAgentThreadPO thread = new AiAgentThreadPO();
        thread.setThreadId("thread-1");
        thread.setEventSequenceNo(sequenceNo);
        return thread;
    }

    private void setField(Object target, String name, Object value) throws Exception {
        Field field = AiAgentService.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    @SuppressWarnings("unchecked")
    private <T> T mapper(Class<T> type, MapperHandler handler) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class[]{type}, (proxy, method, arguments) ->
                handler.invoke(method, arguments == null ? new Object[0] : arguments));
    }

    private Object defaultValue(Class<?> type) {
        if (!type.isPrimitive()) {
            return null;
        }
        if (type == boolean.class) {
            return false;
        }
        if (type == int.class) {
            return 0;
        }
        if (type == long.class) {
            return 0L;
        }
        if (type == double.class) {
            return 0D;
        }
        if (type == float.class) {
            return 0F;
        }
        if (type == short.class) {
            return (short) 0;
        }
        if (type == byte.class) {
            return (byte) 0;
        }
        if (type == char.class) {
            return (char) 0;
        }
        return null;
    }

    @FunctionalInterface
    private interface MapperHandler {
        Object invoke(java.lang.reflect.Method method, Object[] arguments);
    }
}
