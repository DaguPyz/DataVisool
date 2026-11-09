/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.util;

public class Base64Util {
    /**
     * base64编码
     *
     * @param str 待编码的字符串
     * @return 编码后的字符串
     */
    public static String encode(String str) {
        return java.util.Base64.getEncoder().encodeToString(str.getBytes());
    }

    /**
     * base64解码
     *
     * @param str 待解码的字符串
     * @return 解码后的字符串
     */
    public static String decode(String str) {
        return new String(java.util.Base64.getDecoder().decode(str));
    }
}
