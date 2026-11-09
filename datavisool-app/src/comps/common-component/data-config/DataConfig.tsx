/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {WebDatabaseConfig as IDatabase} from "@/types/WebDataSourceTypes.ts";
import type {AbstractController} from "@datavisool/sdk/core";
import {AbstractDesignerController} from "@datavisool/sdk/core";
import {
  APIConfig,
  DataConfigType,
  ICommonApi,
  IMQTTConfig,
  IWebSocketConfig,
} from "@datavisool/sdk/types";
import DataSourceConfig from "@/comps/common-component/data-source-config/DataSourceConfig.tsx";
import componentDataGvParser from "@/designer/left/global-variable/parse/ComponentDataGvParser.ts";
import {globalMessage} from "@datavisool/ui";
import { normalizeDataConfigAsync } from "@/util/DataSourceConfigUtil.ts";
import {
  DesignerMode,
  DesignerScene,
} from "@datavisool/sdk/types";
import loopContainerSampleDataStore from "@/designer/store/LoopContainerSampleDataStore.ts";
import { isDataConfigControllerCurrent } from "./DataConfigControllerGuard.ts";

export interface DataConfigProps<
  T extends AbstractController = AbstractDesignerController
> {
  controller: T;
}

const DataConfig = (props: DataConfigProps) => {
  const { controller } = props;
  const componentConfig = controller?.getConfig();
  const dataSource = componentConfig?.data ?? { sourceType: "static" };
  const currentManager = window.DATAVISOOL_ENV?.currentManager;
  const isLoopContainerEditing =
    window.DATAVISOOL_ENV?.mode === DesignerMode.EDIT &&
    currentManager?.scene === DesignerScene.LOOP_CONTAINER;
  const loopContainerId = isLoopContainerEditing
    ? currentManager?.id ?? ""
    : "";
  const loopSampleData = loopContainerId
    ? loopContainerSampleDataStore.getSampleData(loopContainerId)
    : undefined;
  const onSave = async (config: DataConfigType, testResult?: any) => {
    const componentId = (controller?.getConfig?.() as any)?.base?.id;
    if (!componentId) return;
    const normalizedConfig = await normalizeDataConfigAsync(
      dataSource ?? {},
      config as Record<string, any>
    );
    if (!isDataConfigControllerCurrent(controller, componentId)) return;
    controller.update({ data: normalizedConfig }, { reRender: false });
    //静态数据保存时候同步更新组件数据
    if (normalizedConfig.sourceType === "static")
      controller.changeData(testResult ?? normalizedConfig.value);
    //分析全局变量的绑定与解绑
    if (normalizedConfig.sourceType === "globalVariable")
      componentDataGvParser.directBindByCompIdAndGvId(
        componentId,
        normalizedConfig.globalVariable?.gvId ?? ""
      );
    else componentDataGvParser.bindConfigToGv(controller);
    globalMessage.messageApi?.success("配置项已保存");
  };

  const changeComponentData = (data: any) => {
    try {
      controller.changeData(data);
    } catch (e) {
      console.log("更新数据失败，组件可能无法识别该数据", e);
    }
  };

  const apiRequestBefore = (config: APIConfig) => {
    return componentDataGvParser.parseApiData(config);
  };

  const commonApiRequestBefore = (config: ICommonApi) => {
    return componentDataGvParser.parseCommonApi(config);
  };

  const databaseRequestBefore = (config: IDatabase) => {
    return componentDataGvParser.parseDatabase(config);
  };

  const wsTestBefore = (config: IWebSocketConfig) => {
    return componentDataGvParser.parseWebSocket(config);
  };

  const mqttTestBefore = (config: IMQTTConfig) => {
    return componentDataGvParser.parseMqtt(config);
  };

  return (
    <DataSourceConfig
      data={dataSource}
      range={isLoopContainerEditing ? ["static"] : undefined}
      staticDataDraftValue={loopSampleData}
      staticDataSeedKey={
        isLoopContainerEditing
          ? `${loopContainerId}:${componentConfig?.base?.id ?? ""}`
          : componentConfig?.base?.id ?? ""
      }
      onSave={onSave}
      commonApiTestBefore={commonApiRequestBefore}
      commonApiTestAfter={changeComponentData}
      databaseTestBefore={databaseRequestBefore}
      databaseTestAfter={changeComponentData}
      apiTestBefore={apiRequestBefore}
      apiTestAfter={changeComponentData}
      globalVariableTestAfter={changeComponentData}
      wsTestBefore={wsTestBefore}
      wsTestAfter={changeComponentData}
      mqttTestBefore={mqttTestBefore}
      mqttTestAfter={changeComponentData}
    />
  );
};

export default DataConfig;
