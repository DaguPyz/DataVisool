/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.global;

import com.zsq.datavisoolservice.config.RequestPathClassifier;
import jakarta.servlet.ServletContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.log4j.Log4j2;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@Log4j2
@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(Exception.class)
    @ResponseBody
    public <T> ApiResponse<T> exceptionHandler(Exception e) throws Exception {
        //打印堆栈信息
        log.error("GlobalExceptionHandler exceptionHandler: ", e);
        //SpringSecurity的认证异常和权限异常交给SpringSecurity的异常处理器处理
        if (e instanceof AuthenticationException || e instanceof AccessDeniedException)
            throw e;
        if (e instanceof NoHandlerFoundException || e instanceof NoResourceFoundException)
            throw e;

        if (e instanceof AppException appException)
            return ApiResponse.error(appException.getCode(), appException.getMsg());
        if (e instanceof ProjectComponentConversionException conversionException)
            return ApiResponse.error(AppStatusCode.INVALID_PARAM.code(), conversionException.getMessage());
        if (e instanceof com.zsq.datavisoolservice.service.impl.ai.ComponentDocumentParser.DocumentException documentException)
            return ApiResponse.error(400, documentException.getMessage());

        //如果拦截的异常不是我们自定义的异常(例如：数据库主键冲突)
        return ApiResponse.error(AppStatusCode.SYSTEM_ERR.code(), AppStatusCode.SYSTEM_ERR.message());
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public void handleNoHandlerFound(NoHandlerFoundException ex,
                                     HttpServletRequest request,
                                     HttpServletResponse response) throws Exception {
        String uri = request.getRequestURI();
        if (RequestPathClassifier.isFrontendRoutePath(uri)) {
            forwardToFrontendEntry(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_NOT_FOUND);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public void handleNoResourceNotFound(NoResourceFoundException ex,
                                         HttpServletRequest request,
                                         HttpServletResponse response) throws Exception {
        String uri = request.getRequestURI();
        if (RequestPathClassifier.isFrontendRoutePath(uri)) {
            forwardToFrontendEntry(request, response);
            return;
        }
        if (RequestPathClassifier.isStaticResourceRequestPath(uri)) {
            ServletContext servletContext = request.getServletContext();
            String mimeType = servletContext.getMimeType(uri); // 自动根据后缀识别
            response.setContentType(mimeType != null ? mimeType : "application/octet-stream");
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentLength(0);
            return;
        }
        throw ex;
    }

    private void forwardToFrontendEntry(HttpServletRequest request, HttpServletResponse response) throws Exception {
        response.setStatus(HttpServletResponse.SC_OK);
        request.getRequestDispatcher("/index.html").forward(request, response);
    }

}
