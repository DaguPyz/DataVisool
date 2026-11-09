/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.converter;

import com.zsq.datavisoolservice.constants.BaseWebParamEnum;
import jakarta.annotation.Nonnull;
import org.springframework.core.convert.converter.Converter;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

public class WebParamEnumConverter<T extends BaseWebParamEnum> implements Converter<String, T> {
    private final Map<String, T> webParamEnumMap = new HashMap<>();

    public WebParamEnumConverter(Class<T> enumType) {
        Arrays.stream(enumType.getEnumConstants()).forEach(item -> webParamEnumMap.put(item.getCode() + "", item));
    }

    @Override
    public T convert(@Nonnull String source) {
        return webParamEnumMap.get(source);
    }
}