/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import { memo, Suspense, useEffect, useRef, useState } from "react";
import runtimeConfigStore from "@/designer/store/RuntimeStore.ts";
import {AbstractDefinition} from "@datavisool/sdk/core";
import AbstractDesignerController from "./AbstractDesignerController";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import { DesignerMode } from "@datavisool/sdk/types";
import { ILayerItem } from "@datavisool/sdk/types";
import {Loading} from "@datavisool/ui";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import { cloneDeep } from "lodash";
import DataUtil from "@/util/DataUtil.ts";
import RenderErrorBoundary from "@/util/RenderErrorBoundary.tsx";
import RenderFaultPanel from "@/util/RenderFaultPanel.tsx";
import { buildLayerTransformStyle } from "@/util/LayerTransformUtil.ts";
import {markComponentPending, markComponentReady} from "@/designer/blueprint/util/ComponentLoadTracker";

export interface ComponentContainerProps {
  index?: number; //组件索引(用于循环容器子组件渲染标识，非循环容器渲染时不用传递）
  layer: ILayerItem;
  triggerSource?: string; //渲染源，可能来自编辑模式，预览模式，或大屏引用组件
  designerManager: DesignerManager;
}

const ComponentContainer = memo((props: ComponentContainerProps) => {
  const { layer, triggerSource, designerManager, index } = props;
  const layerManager = designerManager.layerManager!;
  const ref = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const [hasRenderError, setHasRenderError] = useState(false);
  const { auxiliaryBorder } = runtimeConfigStore;
  const enableEvent =
    window.DATAVISOOL_ENV.mode !== DesignerMode.EDIT || layerManager.enableEvent;
  const editDisplay = !(window.DATAVISOOL_ENV.mode === DesignerMode.EDIT && layer.hide);
  const containerStyle = {
    width: layer.width,
    height: layer.height,
    transform: `translate(${layer.x!}px, ${layer.y!}px) rotate(${
      layer.rotate ?? 0
    }deg)`,
    visibility: editDisplay ? undefined : "hidden",
    position: "absolute",
    border: auxiliaryBorder ? "1px solid #65eafc" : "none",
  } as const;

  const isUsableConfig = (config: unknown): config is Record<string, any> => {
    return !!config && typeof config === "object" && !Array.isArray(config);
  };

  const buildInitConfig = (componentDefine: AbstractDefinition) => {
    const config = cloneDeep(componentDefine.getInitConfig()) as Record<string, any>;
    config.base = {
      ...(config.base ?? {}),
      id: layer.id!,
      name: config.base?.name ?? layer.name,
      type: config.base?.type ?? layer.type,
    };
    return config;
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    let cancelled = false;
    let initializingController: AbstractDesignerController | null = null;
    let initializingConfig: any = null;
    let createSettled = false;
    const cleanupInitializingController = (
      controllerToCleanup = initializingController
    ) => {
      if (!controllerToCleanup) return;
      const { elemConfigs, controllers } = layerManager;
      try {
        controllerToCleanup.destroy();
      } catch (destroyError) {
        console.error("component controller destroy failed", destroyError);
      }
      let removedController = false;
      if (controllers[layer.id + ""] === controllerToCleanup) {
        delete controllers[layer.id + ""];
        removedController = true;
      }
      if (
        index != null &&
        controllers[`${layer.id}_${index}`] === controllerToCleanup
      ) {
        delete controllers[`${layer.id}_${index}`];
        removedController = true;
      }
      if (removedController || controllers[layer.id + ""] == null) {
        if (!createSettled && layer.id! in layerManager.layerConfigs) {
          elemConfigs![layer.id!] = cloneDeep(initializingConfig);
        } else {
          delete elemConfigs![layer.id!];
        }
      }
      if (initializingController === controllerToCleanup) {
        initializingController = null;
        initializingConfig = null;
      }
    };
    const initializeComponent = async () => {
      //通过ref创建组件，并将组件实例存入Map中。后续通过Map匹配到具体实例，调用实例的对象方法进行组件的更新操作
      const { elemConfigs, controllers } = layerManager;
      const componentDefine: AbstractDefinition =
        DesignerLoader.definitionMap[layer!.type!];
      if (componentDefine) {
        const Controller = componentDefine.getController();
        if (Controller) {
          let config;
          if (
            layer.id! in controllers! &&
            isUsableConfig(controllers![layer.id!].getConfig?.())
          ) {
            //重新编组后，被编组组件会重新渲染，需从之前的实例中获取原有数据
            config = controllers![layer.id!].getConfig();
          } else if (isUsableConfig(elemConfigs?.[layer.id!])) {
            config = elemConfigs![layer.id!];
          } else {
            config = buildInitConfig(componentDefine);
          }
          const controller = new Controller()! as AbstractDesignerController;
          markComponentPending(controller);
          /**
           * 此处注意，执行顺序尤为重要！！！
           * 第一步：动态代理绑定在前，
           * 第二步：赋值controller在后，
           * 第三步：最后才是执行create方法。
           * 否则导致蓝图事件执行时，获取controller实例为undefined
           */
          controllers[layer.id + ""] = controller;
          initializingController = controller;
          if (index != null) {
            controllers[`${layer.id}_${index}`] = controller;
            config = cloneDeep(config);
          }
          initializingConfig = config;
          controller.designerManager = designerManager;
          controller.config = config;
          controller.bpExecutor = designerManager.bpExecutor!;
          controller.index = index;

          //TODO 编辑模式下兼容静态数据（后续要删除）
          if (
            window.DATAVISOOL_ENV.mode === DesignerMode.EDIT &&
            config?.data?.staticData
          )
            config.data.value = await DataUtil.getStaticDataAsync(
              config.data?.staticData
            );

          if (cancelled || !ref.current) {
            cleanupInitializingController();
            return;
          }

          const failWithCleanup = (error: unknown) => {
            if (!cancelled) {
              console.error("component container render failed", error);
              setHasRenderError(true);
            }
            cleanupInitializingController();
          };

          controller
            .create(ref.current!, config, designerManager.bpExecutor!, index)
            .then(() => {
              createSettled = true;
              if (cancelled) {
                cleanupInitializingController(controller);
                return;
              }
              try {
                //根据图层hide控制初始时图层显示和隐藏
                controller.setVisible(!layer.hide);
                //在组件完全渲染完毕后进行数据的加载和事件的注册
                if (window.DATAVISOOL_ENV.mode !== DesignerMode.EDIT) {
                  //非编辑模式下使用动态代理对象，执行蓝图事件
                  registerProxy(layer.id!, controller);
                  controller.registerEvent();
                  controller.loadComponentData();
                }
                //设置组件滤镜效果（todo 考虑是否应该在此处设置？）
                controller.updateFilter(controller.getConfig()?.filter);
                //渲染后删除elemConfigs中的映射关系（需要观察是否会造成其他问题）
                delete elemConfigs![layer.id!];
                markComponentReady(designerManager, controller);
                initializingController = null;
                initializingConfig = null;
              } catch (error) {
                failWithCleanup(error);
              }
            })
            .catch((error) => {
              createSettled = true;
              failWithCleanup(error);
            });
        }
      }
    };
    void initializeComponent();
    return () => {
      cancelled = true;
      if (!createSettled) {
        initializedRef.current = false;
        cleanupInitializingController();
      }
    };
  }, [designerManager.bpExecutor, index, layer, layerManager]);

  if (hasRenderError) {
    return (
      <div
        id={layer.id}
        data-type={layer.type}
        data-lock={layer.lock}
        data-hide={layer.hide}
        key={layer.id + ""}
        style={containerStyle}
        className={`datavisool-comp-item${triggerSource || ""}`}
      >
        <RenderFaultPanel message="组件渲染异常" detail="请检查配置后重试" />
      </div>
    );
  }

  return (
    <RenderErrorBoundary>
      <Suspense fallback={<Loading />}>
        <div
          id={layer.id}
          data-type={layer.type}
          data-lock={layer.lock}
          data-hide={layer.hide}
          key={layer.id + ""}
          style={containerStyle}
          className={`datavisool-comp-item${triggerSource || ""}`}
        >
          <div
            ref={ref}
            style={{
              ...buildLayerTransformStyle(layer.transform),
              width: "100%",
              height: "100%",
              pointerEvents: enableEvent ? "auto" : "none",
              position: "relative",
            }}
            data-layer-transform={layer.id}
          />
        </div>
      </Suspense>
    </RenderErrorBoundary>
  );
});

export default ComponentContainer;

const registerProxy = (
  compId: string,
  controller: AbstractDesignerController
) => {
  controller.changeData = new Proxy(controller.changeData, {
    apply(target, thisArg, argus) {
      controller.bpExecutor?.triggerComponentEvent(
        compId,
        "dataChange",
        argus[0],
        controller.index
      );
      return target.apply(thisArg, argus as any);
    },
  });
};
