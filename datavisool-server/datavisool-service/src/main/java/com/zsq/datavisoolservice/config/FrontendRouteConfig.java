/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.config;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.web.servlet.error.ErrorViewResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.ModelAndView;

import java.util.Map;

@Configuration
public class FrontendRouteConfig {

    @Bean
    public ErrorViewResolver spaRouteFallbackErrorViewResolver() {
        return (request, status, model) -> {
            String requestUri = resolveRequestUri(request);
            if (status == HttpStatus.NOT_FOUND && RequestPathClassifier.isFrontendRoutePath(requestUri)) {
                return new ModelAndView("forward:/index.html", Map.of(), HttpStatus.OK);
            }
            return null;
        };
    }

    private String resolveRequestUri(HttpServletRequest request) {
        Object errorRequestUri = request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI);
        if (errorRequestUri instanceof String uri && !uri.isBlank()) {
            return uri;
        }
        return request.getRequestURI();
    }
}
