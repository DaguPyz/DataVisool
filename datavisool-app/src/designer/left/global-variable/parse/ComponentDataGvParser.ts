/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {WebDatabaseConfig as IDatabase} from "@/types/WebDataSourceTypes.ts";
import {APIConfig, DataConfigType, ICommonApi, IMQTTConfig, IWebSocketConfig} from "@datavisool/sdk/types";
import {cloneDeep} from "lodash";
import {globalMessage} from "@datavisool/ui";
import AbstractDesignerController from "@/framework/core/AbstractDesignerController.ts";
import type DesignerManager from "@/designer/manager/DesignerManager.ts";

/**
 * 组件数据配置与全局变量的绑定解析器
 * 该类的设计目的为：
 * 1. 计算组件配置并与全局变量绑定
 * 2. 解析数据配置并替换数据配置中的全局变量表达式为全局变量的值
 * 全局变量仅针对api、公共api、数据库配置
 * if 出现 #{} 符号，则认为当前组件的数据配置需要与全局变量绑定。
 * if 没有 #{} 符号，则认为当前组件的数据配置与全局变量无关。如果之前已经绑定，则需要解绑
 */
class ComponentDataGvParser {

    private static REGX = /#\{[-_0-9a-zA-Z]+}/g;

    /**
     * 解除组件数据配置与全局变量的绑定
     * @param componentIds 组件id列表
     */
    public unbindFromGv(componentIds: string[]): void {
        const {globalVariableInstance} = window.DATAVISOOL_ENV.currentManager.globalVariableManager
        if (!componentIds || componentIds?.length === 0 || !globalVariableInstance)
            return;
        Object.values(globalVariableInstance).forEach((gv) => {
            componentIds.forEach((componentId) => {
                if (gv.bindTarget.includes(componentId))
                    gv.bindTarget = gv.bindTarget.filter(id => id !== componentId);
            })
        })
    }

    public bindConfigToGvById(componentIds: string[]): void {
        if (!window.DATAVISOOL_ENV.currentManager.layerManager?.controllers || !componentIds || componentIds?.length === 0)
            return;
        componentIds.forEach((componentId) => {
            const controller = window.DATAVISOOL_ENV.currentManager.layerManager?.controllers![componentId];
            if (controller)
                this.bindConfigToGv(controller);
        })
    }


    /**
     * 通过组件id与全局变量id进行直接绑定，适用于全局变量作为数据源的场景
     */
    public directBindByCompIdAndGvId(componentId: string, gvId: string): void {
        const {globalVariableInstance} = window.DATAVISOOL_ENV.currentManager.globalVariableManager;
        if (globalVariableInstance && globalVariableInstance[gvId]) {
            const gvs = Object.values(globalVariableInstance);
            //清除之前的绑定关系
            gvs.forEach(gv => {
                if (gv.bindTarget.includes(componentId))
                    gv.bindTarget = gv.bindTarget.filter(id => id !== componentId);
            })
            if (!globalVariableInstance[gvId].bindTarget.includes(componentId))
                globalVariableInstance[gvId].bindTarget.push(componentId);
        }
    }

    /**
     * 组件数据配置绑定到全局变量
     */
    public bindConfigToGv(controller: AbstractDesignerController): string[] {
        const {globalVariableInstance} = window.DATAVISOOL_ENV.currentManager.globalVariableManager;
        if (!controller?.getConfig()?.data || !globalVariableInstance)
            return [];
        const {base: {id: componentId}, data: dataConfig} = controller.getConfig();
        const gvs = Object.values(globalVariableInstance);
        const gvIds = [];
        //清除之前的绑定关系
        gvs.forEach(gv => {
            if (gv.bindTarget.includes(componentId))
                gv.bindTarget = gv.bindTarget.filter(id => id !== componentId);
        })

        const {apiData, commonApi, database, webSocket, mqtt, sourceType} = dataConfig as DataConfigType;

        //数据源版本是全局变量则直接绑定，无需单独解析
        if (sourceType === 'globalVariable') {
            this.directBindByCompIdAndGvId(componentId, dataConfig.globalVariable.gvId);
            gvIds.push(dataConfig.globalVariable.gvId);
            return gvIds;
        }

        const gvKeyToIdMap = gvs.reduce((acc: any, cur) => {
            acc[cur.key] = cur.getGlobalVariable().id;
            return acc;
        }, {})

        if (apiData) {
            //解析api配置
            const {url, params, headers, filter} = apiData;
            const allStr = url + JSON.stringify(params) + JSON.stringify(headers) + filter;
            const matchArray = allStr.match(ComponentDataGvParser.REGX) ?? [];
            const tempGvIds = this.doBind(matchArray, gvKeyToIdMap, componentId, globalVariableInstance);
            if (tempGvIds.length > 0)
                gvIds.push(...tempGvIds);
        }

        if (commonApi) {
            //解析公共api配置
            const {filter} = commonApi;
            if (!filter)
                return gvIds;
            const matchArray = filter.match(ComponentDataGvParser.REGX) ?? [];
            const tempGvIds = this.doBind(matchArray, gvKeyToIdMap, componentId, globalVariableInstance);
            if (tempGvIds.length > 0)
                gvIds.push(...tempGvIds);
        }

        if (database) {
            //解析数据库配置
            const {sql = '', filter = ''} = database;
            if (filter === '' && sql === '')
                return gvIds;
            const matchArray = (sql + filter).match(ComponentDataGvParser.REGX) ?? [];
            const tempGvIds = this.doBind(matchArray, gvKeyToIdMap, componentId, globalVariableInstance);
            if (tempGvIds.length > 0)
                gvIds.push(...tempGvIds);
        }

        if (webSocket) {
            const {url = '', filter = ''} = webSocket;
            if (!url && !filter)
                return gvIds;
            const matchArray = (url + filter).match(ComponentDataGvParser.REGX) ?? [];
            const tempGvIds = this.doBind(matchArray, gvKeyToIdMap, componentId, globalVariableInstance);
            if (tempGvIds.length > 0)
                gvIds.push(...tempGvIds);
        }

        if (mqtt) {
            const {host = '', filter = '', topics = ''} = mqtt;
            if (!host && !filter && !topics)
                return gvIds;
            const matchArray = (host + filter + topics).match(ComponentDataGvParser.REGX) ?? [];
            const tempGvIds = this.doBind(matchArray, gvKeyToIdMap, componentId, globalVariableInstance);
            if (tempGvIds.length > 0)
                gvIds.push(...tempGvIds);
        }
        return gvIds;
    }

    /**
     * 提取全局变量表达式中的全局变量key
     * 全局变量表达式形如 #{key}
     */
    private extractGvKey(expression: string): string | null {
        if (!expression || expression?.length < 3 || !expression?.startsWith('#{') || !expression?.endsWith('}'))
            return null;
        const gv = expression.substring(2, expression.length - 1);
        if (gv.includes('.')) {
            return gv.split('.')[0];
        } else
            return gv;
    }

    /**
     * 执行绑定
     * @param matchExpressions 匹配到的全局变量的表达式
     * @param gvKeyToIdMap 全局变量key与id的映射
     * @param compId 组件id
     * @param globalVariableInstance 全局变量实例映射
     */
    private doBind(matchExpressions: string[], gvKeyToIdMap: Record<string, string>, compId: string, globalVariableInstance: Record<string, any>): string[] {
        const gvIds: string[] = [];
        if (matchExpressions && matchExpressions.length > 0) {
            matchExpressions.forEach(expression => {
                const key = this.extractGvKey(expression);
                const gvId = gvKeyToIdMap[key!];
                if (gvId) {
                    const gv = globalVariableInstance[gvId];
                    if (!gv.bindTarget.includes(compId))
                        gv.bindTarget.push(compId);
                    gvIds.push(gvId);
                }
            })
        }
        return gvIds;
    }

    /**
     * 匹配全局变量
     * @param configStr
     * @param gvKeyToIdMap
     * @param matchCallback
     * @private
     */
    private doMatchGv(configStr: string, gvKeyToIdMap: Record<string, string>, matchCallback: (expression: string, gvValue: any) => void, globalVariableInstance: Record<string, any>): void {
        const matched = configStr?.match(ComponentDataGvParser.REGX);
        if (matched && matched.length > 0 && globalVariableInstance) {
            matched.forEach(expression => {
                const key = this.extractGvKey(expression);
                if (gvKeyToIdMap[key!]) {
                    const gv = globalVariableInstance![gvKeyToIdMap[key!]];
                    const gvValue = gv.getGlobalVariable().value;
                    if (!gvValue)
                        console.warn(`全局变量${key}的值为空`)
                    matchCallback(expression, gvValue);
                } else {
                    globalMessage.messageApi?.info(`全局变量${key}未定义`)
                }
            })
        }
    }

    /**
     * 解析前置操作
     * @param config
     * @param configProcess
     */
    private parse<T>(config: T, configProcess: (config: T, gvKeyToIdMap: Record<string, string>, globalVariableInstance: Record<string, any>) => T, manager?: DesignerManager): T {
        const {globalVariableInstance} = (manager ?? window.DATAVISOOL_ENV.currentManager).globalVariableManager;
        if (!config || !globalVariableInstance)
            return config;
        config = cloneDeep(config);
        const gvKeyToIdMap = Object.values(globalVariableInstance).reduce((acc: any, cur) => {
            acc[cur.key] = cur.getGlobalVariable().id;
            return acc;
        }, {});
        return configProcess(config, gvKeyToIdMap, globalVariableInstance);
    }

    /**
     * 将API数据配置中的全局变量表达式替换为全局变量的值
     * @param config
     */
    public parseApiData(config: APIConfig, manager?: DesignerManager): APIConfig {
        return this.parse(config, (config, gvKeyToIdMap, globalVariableInstance) => {
            const {url, params, headers, filter} = config;
            this.doMatchGv(url!, gvKeyToIdMap, (expression, gvValue) => config.url = config.url?.replace(expression, gvValue), globalVariableInstance);
            const paramsString: string = typeof params === 'object' && params !== null ? JSON.stringify(params) : String(params || '');
            this.doMatchGv(paramsString, gvKeyToIdMap, (expression, gvValue) => config.params = JSON.parse(paramsString.replace(expression, gvValue)), globalVariableInstance);
            const headersString: string = typeof headers === 'object' ? JSON.stringify(headers) : String(headers || '');
            this.doMatchGv(headersString, gvKeyToIdMap, (expression, gvValue) => config.headers = JSON.parse(headersString.replace(expression, gvValue)), globalVariableInstance);
            this.doMatchGv(filter!, gvKeyToIdMap, (expression, gvValue) => config.filter = config.filter?.replace(expression, gvValue), globalVariableInstance);
            return config;
        }, manager)
    }

    /**
     * 将公共API数据配置中的全局变量表达式替换为全局变量的值
     * @param config
     */
    public parseCommonApi(config: ICommonApi, manager?: DesignerManager): ICommonApi {
        return this.parse(config, (config, gvKeyToIdMap, globalVariableInstance) => {
            const {filter} = config;
            this.doMatchGv(filter!, gvKeyToIdMap, (expression, gvValue) => config.filter = config.filter?.replace(expression, gvValue), globalVariableInstance);
            return config;
        }, manager)
    }

    public parseDatabase(config: IDatabase, manager?: DesignerManager): IDatabase {
        return this.parse(config, (config, gvKeyToIdMap, globalVariableInstance) => {
            const {filter, sql} = config;
            this.doMatchGv(filter!, gvKeyToIdMap, (expression, gvValue) => config.filter = config.filter?.replace(expression, gvValue), globalVariableInstance);
            this.doMatchGv(sql!, gvKeyToIdMap, (expression, gvValue) => config.sql = config.sql?.replace(expression, gvValue), globalVariableInstance);
            return config;
        }, manager)
    }

    public parseWebSocket(config: IWebSocketConfig, manager?: DesignerManager): IWebSocketConfig {
        return this.parse(config, (config, gvKeyToIdMap, globalVariableInstance) => {
            const {filter, url} = config;
            this.doMatchGv(filter!, gvKeyToIdMap, (expression, gvValue) => config.filter = config.filter?.replace(expression, gvValue), globalVariableInstance);
            this.doMatchGv(url!, gvKeyToIdMap, (expression, gvValue) => config.url = config.url?.replace(expression, gvValue), globalVariableInstance);
            return config;
        }, manager)
    }

    public parseMqtt(config: IMQTTConfig, manager?: DesignerManager): IMQTTConfig {
        return this.parse(config, (config, gvKeyToIdMap, globalVariableInstance) => {
            const {filter, host, topics} = config;
            this.doMatchGv(filter!, gvKeyToIdMap, (expression, gvValue) => config.filter = config.filter?.replace(expression, gvValue), globalVariableInstance);
            this.doMatchGv(host!, gvKeyToIdMap, (expression, gvValue) => config.host = config.host?.replace(expression, gvValue), globalVariableInstance);
            this.doMatchGv(topics!, gvKeyToIdMap, (expression, gvValue) => config.topics = config.topics?.replace(expression, gvValue), globalVariableInstance);
            return config;
        }, manager)
    }
}

const componentDataGvParser = new ComponentDataGvParser();
export default componentDataGvParser;