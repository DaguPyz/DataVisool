/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.alibaba.fastjson2.JSONWriter;
import dev.langchain4j.http.client.HttpClient;
import dev.langchain4j.http.client.HttpClientBuilder;
import dev.langchain4j.http.client.HttpRequest;
import dev.langchain4j.http.client.SuccessfulHttpResponse;
import dev.langchain4j.http.client.sse.ServerSentEventListener;
import dev.langchain4j.http.client.sse.ServerSentEventParser;

import java.time.Duration;

/** SDK 会省略空 thinking；DeepSeek 工具请求仍需显式回传空 reasoning_content。 */
final class AiDeepSeekReasoningHttpClient {
    private AiDeepSeekReasoningHttpClient() { }

    static HttpClientBuilder builder(HttpClientBuilder delegate) {
        return new HttpClientBuilder() {
            @Override public Duration connectTimeout() { return delegate.connectTimeout(); }
            @Override public HttpClientBuilder connectTimeout(Duration timeout) { delegate.connectTimeout(timeout); return this; }
            @Override public Duration readTimeout() { return delegate.readTimeout(); }
            @Override public HttpClientBuilder readTimeout(Duration timeout) { delegate.readTimeout(timeout); return this; }
            @Override public HttpClient build() {
                HttpClient client = delegate.build();
                return new HttpClient() {
                    @Override public SuccessfulHttpResponse execute(HttpRequest request) {
                        return client.execute(withReasoning(request));
                    }

                    @Override public void execute(HttpRequest request, ServerSentEventParser parser, ServerSentEventListener listener) {
                        client.execute(withReasoning(request), parser, listener);
                    }
                };
            }
        };
    }

    private static HttpRequest withReasoning(HttpRequest request) {
        if (request.body() == null || request.body().isBlank()) return request;
        JSONObject body = JSON.parseObject(request.body());
        JSONArray tools = body.getJSONArray("tools");
        JSONArray messages = body.getJSONArray("messages");
        JSONObject thinking = body.getJSONObject("thinking");
        if (tools == null || tools.isEmpty() || messages == null
                || thinking != null && "disabled".equals(thinking.getString("type"))) return request;
        boolean changed = false;
        for (int i = 0; i < messages.size(); i++) {
            JSONObject message = messages.getJSONObject(i);
            if ("assistant".equals(message.getString("role")) && message.get("reasoning_content") == null) {
                message.put("reasoning_content", "");
                changed = true;
            }
        }
        if (!changed) return request;
        return HttpRequest.builder().method(request.method()).url(request.url()).headers(request.headers())
                .formDataFields(request.formDataFields()).formDataFiles(request.formDataFiles())
                .body(body.toJSONString(JSONWriter.Feature.WriteNulls)).build();
    }
}
