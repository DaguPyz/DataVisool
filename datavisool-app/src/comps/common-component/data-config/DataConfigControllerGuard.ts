/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {AbstractController} from "@datavisool/sdk/core";

type ControllerMap = Record<string, AbstractController | undefined>;

export const DATA_CONFIG_CONTROLLER_PROXY_TARGET = Symbol("DATA_CONFIG_CONTROLLER_PROXY_TARGET");

const getControllerConfigId = (controller: AbstractController | null | undefined) => {
    try {
        return (controller?.getConfig?.() as any)?.base?.id;
    } catch (error) {
        console.warn("数据配置保存目标读取失败", error);
        return undefined;
    }
};

const getControllerProxyTarget = (controller: AbstractController | null | undefined) => {
    try {
        return (controller as any)?.[DATA_CONFIG_CONTROLLER_PROXY_TARGET] as AbstractController | undefined;
    } catch (error) {
        console.warn("数据配置保存目标读取失败", error);
        return undefined;
    }
};

const getRegisteredController = (
    componentId: string,
    controllers: ControllerMap,
) => {
    return controllers[componentId] ??
        Object.values(controllers).find((candidate) => getControllerConfigId(candidate) === componentId);
};

export const isDataConfigControllerCurrent = (
    controller: AbstractController | null | undefined,
    componentId: string,
    controllers: ControllerMap = window.DATAVISOOL_ENV?.currentManager?.layerManager?.controllers ?? {},
) => {
    if (!componentId || getControllerConfigId(controller) !== componentId)
        return false;

    const currentController = getRegisteredController(componentId, controllers);
    if (!currentController)
        return false;

    const controllerTarget = getControllerProxyTarget(controller) ?? controller;
    return controllerTarget === currentController;
};
