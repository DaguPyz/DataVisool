/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.config;

import com.zsq.datavisoolservice.factory.WebParamEnumFactory;
import com.zsq.datavisoolservice.global.AppStatusCode;
import jakarta.annotation.Nonnull;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurationSupport;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.io.File;
import java.util.List;

@Configuration
public class StaticSourceInterceptor extends WebMvcConfigurationSupport {

    @Override
    protected void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/index.html", "/favicon.ico")
                .addResourceLocations("classpath:/webapp/");
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/webapp/assets/");
        registry.addResourceHandler("/static/images/**").addResourceLocations("file:" + AppBaseConfig.getImagePath() + File.separator);
        registry.addResourceHandler("/static/covers/**").addResourceLocations("file:" + AppBaseConfig.getCoverPath() + File.separator);
        registry.addResourceHandler("/static/avatar/**").addResourceLocations("file:" + AppBaseConfig.getAvatarPath() + File.separator);
        registry.addResourceHandler("/static/components/**").addResourceLocations("file:" + AppBaseConfig.getRemoteComponentPath() + File.separator);
        registry.addResourceHandler("/static/font/**").addResourceLocations("file:" + AppBaseConfig.getFontPath() + File.separator);
        registry.addResourceHandler("/static/lib/**").addResourceLocations("file:" + AppBaseConfig.getDynamicScriptPath() + File.separator);
        registry.addResourceHandler("/static/logo/**").addResourceLocations("file:" + AppBaseConfig.getLogoPath() + File.separator);
        registry.addResourceHandler("/static/templateCover/**").addResourceLocations("file:" + AppBaseConfig.getTemplateCoverPath() + File.separator);
        registry.addResourceHandler("/static/videos/**").addResourceLocations("file:" + AppBaseConfig.getVideoPath() + File.separator);
        registry.addResourceHandler("/static/models/**").addResourceLocations("file:" + AppBaseConfig.getModelPath() + File.separator);
        super.addResourceHandlers(registry);
    }

    @Override
    protected void addFormatters(FormatterRegistry registry) {
        registry.addConverterFactory(new WebParamEnumFactory());
    }

    @Bean
    public WebMvcConfigurer webMvcConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void configureHandlerExceptionResolvers(@Nonnull List<HandlerExceptionResolver> resolvers) {
                resolvers.add((request, response, handler, ex) -> {
                    if (ex instanceof NoResourceFoundException) {
                        response.setStatus(AppStatusCode.NOT_FOUND.code());
                        return new ModelAndView();
                    }
                    return null;
                });
            }
        };
    }
}
