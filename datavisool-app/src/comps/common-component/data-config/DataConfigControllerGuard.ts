/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {AbstractController} from "@datavisool/sdk/core";

type ControllerMap = Record<string, AbstractController | undefined>;

const getControllerConfigId = (controller: AbstractController | null | undefined) => {
    try {
        return (controller?.getConfig?.() as any)?.base?.id;
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
    controllers: ControllerMap,
) => {
    const inspectorFacade = controller as (AbstractController & {isCurrent?: () => boolean}) | null | undefined;
    if (typeof inspectorFacade?.isCurrent === 'function')
        return inspectorFacade.isCurrent();
    if (!componentId || getControllerConfigId(controller) !== componentId)
        return false;

    const currentController = getRegisteredController(componentId, controllers);
    if (!currentController)
        return false;

    return controller === currentController;
};
