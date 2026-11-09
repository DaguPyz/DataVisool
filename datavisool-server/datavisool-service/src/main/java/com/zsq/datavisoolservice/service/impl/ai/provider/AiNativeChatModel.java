/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.exception.HttpException;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** 原生协议共用传输，支持 SSE、NDJSON 和整个流的超时；不执行模型请求的隐式重试。 */
final class AiNativeChatModel implements ChatModel {
    static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(180);
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();
    private static final ScheduledExecutorService TIMEOUTS = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "ai-native-stream-timeout");
        thread.setDaemon(true);
        return thread;
    });
    private final AiModelConfig config;
    private final AiNativeCodec codec;
    private final Duration timeout;

    AiNativeChatModel(AiModelConfig config, AiNativeCodec codec, Duration timeout) {
        this.config = config;
        this.codec = codec;
        this.timeout = timeout;
    }

    @Override
    public ChatResponse doChat(ChatRequest request) {
        try {
            HttpResponse<String> response = HTTP.send(httpRequest(request, false), HttpResponse.BodyHandlers.ofString());
            checkStatus(response.statusCode());
            return codec.response(JSON.parseObject(response.body()));
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("模型请求已中断", error);
        } catch (IOException error) {
            throw new IllegalStateException("厂商原生接口连接失败", error);
        }
    }

    StreamingChatModel streaming() {
        return new StreamingChatModel() {
            @Override
            public void doChat(ChatRequest request, StreamingChatResponseHandler handler) {
                CompletableFuture.runAsync(() -> readStream(request, handler));
            }
        };
    }

    private HttpRequest httpRequest(ChatRequest request, boolean stream) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(codec.url(config, request))).timeout(timeout)
                .header("Content-Type", "application/json")
                .header("Accept", stream ? (codec.ndjson() ? "application/x-ndjson" : "text/event-stream") : "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(codec.request(config, request, stream).toJSONString()));
        codec.headers(config, stream).forEach(builder::header);
        return builder.build();
    }

    private void readStream(ChatRequest request, StreamingChatResponseHandler handler) {
        AtomicBoolean finished = new AtomicBoolean();
        AtomicReference<InputStream> input = new AtomicReference<>();
        StreamingChatResponseHandler guarded = new StreamingChatResponseHandler() {
            @Override
            public void onPartialResponse(String text) {
                if (!finished.get()) handler.onPartialResponse(text);
            }

            @Override
            public void onCompleteResponse(ChatResponse response) {
                if (finished.compareAndSet(false, true)) handler.onCompleteResponse(response);
            }

            @Override
            public void onError(Throwable error) {
                if (finished.compareAndSet(false, true)) handler.onError(error);
            }
        };
        var deadline = TIMEOUTS.schedule(() -> {
            guarded.onError(new TimeoutException("厂商原生流式请求超时"));
            close(input.get());
        }, timeout.toMillis(), TimeUnit.MILLISECONDS);
        try {
            HttpResponse<InputStream> response = HTTP.send(httpRequest(request, true), HttpResponse.BodyHandlers.ofInputStream());
            input.set(response.body());
            try (InputStream body = response.body()) {
                if (finished.get()) return;
                checkStatus(response.statusCode());
                String contentType = response.headers().firstValue("content-type").orElse("");
                if (!codec.ndjson() && contentType.contains("application/json")) {
                    guarded.onCompleteResponse(codec.response(JSON.parseObject(new String(body.readAllBytes(), StandardCharsets.UTF_8))));
                    return;
                }
                AiNativeCodec.StreamDecoder decoder = codec.stream(guarded);
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8))) {
                    StringBuilder data = new StringBuilder();
                    for (String line; !finished.get() && (line = reader.readLine()) != null;) {
                        if (codec.ndjson()) {
                            if (!line.isBlank()) decoder.accept(JSON.parseObject(line));
                        } else if (line.isEmpty()) {
                            acceptData(data, decoder);
                        } else if (line.startsWith("data:")) {
                            if (!data.isEmpty()) data.append('\n');
                            data.append(line.substring(5).stripLeading());
                        }
                    }
                    acceptData(data, decoder);
                }
                if (!finished.get()) guarded.onCompleteResponse(decoder.finish());
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            guarded.onError(error);
        } catch (Exception error) {
            guarded.onError(error);
        } finally {
            deadline.cancel(false);
        }
    }

    private static void acceptData(StringBuilder data, AiNativeCodec.StreamDecoder decoder) {
        String value = data.toString();
        data.setLength(0);
        if (!value.isBlank() && !"[DONE]".equals(value)) decoder.accept(JSON.parseObject(value));
    }

    private static void checkStatus(int status) {
        if (status < 200 || status >= 300) throw new HttpException(status, "厂商原生接口返回 HTTP " + status);
    }

    private static void close(InputStream input) {
        if (input == null) return;
        try { input.close(); } catch (IOException ignored) { }
    }
}
