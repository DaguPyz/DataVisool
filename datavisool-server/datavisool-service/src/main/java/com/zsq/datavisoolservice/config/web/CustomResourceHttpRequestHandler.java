/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.config.web;

import jakarta.annotation.Nonnull;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.resource.ResourceHttpRequestHandler;

import java.io.IOException;

public class CustomResourceHttpRequestHandler extends ResourceHttpRequestHandler {
    @Override
    protected Resource getResource(@Nonnull HttpServletRequest request) throws IOException {
        Resource resource = super.getResource(request);
        if (resource == null || !resource.exists()) {
            return null; // 返回 null，触发 404
        }
        return resource;
    }
}