/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.config;

import org.springframework.core.env.Environment;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.channels.ServerSocketChannel;

/** Checks the resolved HTTP listener before any database initialization. */
public final class ServerPortCheck {
    private ServerPortCheck() {
    }

    public static void verify(Environment environment) {
        Integer port = environment.getProperty("server.port", Integer.class, 8080);
        if (port == 0 || port == -1 || "none".equalsIgnoreCase(environment.getProperty("spring.main.web-application-type"))) {
            return;
        }
        if (port < 1 || port > 65535) {
            throw new IllegalStateException("server.port 必须为 0、-1 或 1 到 65535 之间的端口号。");
        }
        String address = environment.getProperty("server.address");
        try {
            InetAddress bindAddress = address == null || address.isBlank() ? null : InetAddress.getByName(address.trim());
            try (ServerSocketChannel socket = ServerSocketChannel.open()) {
                socket.bind(new InetSocketAddress(bindAddress, port));
            }
        } catch (IOException | SecurityException e) {
            throw new IllegalStateException("DATAVISOOL_PORT_UNAVAILABLE port=" + port
                    + "：端口无法绑定，可能已被占用或监听地址不可用；请检查 server.port 和 server.address。", e);
        }
    }
}
