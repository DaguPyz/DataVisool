/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {
  APIConfig,
  DataConfigType,
  ICommonApi,
  IGlobalVariableDataConfigType,
  IMQTTConfig,
  IWebSocketConfig,
} from "@datavisool/sdk/types";
import type {WebDatabaseConfig} from "@/types/WebDataSourceTypes.ts";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {Base64Util} from "@datavisool/sdk";
import componentDataGvParser from "@/designer/left/global-variable/parse/ComponentDataGvParser.ts";
import type DesignerManager from "@/designer/manager/DesignerManager.ts";
import mqtt, { IClientOptions, MqttClient } from "mqtt";
import {ObjectUtil} from "@datavisool/sdk";
import DataUtil from "@/util/DataUtil.ts";
import FetchUtil from "@/util/FetchUtil.ts";
import {parseMqttTopics} from "@/util/MqttTopics.ts";
import { DesignerMode } from "@datavisool/sdk/types";

export default class ComponentDataUpdater {
  private interval: NodeJS.Timeout | null = null;
  private webSocket: WebSocket | null = null;
  private webSocketReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private webSocketGeneration = 0;
  private mqttClient: MqttClient | null = null;
  private destroyed = false;
  private requestVersion = 0;
  private readonly successCallback: (data?: any) => void;
  private readonly failCallback: () => void;

  private readonly designerManager: DesignerManager;

  constructor(successCallback: (data?: any) => void, failCallback: () => void, designerManager?: DesignerManager) {
    this.designerManager = designerManager ?? window.DATAVISOOL_ENV?.currentManager;
    this.successCallback = successCallback;
    this.failCallback = failCallback;
  }

  private isRequestStale(requestVersion: number): boolean {
    return this.destroyed || requestVersion !== this.requestVersion;
  }

  private clearActiveDataSources(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (this.webSocketReconnectTimeout !== null)
      clearTimeout(this.webSocketReconnectTimeout);
    this.webSocketReconnectTimeout = null;

    const socket = this.webSocket;
    this.webSocket = null;
    this.webSocketGeneration += 1;
    socket?.close();

    const client = this.mqttClient;
    this.mqttClient = null;
    client?.end();
  }

  private doHttpRequest = (
    url: string,
    method: string,
    headers: any,
    params: any,
    filter: string,
    requestVersion: number
  ) => {
    Promise.all([
      DataUtil.resolveHeaders(headers),
      DataUtil.resolveParams(params),
    ]).then(([resolvedHeaders, resolvedParams]) => {
      if (this.isRequestStale(requestVersion)) return;
      FetchUtil.doRequestNativeResult(
        url!,
        method!,
        resolvedHeaders,
        resolvedParams
      ).then(async (res) => {
        if (this.isRequestStale(requestVersion)) return;
        if (res != null) {
          res = await DataUtil.applyFilterAsync(res, filter);
          if (this.isRequestStale(requestVersion)) return;
          //当且仅当result不等于null也不等于undefined时候更新数据
          if (res != null) this.successCallback && this.successCallback(res);
        } else {
          this.failCallback && this.failCallback();
        }
      });
    });
  };

  public doApi = (
    config: APIConfig,
    singleTrigger: boolean | undefined,
    requestVersion: number
  ) => {
    config = componentDataGvParser.parseApiData(config, this.designerManager);
    const {
      url = "",
      method = "get",
      params = {},
      headers = {},
      frequency = 5,
      filter = "",
      autoFlush = false,
    } = config;
    this.doHttpRequest(url, method, headers, params, filter, requestVersion);
    if (!singleTrigger && autoFlush) {
      if (this.interval) clearInterval(this.interval);
      this.interval = setInterval(
        () =>
          this.doHttpRequest(
            url,
            method,
            headers,
            params,
            filter,
            requestVersion
          ),
        frequency * 1000
      );
    }
  };

  public doCommonApi = (
    commonApi: ICommonApi,
    singleTrigger: boolean | undefined,
    requestVersion: number
  ) => {
    const { frequency = 5, autoFlush = false, filter = "" } = commonApi;
    this.getCommonApiConfig(commonApi?.commonApiId).then((response) => {
      if (this.isRequestStale(requestVersion)) return;
      if (response != null) {
        response = componentDataGvParser.parseCommonApi(response, this.designerManager);
        const {
          url = "",
          method = "get",
          params = "{}",
          headers = "{}",
        } = response as APIConfig;
        this.doHttpRequest(
          url,
          method,
          headers,
          params,
          filter,
          requestVersion
        );
        if (!singleTrigger && autoFlush)
          this.interval = setInterval(
            () =>
              this.doHttpRequest(
                url,
                method,
                headers,
                params,
                filter,
                requestVersion
              ),
            frequency * 1000
          );
      } else this.failCallback();
    }).catch((error) => {
      if (this.isRequestStale(requestVersion)) return;
      console.error("公共接口配置加载失败", error);
      this.failCallback();
    });
  };

  private getCommonApiConfig = async (
    commonApiId?: string
  ): Promise<APIConfig | null> => {
    if (window.DATAVISOOL_ENV?.mode !== DesignerMode.RELEASE) {
      return AuthFetchUtil.get<APIConfig>(
        `/api/commonApi/getCommonApi/${commonApiId}`
      );
    }

    return FetchUtil.post<APIConfig>("/api/release/getCommonApi", {
      releaseId: window.DATAVISOOL_ENV?.projectId,
      commonApiId,
      password: window.DATAVISOOL_ENV?.releasePassword,
    });
  };

  public doDatabase = (
    config: WebDatabaseConfig,
    singleTrigger: boolean | undefined,
    requestVersion: number
  ) => {
    const releaseConfig = config;
    config = componentDataGvParser.parseDatabase(config, this.designerManager);
    const { sql, targetDb, filter, frequency, autoFlush } = config;
    const request = () => {
      if (this.isRequestStale(requestVersion)) return;
      if (!sql || sql === "") return;
      this.executeDatabase(
        targetDb,
        Base64Util.toBase64(sql),
        releaseConfig?.runtimeDataSourceId,
        this.collectReleaseSqlVariables(releaseConfig?.sql)
      ).then(async (res) => {
        if (this.isRequestStale(requestVersion)) return;
        if (res != null) {
          res = await DataUtil.applyFilterAsync(res, filter);
          if (this.isRequestStale(requestVersion)) return;
          if (res != null) this.successCallback && this.successCallback(res);
        } else {
          this.failCallback && this.failCallback();
        }
      }).catch((error) => {
        if (this.isRequestStale(requestVersion)) return;
        console.error("数据库数据加载失败", error);
        this.failCallback();
      });
    };

    request();
    if (!singleTrigger && autoFlush) {
      if (this.interval) clearInterval(this.interval);
      this.interval = setInterval(() => request(), (frequency || 5) * 1000);
    }
  };

  private executeDatabase = (
    targetDb: string | undefined,
    statement: string,
    runtimeDataSourceId?: string,
    variables?: Record<string, any>
  ): Promise<any> => {
    if (window.DATAVISOOL_ENV?.mode !== DesignerMode.RELEASE) {
      return AuthFetchUtil.post(`/api/db/executor/execute`, {
        id: targetDb,
        statement,
      });
    }

    return FetchUtil.post("/api/release/executeDatabase", {
      releaseId: window.DATAVISOOL_ENV?.projectId,
      runtimeDataSourceId,
      variables,
      password: window.DATAVISOOL_ENV?.releasePassword,
    });
  };

  private collectReleaseSqlVariables = (sql?: string): Record<string, any> => {
    const variables: Record<string, any> = {};
    if (window.DATAVISOOL_ENV?.mode !== DesignerMode.RELEASE || !sql) return variables;
    const matched = sql.match(/#\{[-_0-9a-zA-Z]+}/g) ?? [];
    const { globalVariableInstance } =
      this.designerManager.globalVariableManager;
    if (!globalVariableInstance) return variables;
    const keyToInstance = Object.values(globalVariableInstance).reduce(
      (acc: Record<string, any>, gv: any) => {
        acc[gv.key] = gv;
        return acc;
      },
      {}
    );
    matched.forEach((expression) => {
      const key = expression.substring(2, expression.length - 1);
      const gv = keyToInstance[key];
      if (gv) variables[key] = gv.getGlobalVariable().value;
    });
    return variables;
  };

  public doGlobalVariableData = async (
    config: IGlobalVariableDataConfigType,
    requestVersion: number
  ) => {
    //数据源为全局变量本身的时候，不用解析全局变量，因为全局变量作为数据源的时候不支持在其配置中再次设置全局变量。
    const { gvId, filter } = config;
    const { globalVariableInstance } =
      this.designerManager.globalVariableManager;
    if (globalVariableInstance) {
      if (this.isRequestStale(requestVersion)) return;
      const gvInstance = globalVariableInstance[gvId!];
      if (!gvInstance) {
        if (this.isRequestStale(requestVersion)) return;
        this.failCallback();
        return;
      } else {
        try {
          let gvValue = gvInstance.getGlobalVariable().value;
          gvValue = await DataUtil.applyFilterAsync(gvValue, filter);
          if (this.isRequestStale(requestVersion)) return;
          if (gvValue != null)
            this.successCallback && this.successCallback(gvValue);
        } catch (e) {
          console.error("全局变量数据更新失败:", e, config, filter);
        }
      }
    }
  };

  /**
   * 请求WebSocket链接，并传输数据
   * @param config
   */
  public doWebSocket = (config: IWebSocketConfig, requestVersion: number) => {
    const connect = () => {
      if (this.isRequestStale(requestVersion)) return;
      if (this.webSocketReconnectTimeout !== null)
        clearTimeout(this.webSocketReconnectTimeout);
      this.webSocketReconnectTimeout = null;

      const previousSocket = this.webSocket;
      this.webSocket = null;
      this.webSocketGeneration += 1;
      previousSocket?.close();
      const connectionVersion = ++this.webSocketGeneration;
      const {url, filter, protocols} = config;
      const protocolsArr = protocols && protocols.length > 0
        ? protocols.split(',').map(item => item.trim())
        : [];
      let socket: WebSocket;
      try {
        socket = new WebSocket(url!, protocolsArr);
      } catch (error) {
        console.error('WebSocket连接错误', error);
        this.failCallback();
        return;
      }
      this.webSocket = socket;
      let failed = false;
      const isCurrentSocket = () =>
        !failed && !this.isRequestStale(requestVersion) &&
        this.webSocket === socket && this.webSocketGeneration === connectionVersion;
      const scheduleReconnect = () => {
        if (this.isRequestStale(requestVersion) || this.webSocketReconnectTimeout !== null)
          return;
        this.webSocketReconnectTimeout = setTimeout(() => {
          this.webSocketReconnectTimeout = null;
          connect();
        }, 3000);
      };
      const reportConnectionFailure = (event?: Event) => {
        if (!isCurrentSocket()) return;
        failed = true;
        if (event) console.error('WebSocket连接错误', event);
        scheduleReconnect();
        this.failCallback();
      };

      socket.onmessage = async (event) => {
        if (!isCurrentSocket()) return;
        let data = event.data;
        data = await DataUtil.applyFilterAsync(data, filter);
        if (!isCurrentSocket()) return;
        if (data != null) this.successCallback && this.successCallback(data);
      };
      socket.onerror = (event) => reportConnectionFailure(event);
      socket.onclose = () => reportConnectionFailure();
    };

    connect();
  };

  /**
   * 请求mqtt服务器，并传输数据
   * @param config
   */
  public doMqtt = (config: IMQTTConfig, requestVersion: number) => {
    if (this.mqttClient) this.mqttClient.end();
    const {
      host,
      path = "/mqtt",
      port,
      topics,
      qos = 0,
      filter,
      ...rest
    } = config;
    if (!host || !port || !topics) {
      console.error("请填写完整的MQTT链接地址、端口和主题");
      if (!this.isRequestStale(requestVersion)) this.failCallback();
      return;
    }
    const client = mqtt.connect(
      `${host}:${port}${path}`,
      ObjectUtil.removeEmptyKeys(rest) as IClientOptions
    );
    this.mqttClient = client;
    if (client) {
      client.on("error", (error) => {
        if (this.isRequestStale(requestVersion) || this.mqttClient !== client) return;
        console.error("MQTT连接失败", error);
        this.failCallback();
      });
      client.subscribe(
        parseMqttTopics(topics),
        { qos },
        (err) => {
          if (this.isRequestStale(requestVersion) || this.mqttClient !== client)
            return;
          if (err) {
            console.warn("无法订阅mqtt服务器: " + err.message);
            this.failCallback();
          } else {
            client.on("message", async (topic, message) => {
              try {
                if (
                  this.isRequestStale(requestVersion) ||
                  this.mqttClient !== client
                )
                  return;
                let data: any = {
                  topic,
                  message: message.toString(),
                };
                data = await DataUtil.applyFilterAsync(data, filter);
                if (
                  this.isRequestStale(requestVersion) ||
                  this.mqttClient !== client
                )
                  return;
                if (data != null)
                  this.successCallback && this.successCallback(data);
              } catch (e) {
                console.error(`mqtt数据更新失败: `, e, config, filter);
              }
            });
          }
        }
      );
    }
  };

  /**
   * 加载组件数据，用于在预览（展示）模式下渲染完组件后根据当前组件的数据配置自动加载并更新组件数组。
   * 注：若自定义组件有自己的数据加载方式，则需要覆写此方法
   * @param config 数据配置
   * @param singleTrigger 是否为单次触发，默认为false(即读取组件数据的配置项），若为true，则一定只触发一次
   */
  public run(config: DataConfigType, singleTrigger?: boolean): void {
    if (this.destroyed || !config) return;
    const requestVersion = ++this.requestVersion;
    this.clearActiveDataSources();
    const { sourceType } = config!;
    switch (sourceType) {
      case "static": {
        if (config.staticData) {
          DataUtil.getStaticDataAsync(config.staticData).then((value) => {
            if (this.destroyed || requestVersion !== this.requestVersion)
              return;
            config.value = value;
            this.successCallback && this.successCallback(value);
          });
        }
        break;
      }
      case "api":
        this.doApi(config.apiData!, singleTrigger, requestVersion);
        break;
      case "commonApi":
        this.doCommonApi(config.commonApi!, singleTrigger, requestVersion);
        break;
      case "database":
        this.doDatabase(config.database!, singleTrigger, requestVersion);
        break;
      case "globalVariable":
        this.doGlobalVariableData(config.globalVariable!, requestVersion);
        break;
      case "webSocket":
        this.doWebSocket(config.webSocket!, requestVersion);
        break;
      case "mqtt":
        this.doMqtt(config.mqtt!, requestVersion);
        break;
    }
  }

  public destroy(): void {
    this.destroyed = true;
    this.requestVersion += 1;
    this.clearActiveDataSources();
  }
}
