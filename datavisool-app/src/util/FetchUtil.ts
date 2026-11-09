/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import responseHandler, {type ResponseHandlerOptions} from "../api/ReponseHandler.ts";
import axios, {AxiosRequestConfig} from 'axios';

export interface HttpResponse {
    code: number;
    msg: string;
    data: any;
}

export interface FetchRequestInit extends RequestInit, ResponseHandlerOptions {
    loadingText?: string;
}

export default class FetchUtil {
    /**
     * GET请求
     * @param url
     * @param options
     */
    static async get<T>(url: string, options: FetchRequestInit = {}): Promise<T> {
        const config: AxiosRequestConfig = {
            method: 'GET',
            headers: options.headers as any,
            signal: options.signal as any,
        };
        const response = await FetchUtil.request(url, config);
        return responseHandler(response, options) as T;
    }

    /**
     * POST请求
     * @param url
     * @param data
     * @param options
     */
    static async post<T>(url: string, data: any, options: FetchRequestInit = {}): Promise<T> {
        const config: AxiosRequestConfig = {
            method: 'POST',
            headers: options.headers as any || {},
            signal: options.signal as any,
        };

        // 默认'Content-Type': 'application/json'
        if (!config.headers) {
            config.headers = {};
        }
        
        // 兼容 RequestInit 的 headers 可能为 Headers 对象的情况，虽然这里假定是 Record<string, string>
        // 但为了安全起见，如果是 Headers 对象需要处理，不过 AuthFetchUtil 传入的是 Record。
        // 简单处理：如果 config.headers 没有 Content-Type，则设置默认值。
        const headers = config.headers as Record<string, any>;
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const contentType = headers['Content-Type'];
        
        if (contentType === 'application/json') {
            config.data = data;
        } else if (contentType === 'application/x-www-form-urlencoded') {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(data)) {
                params.append(key, value as string);
            }
            config.data = params;
        } else if (contentType === 'multipart/form-data') {
            // multipart/form-data 不能直接设置 Content-Type，因为需要由浏览器自动生成
            delete headers['Content-Type'];
            if (data instanceof FormData) {
                config.data = data;
            } else {
                const formData = new FormData();
                data.values().forEach((value: any, key: string) => {
                    formData.append(key, value as Blob | string);
                })
                config.data = formData;
            }
        } else {
            // 默认处理为 text/plain
            config.data = data.toString();
        }
        
        const response = await FetchUtil.request(url, config);
        return responseHandler(response, options) as T;
    }

    /**
     * 请求的标准返回结果必须包含code、msg字段，data字段可选，且code为200时，data为有效数据
     * @param url
     * @param config
     * @private
     */
    private static async request(url: string, config: AxiosRequestConfig): Promise<HttpResponse> {
        config.url = url;
        // 强制返回 blob 以便于后续手动处理 Content-Type 逻辑，保持与 fetch 逻辑一致
        config.responseType = 'blob';

        try {
            const response = await axios(config);
            const contentType = response.headers['content-type'];
            const blob = response.data as Blob;

            if (contentType && contentType.includes('application/json')) {
                const text = await blob.text();
                // 某些情况下接口可能返回空，或者返回非 JSON 格式
                try {
                    const res = JSON.parse(text);
                    if (typeof res === 'object' && 'code' in res && 'msg' in res)
                        return res;
                    else
                        return {code: 200, msg: '操作成功', data: res};
                } catch (e) {
                    // JSON 解析失败，作为普通文本或对象返回
                    return {code: 200, msg: '操作成功', data: text};
                }
            } else if (contentType && (contentType.includes('text/html') || contentType.includes('text/plain'))) {
                const text = await blob.text();
                return {code: 200, msg: '操作成功', data: text}
            } else {
                return {code: 200, msg: '操作成功', data: blob}
            }
        } catch (error: any) {
            if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
                return {code: 200, msg: '请求已取消', data: null};
            }
            const response = error.response;
            return {
                code: response?.status ?? 500, 
                msg: response?.statusText ?? (error.message || 'Unknown Error'), 
                data: null
            };
        }
    }

    /**
     * 返回原生结果，不做任何封装
     * @param url
     * @param options
     * @private
     */
    private static async requestNativeResult(url: string, options: RequestInit = {}): Promise<any> {
        const config: AxiosRequestConfig = {
            method: options.method as any || 'GET',
            headers: options.headers as any,
            data: options.body, // 注意：fetch 的 body 在这里对应 axios 的 data
            url: url,
            responseType: 'blob',
            signal: options.signal as any,
        };

        try {
            const response = await axios(config);
            const contentType = response.headers['content-type'];
            const blob = response.data as Blob;

            if (contentType && contentType.includes('application/json')) {
                const text = await blob.text();
                return JSON.parse(text);
            } else if (contentType && (contentType.includes('text/html') || contentType.includes('text/plain'))) {
                return await blob.text();
            } else {
                return blob;
            }
        } catch (error: any) {
            if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
                return null;
            }
            console.error('请求错误:', error);
            return null;
        }
    }

    /**
     * 请求前置处理，返回处理后的url和options
     * @param url
     * @param method
     * @param headers
     * @param params
     * @private
     */
    private static doRequestBefore(url: string, method: string, headers: Record<string, string>, params: FormData | Record<string, any>, requestOptions: RequestInit = {}): {
        url: string,
        options: RequestInit
    } {
        const options: RequestInit = {
            method: method.toUpperCase(),
            headers: headers,
            signal: requestOptions.signal,
        };
        if (params) {
            if (method.toUpperCase() === 'GET') {
                if (params && Object.keys(params).length > 0) {
                    const queryString = new URLSearchParams(params as Record<string, string>).toString();
                    url = `${url}?${queryString}`;
                }
            } else {
                // 如果没有设置 Content-Type，默认为 application/json
                if (!options.headers) options.headers = {};
                if (!('Content-Type' in (options.headers as any))) {
                    (options.headers as any)['Content-Type'] = 'application/json';
                }
                
                // 这里我们不需要像 fetch 那样手动 stringify body，
                // 但为了保持 doRequestBefore 的返回类型一致（供 requestNativeResult 使用），
                // 我们暂时保留 fetch 的风格，但在调用 request/requestNativeResult 时再适配。
                // 不过 FetchUtil.post 已经处理了 body 构建。
                // 这里的 doRequestBefore 主要是为了构建参数。
                
                // 为了兼容 requestNativeResult 中直接使用 options.body
                const contentType = (options.headers as any)['Content-Type'];
                if (contentType === 'application/json') {
                    options.body = JSON.stringify(params);
                } else {
                     // 其他类型暂不处理，假设 params 已经合适或者会在 post 中处理
                     // 但 requestNativeResult 直接用 options.body
                     // 如果是 axios，requestNativeResult 需要把 body 赋给 data
                     // 如果是 json string，axios 会再 stringify 一次吗？
                     // 如果 data 是 string，axios 默认发送 string。
                     options.body = params as any;
                }
            }
        }
        return {url, options};
    }

    /**
     * 执行自定义请求，请求参数均通过外部指定，返回结果必须为HttpResponse对象，必须包含code、msg字段，data字段可选
     * @param url
     * @param method
     * @param headers
     * @param params
     */
    static async doRequest(url: string, method: string, headers: Record<string, string>, params: FormData | Record<string, any>, requestOptions: FetchRequestInit = {}): Promise<HttpResponse> {
        // doRequestBefore 构建了 url 和 options (包含 headers 和 body)
        // 我们需要把 options 转换回 axios config
        const reqInfo = FetchUtil.doRequestBefore(url, method, headers, params, requestOptions);
        
        // 此时 reqInfo.options.body 可能是 JSON string 或者原始对象（如果 doRequestBefore 没转的话）
        // 上面的 doRequestBefore 逻辑里，如果是 json 则转了 string。
        // 如果我们传 string 给 axios data，axios 会直接发出去。
        // 如果 Content-Type 是 application/json，axios 发送 string 是没问题的。
        
        const config: AxiosRequestConfig = {
            method: reqInfo.options.method as any,
            headers: reqInfo.options.headers as any,
            data: reqInfo.options.body,
            signal: reqInfo.options.signal as any,
        };
        
        return FetchUtil.request(reqInfo.url, config);
    }

    /**
     * 执行自定义请求，请求参数均通过外部指定，返回结果为接口原生结果
     * @param url
     * @param method
     * @param headers
     * @param params
     */
    static async doRequestNativeResult(url: string, method: string, headers: Record<string, string>, params: FormData | Record<string, any>, requestOptions: RequestInit = {}): Promise<object> {
        const reqInfo = FetchUtil.doRequestBefore(url, method, headers, params, requestOptions);
        return FetchUtil.requestNativeResult(reqInfo.url, reqInfo.options);
    }


}
