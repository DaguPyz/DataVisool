/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.global;

public enum AppStatusCode {

    /****************** 正常状态码 ******************/
    SUCCESS(0, "成功"),

    /****************** 通用错误 ******************/
    INVALID_PARAM(10001, "参数无效"),
    UN_LOGGED_IN(10002, "用户未登录"),
    UNAUTHORIZED(10003, "用户无权限"),
    NOT_FOUND(10004, "资源不存在"),
    SYSTEM_ERR(10005, "系统错误, 请联系管理员"),
    USER_EXISTS(10006, "用户已存在"),
    UNABLE_ESTABLISH_CONNECTION(10007, "无法建立连接"),
    DATA_EXCEPTION(10008, "数据异常"),
    PWD_ERR(10010, "密码错误"),
    USER_NOT_EXIST(10011, "用户不存在"),
    ACCOUNT_EXPIRED(10012, "账户已过期"),
    ;


    private final int code;
    private final String message;

    AppStatusCode(int code, String message) {
        this.code = code;
        this.message = message;
    }

    public int code() {
        return code;
    }

    public String message() {
        return message;
    }
}
