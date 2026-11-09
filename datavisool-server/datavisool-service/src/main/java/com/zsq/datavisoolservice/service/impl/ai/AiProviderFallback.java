/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.exception.HttpException;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** 原生协议失败后在当前模型实例中使用兼容协议；已输出内容的流禁止重放。 */
final class AiProviderFallback {
    private static final Logger log = LoggerFactory.getLogger(AiProviderFallback.class);
    private AiProviderFallback() { }

    static ChatModel chat(String provider, ChatModel nativeModel, ChatModel compatibleModel) {
        return new ChatModel() {
            private final AtomicBoolean compatible = new AtomicBoolean();

            @Override
            public ChatResponse doChat(ChatRequest request) {
                if (compatible.get()) return chatCompatible(compatibleModel, request, null);
                try {
                    return nativeModel.chat(request);
                } catch (RuntimeException failure) {
                    if (!canFallback(failure)) throw failure;
                    compatible.set(true);
                    log.info("AI provider {} switching to OpenAI-compatible protocol", provider);
                    return chatCompatible(compatibleModel, request, failure);
                }
            }
        };
    }

    private static ChatResponse chatCompatible(ChatModel model, ChatRequest request, Throwable nativeFailure) {
        try {
            return model.chat(request);
        } catch (RuntimeException failure) {
            throw new FallbackFailedException(failure, nativeFailure);
        }
    }

    static StreamingChatModel streaming(String provider, StreamingChatModel nativeModel,
                                        StreamingChatModel compatibleModel) {
        return new StreamingChatModel() {
            private final AtomicBoolean compatible = new AtomicBoolean();

            @Override
            public void doChat(ChatRequest request, StreamingChatResponseHandler handler) {
                AiModelWireTrace.Context wireContext = AiModelWireTrace.capture();
                if (compatible.get()) {
                    streamOnce(compatibleModel, request, guard(handler, failure -> handler.onError(new FallbackFailedException(failure, null))));
                    return;
                }
                StreamingChatResponseHandler guarded = guard(handler, failure -> {
                    if (!canFallback(failure)) {
                        handler.onError(failure);
                        return;
                    }
                    compatible.set(true);
                    log.info("AI provider {} switching streaming to OpenAI-compatible protocol", provider);
                    AiModelWireTrace.withContext(wireContext, () -> streamOnce(compatibleModel, request, guard(handler, fallbackFailure -> {
                        handler.onError(new FallbackFailedException(fallbackFailure, failure));
                    })));
                });
                streamOnce(nativeModel, request, guarded);
            }
        };
    }

    private static void streamOnce(StreamingChatModel model, ChatRequest request, StreamingChatResponseHandler handler) {
        try {
            model.chat(request, handler);
        } catch (RuntimeException failure) {
            handler.onError(failure);
        }
    }

    private static StreamingChatResponseHandler guard(StreamingChatResponseHandler handler, Consumer<Throwable> beforeOutputError) {
        AtomicBoolean started = new AtomicBoolean();
        AtomicBoolean finished = new AtomicBoolean();
        return new StreamingChatResponseHandler() {
            @Override
            public void onPartialResponse(String text) {
                if (finished.get()) return;
                if (text != null && !text.isEmpty()) started.set(true);
                handler.onPartialResponse(text);
            }

            @Override
            public void onPartialResponse(PartialResponse response, PartialResponseContext context) {
                if (finished.get()) return;
                started.set(true);
                handler.onPartialResponse(response, context);
            }

            @Override
            public void onPartialThinking(PartialThinking thinking) {
                if (finished.get()) return;
                started.set(true);
                handler.onPartialThinking(thinking);
            }

            @Override
            public void onPartialThinking(PartialThinking thinking, PartialThinkingContext context) {
                if (finished.get()) return;
                started.set(true);
                handler.onPartialThinking(thinking, context);
            }

            @Override
            public void onPartialToolCall(PartialToolCall call) {
                if (finished.get()) return;
                started.set(true);
                handler.onPartialToolCall(call);
            }

            @Override
            public void onPartialToolCall(PartialToolCall call, PartialToolCallContext context) {
                if (finished.get()) return;
                started.set(true);
                handler.onPartialToolCall(call, context);
            }

            @Override
            public void onCompleteToolCall(CompleteToolCall call) {
                if (finished.get()) return;
                started.set(true);
                handler.onCompleteToolCall(call);
            }

            @Override
            public void onCompleteResponse(ChatResponse response) {
                if (finished.compareAndSet(false, true)) handler.onCompleteResponse(response);
            }

            @Override
            public void onError(Throwable failure) {
                if (!finished.compareAndSet(false, true)) return;
                if (started.get()) {
                    handler.onError(new ResponseStartedException(failure));
                } else beforeOutputError.accept(failure);
            }
        };
    }

    static boolean canFallback(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof CancellationException || cause instanceof InterruptedException
                    || cause instanceof ResponseStartedException || cause instanceof FallbackFailedException) return false;
            if (cause instanceof HttpException http
                    && (http.statusCode() == 401 || http.statusCode() == 403 || http.statusCode() == 429)) return false;
        }
        return !Thread.currentThread().isInterrupted();
    }

    static final class ResponseStartedException extends RuntimeException {
        ResponseStartedException(Throwable cause) {
            super("模型流式输出中断，请从当前检查点继续", cause);
        }
    }

    static final class FallbackFailedException extends RuntimeException {
        FallbackFailedException(Throwable failure, Throwable nativeFailure) {
            super("模型兼容接口调用失败：" + failure.getMessage(), failure);
            if (nativeFailure != null && nativeFailure != failure) addSuppressed(nativeFailure);
        }
    }
}
