/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.global;

import lombok.Getter;

@Getter
public class AppException extends RuntimeException {

    private final int code;
    private final String msg;

    public AppException(int code, String msg) {
        super();
        this.code = code;
        this.msg = msg;
    }

    public AppException(AppStatusCode appStatusCode) {
        super();
        this.code = appStatusCode.code();
        this.msg = appStatusCode.message();
    }

    public AppException(AppStatusCode appStatusCode, String customMsg) {
        super();
        this.code = appStatusCode.code();
        this.msg = customMsg;
    }

}