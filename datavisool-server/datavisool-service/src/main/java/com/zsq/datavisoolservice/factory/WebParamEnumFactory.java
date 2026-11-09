/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.factory;

import com.zsq.datavisoolservice.constants.BaseWebParamEnum;
import com.zsq.datavisoolservice.converter.WebParamEnumConverter;
import io.micrometer.common.lang.NonNullApi;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.convert.converter.ConverterFactory;

import java.util.HashMap;
import java.util.Map;

@NonNullApi
public class WebParamEnumFactory implements ConverterFactory<String, BaseWebParamEnum> {

    private static final Map<Class<? extends BaseWebParamEnum>, Converter<String, ? extends BaseWebParamEnum>> factoryMap = new HashMap<>();

    @SuppressWarnings("unchecked")
    @Override
    public <T extends BaseWebParamEnum> Converter<String, T> getConverter(Class<T> targetType) {
        Converter<String, ? extends BaseWebParamEnum> converter = factoryMap.get(targetType);
        if (converter == null) {
            converter = new WebParamEnumConverter<>(targetType);
            factoryMap.put(targetType, converter);
        }
        return (Converter<String, T>) converter;
    }
}