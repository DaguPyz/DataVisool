/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.config;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.mock.env.MockEnvironment;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.channels.ServerSocketChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class ServerPortCheckTest {
    @Test
    void occupiedConfiguredPortFailsAndAvailablePortPasses() throws Exception {
        int port;
        try (ServerSocketChannel listener = ServerSocketChannel.open()) {
            listener.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
            port = ((InetSocketAddress) listener.getLocalAddress()).getPort();
            MockEnvironment env = new MockEnvironment().withProperty("server.port", String.valueOf(port))
                    .withProperty("server.address", "127.0.0.1");
            IllegalStateException error = assertThrows(IllegalStateException.class, () -> ServerPortCheck.verify(env));
            assertTrue(error.getMessage().contains("DATAVISOOL_PORT_UNAVAILABLE port=" + port));
        }
        MockEnvironment env = new MockEnvironment().withProperty("server.port", String.valueOf(port))
                .withProperty("server.address", "127.0.0.1");
        assertDoesNotThrow(() -> ServerPortCheck.verify(env));
    }

    @Test
    void environmentOverrideTakesPrecedenceOverConfiguredPort() throws Exception {
        try (ServerSocketChannel listener = ServerSocketChannel.open()) {
            listener.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
            int port = ((InetSocketAddress) listener.getLocalAddress()).getPort();
            MockEnvironment env = new MockEnvironment().withProperty("server.port", "0")
                    .withProperty("server.address", "127.0.0.1");
            env.getPropertySources().addFirst(new SystemEnvironmentPropertySource("env", Map.of("SERVER_PORT", String.valueOf(port))));
            IllegalStateException error = assertThrows(IllegalStateException.class, () -> ServerPortCheck.verify(env));
            assertTrue(error.getMessage().contains("port=" + port));
        }
    }

    @Test
    void dynamicAndDisabledPortsDoNotProbeAListener() {
        assertDoesNotThrow(() -> ServerPortCheck.verify(new MockEnvironment().withProperty("server.port", "0")));
        assertDoesNotThrow(() -> ServerPortCheck.verify(new MockEnvironment().withProperty("server.port", "-1")));
        assertDoesNotThrow(() -> ServerPortCheck.verify(new MockEnvironment().withProperty("spring.main.web-application-type", "none")));
        assertThrows(IllegalStateException.class, () -> ServerPortCheck.verify(new MockEnvironment().withProperty("server.port", "65536")));
    }

    @Test
    void applicationStopsBeforeDatabaseCheckWhenPortIsOccupied() throws Exception {
        try (ServerSocketChannel listener = ServerSocketChannel.open()) {
            listener.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
            int port = ((InetSocketAddress) listener.getLocalAddress()).getPort();
            String classpath = System.getProperty("surefire.test.class.path", System.getProperty("java.class.path"));
            Path output = Files.createTempFile("datavisool-port-test-", ".log");
            try {
                Process process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                        "-cp", classpath, "com.zsq.datavisoolservice.DatavisoolServerApplication",
                        "--server.address=127.0.0.1", "--server.port=" + port,
                        "--spring.datasource.druid.url=jdbc:mysql://127.0.0.1:9/test",
                        "--spring.datasource.druid.username=test", "--spring.datasource.druid.password=synthetic")
                        .redirectErrorStream(true).redirectOutput(output.toFile()).start();
                try {
                    assertTrue(process.waitFor(30, TimeUnit.SECONDS), "application startup did not finish");
                    assertNotEquals(0, process.exitValue());
                    String log = Files.readString(output);
                    assertTrue(log.contains("DATAVISOOL_PORT_UNAVAILABLE port=" + port), log);
                    assertFalse(log.contains("正在测试数据库连接"), "database check must not run on a port conflict");
                } finally {
                    if (process.isAlive()) process.destroyForcibly();
                }
            } finally {
                Files.deleteIfExists(output);
            }
        }
    }
}
