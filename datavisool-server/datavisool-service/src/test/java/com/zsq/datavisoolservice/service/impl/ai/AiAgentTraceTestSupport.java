/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.Logger;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.layout.PatternLayout;

import java.util.ArrayList;
import java.util.List;

/** 捕获实际日志出口，验证运行插桩而非只验证手工生成的载荷。 */
final class AiAgentTraceTestSupport implements AutoCloseable {
    private final Logger logger = (Logger) LogManager.getLogger(AiAgentDebugTrace.class);
    private final Level previous = logger.getLevel();
    final List<JSONObject> records = new ArrayList<>();
    private final AbstractAppender appender = new AbstractAppender("trace-test", null, PatternLayout.createDefaultLayout(), false, null) {
        @Override public void append(LogEvent event) {
            String message = event.getMessage().getFormattedMessage();
            if (message.startsWith(AiAgentDebugTrace.PREFIX)) records.add(JSON.parseObject(message.substring(AiAgentDebugTrace.PREFIX.length())));
        }
    };

    AiAgentTraceTestSupport() { appender.start(); logger.addAppender(appender); logger.setLevel(Level.DEBUG); }
    @Override public void close() { logger.removeAppender(appender); logger.setLevel(previous); appender.stop(); }
}
