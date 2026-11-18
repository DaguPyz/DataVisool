/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AuthTools from "@/util/AuthTools.ts";
import {globalMessage} from "@datavisool/ui";
import {HttpResponse} from "../util/FetchUtil.ts";

const unLoginHandler = () => {
    AuthTools.removeUser();
    //获取地址栏路由
    if (!window.location.pathname.includes('/login')) {
        const timer = setTimeout(() => {
            clearTimeout(timer);
            window.location.href = '/login';
        }, 2000)
    }
}

export interface ResponseHandlerOptions {
    suppressErrorMessage?: boolean | ((response: HttpResponse) => boolean);
    onSuccess?: (response: HttpResponse) => void;
    handleSessionExpiry?: boolean;
    onSessionExpiry?: () => void;
}

const responseHandler = (response: HttpResponse, options: ResponseHandlerOptions = {}): unknown => {
    const {code, msg} = response;
    if (code == 200) {
        options.onSuccess?.(response);
        return response.data;
    } else {
        if (code == 10002 && options.handleSessionExpiry !== false) (options.onSessionExpiry ?? unLoginHandler)();
        const suppressErrorMessage = typeof options.suppressErrorMessage === "function"
            ? options.suppressErrorMessage(response)
            : options.suppressErrorMessage === true;
        if (!suppressErrorMessage) {
            globalMessage?.messageApi?.error(msg)
        }
        return null;
    }
}

export default responseHandler;
