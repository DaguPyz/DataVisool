/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.zsq.datavisoolservice.config.WebUpdateProperties;
import com.zsq.datavisoolservice.mapper.WebUpdateSkipMapper;
import com.zsq.datavisoolservice.model.dto.WebUpdateCheckDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebUpdateServiceImplTest {

    private HttpServer server;
    private String latestVersion;
    private int responseStatus;

    @BeforeEach
    void startOfficialVersionServer() throws Exception {
        latestVersion = "2026.8.0";
        responseStatus = 200;
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/latest", exchange -> {
            byte[] body = ("{\"code\":200,\"data\":{\"version\":\"" + latestVersion + "\"}}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseStatus, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopOfficialVersionServer() {
        server.stop(0);
    }

    @Test
    void defaultsToDisabledWithoutAnOfficialVersionEndpoint() {
        WebUpdateProperties properties = new WebUpdateProperties();

        assertFalse(properties.isEnabled());
        assertEquals("", properties.getOfficialApiUrl());
        WebUpdateCheckDTO result = new WebUpdateServiceImpl(properties, mock(WebUpdateSkipMapper.class), new ObjectMapper())
                .check("2026.7.0", false);
        assertFalse(result.isAvailable());
        assertNull(result.getLatestVersion());
    }

    @Test
    void automaticallyHidesSkippedVersionButManualCheckCanShowItAgain() {
        WebUpdateSkipMapper skipMapper = mock(WebUpdateSkipMapper.class);
        when(skipMapper.selectCount(any(Wrapper.class))).thenReturn(1L);
        WebUpdateServiceImpl service = service(skipMapper);

        WebUpdateCheckDTO automaticResult = service.check("2026.7.0", false);
        WebUpdateCheckDTO manualResult = service.check("2026.7.0", true);

        assertFalse(automaticResult.isNeedUpgrade());
        assertEquals("2026.8.0", automaticResult.getLatestVersion());
        assertTrue(manualResult.isNeedUpgrade());
        assertEquals("2026.8.0", manualResult.getLatestVersion());
        verify(skipMapper).selectCount(any(Wrapper.class));
    }

    @Test
    void successfulCheckWithoutUpgradeReturnsOfficialVersion() {
        latestVersion = "2026.7.0";
        WebUpdateServiceImpl service = service(mock(WebUpdateSkipMapper.class));

        WebUpdateCheckDTO result = service.check("2026.7.0", false);

        assertFalse(result.isNeedUpgrade());
        assertEquals("2026.7.0", result.getLatestVersion());
    }

    @Test
    void failedOfficialRequestDoesNotReturnLatestVersion() {
        responseStatus = 503;
        WebUpdateServiceImpl service = service(mock(WebUpdateSkipMapper.class));

        WebUpdateCheckDTO result = service.check("2026.7.0", false);

        assertFalse(result.isNeedUpgrade());
        assertNull(result.getLatestVersion());
    }

    @Test
    void readsVersionFromSuccessfulOfficialResponse() throws Exception {
        String response = """
                {
                  "code": 200,
                  "msg": "success",
                  "data": {
                    "version": "2026.08.22",
                    "description": "版本说明",
                    "createTime": "2026-08-22 10:00:00"
                  }
                }
                """;

        assertEquals("2026.08.22", service(mock(WebUpdateSkipMapper.class)).readVersion(response));
    }

    @Test
    void ignoresOfficialResponseWhenCodeIsNotSuccess() throws Exception {
        assertNull(service(mock(WebUpdateSkipMapper.class))
                .readVersion("{\"code\":500,\"msg\":\"failed\",\"data\":{\"version\":\"2026.08.22\"}}"));
    }

    private WebUpdateServiceImpl service(WebUpdateSkipMapper skipMapper) {
        WebUpdateProperties properties = new WebUpdateProperties();
        properties.setEnabled(true);
        properties.setOfficialApiUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/latest");
        return new WebUpdateServiceImpl(properties, skipMapper, new ObjectMapper());
    }
}
