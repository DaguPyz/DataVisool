/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/// <reference types="vite/client" />

import {DesignerMode} from "@datavisool/sdk/types";
import AbstractDesignerController from "./framework/core/AbstractDesignerController.ts";
import {AbstractDefinition} from "@datavisool/sdk/core";
import {ISelectOption} from "@datavisool/ui";
import DesignerManager from "./designer/manager/DesignerManager.ts";
import DragScaleProvider from "./framework/drag-scale/DragScaleProvider.tsx";
import ViewportController from "./designer/workspace/viewport/ViewportController.ts";
import HistoryOperator from "./designer/operate-provider/undo-redo/HistoryOperator.ts";

declare global {
    interface Window {
        /**
         * 服务器组件所需的临时变量及依赖
         */
        __DATAVISOOL_REMOTE_COMPONENT_TEMP__: any;
        __DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?: Record<string, string>;
        DataVisoolSDK: typeof import("./global/ComponentRuntime").componentSdk;
        DataVisoolTypes: typeof import("@datavisool/sdk/types");
        DataVisoolUI: typeof import("./global/ComponentRuntime").componentUI;
        RemoteComponent: any;
        /**
         * LC运行时必要环境
         */
        DATAVISOOL_ENV: {
            projectId: string;
            mode: DesignerMode;
            controllers: Record<string, AbstractDesignerController>;
            definitions: Record<string, AbstractDefinition>;
            remoteScripts: Record<string, any>;
            layerInstances: Record<string, any>;
            fonts: ISelectOption[];
            currentManager: DesignerManager;
            mainManger: DesignerManager;
            //仅在编辑模式下存在的属性
            dragScaleProvider?: DragScaleProvider | ViewportController;
            historyOperator: HistoryOperator;
            [key: string]: any;
        };

        [key: string]: any;
    }
}
