/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export interface APIConfig {
    //地址
    url?: string;
    //请求方式
    method?: 'get' | 'post' | 'put' | 'delete';
    //请求头
    headers?: Record<string, string> | string | (() => Promise<Record<string, string>> | Record<string, string>);
    //请求参数
    params?: Record<string, any> | string | (() => Promise<any> | any);
    //自动刷新
    autoFlush?: boolean;
    //刷新频率
    frequency?: number;
    //过滤器
    filter?: string;
}

export interface IDatabase {
    //数据库类型
    targetDb?: string;
    //查询sql语句
    sql?: string;
    //自动刷新
    autoFlush?: boolean;
    //刷新频率
    frequency?: number;
    //过滤器
    filter?: string;
}

export interface ICommonApi extends APIConfig {
    //公共apiId
    commonApiId?: string;
}

export interface IGlobalVariableDataConfigType {
    gvId?: string;
    filter?: string;
}

export interface IWebSocketConfig {
    url?: string;
    protocols?: string;
    filter?: string;
}

export interface IMQTTConfig {
    host?: string;
    port?: number;
    topics?: string;
    filter?: string;
    path?: string;
    clientId?: string;
    username?: string;
    password?: string;
    qos?: 0 | 1 | 2;
    connectTimeout?: number;
    keepalive?: number;
    clean?: boolean;
    reconnectPeriod?: number;
    protocolVersion?: number;
}

export interface IStaticData {
    value: any;
    filter?: string;
}

/**
 * 数据配置项
 */
export interface DataConfigType<D = any> {
    //数据来源方式
    sourceType?: 'static' | 'api' | 'database' | 'commonApi' | 'globalVariable' | 'webSocket' | 'mqtt';
    //组件最终数据属性（所有类型的数据源，产生的最终数据结果都应该赋值给该属性）
    value?: D;
    //静态数据(除了存放静态数据外，该属性还有动态数据的中转站的作用），其他动态数据获取到后统一都存放在静态数据中，需要使用到的时候再从静态数据中获取
    staticData?: IStaticData;
    apiData?: APIConfig;
    database?: IDatabase;
    commonApi?: ICommonApi;
    globalVariable?: IGlobalVariableDataConfigType;
    webSocket?: IWebSocketConfig;
    mqtt?: IMQTTConfig;
}