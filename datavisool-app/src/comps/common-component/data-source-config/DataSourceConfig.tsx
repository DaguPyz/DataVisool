/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {WebDatabaseConfig as IDatabase} from "@/types/WebDataSourceTypes.ts";
import {useEffect, useState } from "react";
import "./DataSourceConfig.less";
import { Control, FieldChangeData, DatavisoolGUI} from "@datavisool/ui";
import {
  APIConfig,
  DataConfigType,
  ICommonApi,
  IGlobalVariableDataConfigType,
  IMQTTConfig,
  IWebSocketConfig,
} from "@datavisool/sdk/types";
import { StaticDataConfig } from "./StaticDataConfig.tsx";
import { ApiDataConfig } from "./ApiDataConfig.tsx";
import { DatabaseDataConfig } from "./DatabaseConfig.tsx";
import CommonApiConfig from "./CommonApiConfig.tsx";
import { GlobalVariableConfig } from "./GlobalVariableConfig.tsx";
import { WebSocketConfig } from "./WebSocketConfig.tsx";
import { MQTTConfig } from "./MQTTConfig.tsx";
import DataUtil from "@/util/DataUtil.ts";
import { normalizeDataConfigAsync } from "@/util/DataSourceConfigUtil.ts";

export interface DataSourceConfigProps {
  sourceLabel?: string;
  data: DataConfigType;
  onSave?: (config: DataConfigType, testResult?: any) => void;
  staticDataDraftValue?: any;
  staticDataSeedKey?: string;
  saveUnchangedStaticData?: boolean;
  range?: DataConfigType["sourceType"][];
  apiTestBefore?: (config: APIConfig) => APIConfig;
  apiTestAfter?: (data: any) => void;
  commonApiTestBefore?: (config: ICommonApi) => ICommonApi;
  commonApiTestAfter?: (data: any) => void;
  databaseTestBefore?: (config: IDatabase) => IDatabase;
  databaseTestAfter?: (data: any) => void;
  globalVariableTestBefore?: (
    config: IGlobalVariableDataConfigType
  ) => IGlobalVariableDataConfigType;
  globalVariableTestAfter?: (data: any) => void;
  wsTestBefore?: (config: IWebSocketConfig) => IWebSocketConfig;
  wsTestAfter?: (data: any) => void;
  mqttTestBefore?: (config: IMQTTConfig) => IMQTTConfig;
  mqttTestAfter?: (data: any) => void;
}

const DataSourceConfig = (props: DataSourceConfigProps) => {
  const {
    data: config,
    sourceLabel,
    range,
    onSave,
    staticDataDraftValue,
    staticDataSeedKey,
  } = props;
  const [sourceType, setSourceType] = useState<DataConfigType["sourceType"]>(
    config.sourceType ?? "static"
  );
  const saveNormalizedConfig = async (
    nextConfig: DataConfigType,
    testResult?: any
  ) => {
    const normalizedConfig = await normalizeDataConfigAsync(
      config ?? {},
      nextConfig as Record<string, any>
    );
    onSave && onSave(normalizedConfig, testResult);
  };

  let sourceOptions = [
    { value: "static", label: "静态数据" },
    { value: "api", label: "接口(API)" },
    { value: "commonApi", label: "公共API" },
    { value: "database", label: "数据库" },
    { value: "globalVariable", label: "全局变量" },
    { value: "webSocket", label: "WebSocket" },
    { value: "mqtt", label: "mqtt" },
  ];
  if (range && range.length > 0)
    sourceOptions = sourceOptions.filter((item) =>
      range.includes(item.value as DataConfigType["sourceType"])
    );
  const currentSourceType = sourceOptions.some(
    (item) => item.value === sourceType
  )
    ? sourceType
    : (sourceOptions[0]?.value as DataConfigType["sourceType"]) ?? "static";

  useEffect(() => {
    setSourceType(config.sourceType ?? "static");
  }, [config.sourceType]);

  const onFieldChange = (fieldChangeData: FieldChangeData) => {
    const { data } = fieldChangeData;
    const sourceType = data as DataConfigType["sourceType"];
    setSourceType(sourceType);
  };

  const schema: Control = {
    type: "grid",
    config: { gridGap: "10px" },
    children: [
      {
        key: "sourceType",
        label: sourceLabel ?? "数据源",
        type: "select",
        reRender: true,
        value: currentSourceType,
        config: {
          options: sourceOptions,
          containerStyle: {
            marginBottom: 10,
          },
        },
      },
    ],
  };

  const configComponentMap = {
    static: (
      <StaticDataConfig
        key={staticDataSeedKey ?? "static-data"}
        data={DataUtil.getStaticDataConfig(config)!}
        saveUnchanged={props.saveUnchangedStaticData}
        draftValue={staticDataDraftValue}
        defaultValue={config.value}
        onSave={(data, testResult) =>
          saveNormalizedConfig(
            {
              sourceType: "static",
              staticData: data,
              value: testResult,
            },
            testResult
          )
        }
      />
    ),
    api: (
      <ApiDataConfig
        data={config.apiData!}
        onSave={(data: APIConfig, testResult) =>
          saveNormalizedConfig(
            { sourceType: "api", apiData: data, value: testResult },
            testResult
          )
        }
        doTestBefore={props.apiTestBefore}
        doTestAfter={props.apiTestAfter}
      />
    ),
    database: (
      <DatabaseDataConfig
        data={config.database!}
        onSave={(data: IDatabase, testResult) =>
          saveNormalizedConfig(
            {
              sourceType: "database",
              database: data,
              value: testResult,
            },
            testResult
          )
        }
        doTestBefore={props.databaseTestBefore}
        doTestAfter={props.databaseTestAfter}
      />
    ),
    commonApi: (
      <CommonApiConfig
        data={config.commonApi!}
        onSave={(data: ICommonApi, testResult) =>
          saveNormalizedConfig(
            {
              sourceType: "commonApi",
              commonApi: data,
              value: testResult,
            },
            testResult
          )
        }
        doTestBefore={props.commonApiTestBefore}
        doTestAfter={props.commonApiTestAfter}
      />
    ),
    globalVariable: (
      <GlobalVariableConfig
        data={config.globalVariable!}
        doTestAfter={props.globalVariableTestAfter}
        onSave={(data: IGlobalVariableDataConfigType, testResult) =>
          saveNormalizedConfig(
            {
              sourceType: "globalVariable",
              globalVariable: data!,
              value: testResult,
            },
            testResult
          )
        }
      />
    ),
    webSocket: (
      <WebSocketConfig
        data={config.webSocket!}
        doTestBefore={props.wsTestBefore}
        doTestAfter={props.wsTestAfter}
        onSave={(data: IWebSocketConfig, testResult) =>
          saveNormalizedConfig(
            {
              sourceType: "webSocket",
              webSocket: data!,
              value: testResult,
            },
            testResult
          )
        }
      />
    ),
    mqtt: (
      <MQTTConfig
        data={config.mqtt!}
        doTestBefore={props.mqttTestBefore}
        doTestAfter={props.mqttTestAfter}
        onSave={(data: IWebSocketConfig, testResult) =>
          saveNormalizedConfig(
            {
              sourceType: "mqtt",
              mqtt: data!,
              value: testResult,
            },
            testResult
          )
        }
      />
    ),
  };

  return (
    <div className={"data-config"}>
      <DatavisoolGUI schema={schema} onFieldChange={onFieldChange} />
      {configComponentMap[currentSourceType!]}
    </div>
  );
};

export default DataSourceConfig;
