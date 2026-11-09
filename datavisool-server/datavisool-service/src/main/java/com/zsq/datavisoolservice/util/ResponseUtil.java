/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.util;

import com.alibaba.fastjson2.JSON;

import java.util.HashMap;
import java.util.Map;

public class ResponseUtil {
    public static <T> String responseJson(int code, String msg, T data) {
        Map<String, Object> body = new HashMap<>();
        body.put("code", code);
        body.put("msg", msg);
        body.put("data", data);
        return JSON.toJSONString(body);
    }

    public static String responseJson(int code, String msg) {
        return responseJson(code, msg, null);
    }
}
