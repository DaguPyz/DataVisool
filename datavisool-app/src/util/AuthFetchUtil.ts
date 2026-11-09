/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import FetchUtil, {type FetchRequestInit} from "./FetchUtil.ts";
import AuthTools from "@/util/AuthTools.ts";
import {globalMessage} from "@datavisool/ui";
import responseHandler from "@/api/ReponseHandler.ts";

export interface AuthRequestInit extends FetchRequestInit {}

export class AuthRequestError extends Error {
    constructor(public readonly code: number, message: string) {
        super(message);
        this.name = "AuthRequestError";
    }
}

/**
 * 带有权限验证的Fetch工具类
 */
export default class AuthFetchUtil {
    public static async post<T>(url: string, data: any, options?: AuthRequestInit): Promise<T> {
        const loadingKey = options?.loadingText ? `${url}-${Date.now()}` : '';
        if (options?.loadingText) {
            globalMessage.openLoading({key: loadingKey, content: options.loadingText});
        }
        try {
            options = AuthFetchUtil.addToken(options);
            return await FetchUtil.post<T>(url, data, options);
        } finally {
            if (options?.loadingText) {
                globalMessage.destroy(loadingKey);
            }
        }
    }

    public static async postOrThrow<T>(url: string, data: any, options?: AuthRequestInit): Promise<T> {
        const loadingKey = options?.loadingText ? `${url}-${Date.now()}` : "";
        if (options?.loadingText) {
            globalMessage.openLoading({key: loadingKey, content: options.loadingText});
        }
        try {
            const requestOptions = AuthFetchUtil.addToken(options);
            const response = await FetchUtil.doRequest(
                url,
                "POST",
                requestOptions.headers as Record<string, string>,
                data,
                requestOptions,
            );
            if (response.code !== 200) {
                responseHandler(response, options);
                throw new AuthRequestError(response.code, response.msg || "请求失败");
            }
            return response.data as T;
        } finally {
            if (options?.loadingText) {
                globalMessage.destroy(loadingKey);
            }
        }
    }

    public static async get<T>(url: string, options?: AuthRequestInit): Promise<T> {
        const loadingKey = options?.loadingText ? `${url}-${Date.now()}` : '';
        if (options?.loadingText) {
            globalMessage.openLoading({key: loadingKey, content: options.loadingText});
        }
        try {
            options = AuthFetchUtil.addToken(options);
            return await FetchUtil.get<T>(url, options);
        } finally {
            if (options?.loadingText) {
                globalMessage.destroy(loadingKey);
            }
        }
    }

    public static async getOrThrow<T>(url: string, options?: AuthRequestInit): Promise<T> {
        const loadingKey = options?.loadingText ? `${url}-${Date.now()}` : '';
        if (options?.loadingText) globalMessage.openLoading({key: loadingKey, content: options.loadingText});
        try {
            const requestOptions = AuthFetchUtil.addToken(options);
            const response = await FetchUtil.doRequest(
                url, "GET", requestOptions.headers as Record<string, string>, {}, requestOptions,
            );
            if (response.code !== 200) {
                responseHandler(response, options);
                throw new AuthRequestError(response.code, response.msg || "请求失败");
            }
            return responseHandler(response, options) as T;
        } finally {
            if (options?.loadingText) globalMessage.destroy(loadingKey);
        }
    }

    private static addToken(options?: RequestInit): RequestInit {
        options = options || {};
        const token = AuthTools.getToken();
        options.headers = options.headers || {};
        (options.headers as any)['Authorization'] = `Bearer ${token}`;
        return options;
    }

}
