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
import DragScaleProvider from "./framework/drag-scale/DragScaleProvider.tsx";
import type {EditorViewportCompatibility} from '@datavisool/sdk/plugin/contracts/editorCanvas';

declare global {
    interface Window {
        /**
         * 服务器组件所需的临时变量及依赖
         */
        __DATAVISOOL_REMOTE_COMPONENT_TEMP__: any;
        __DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?: Record<string, string>;
        DataVisoolSDK: Record<string, any>;
        DataVisoolTypes: typeof import("@datavisool/sdk/types");
        DataVisoolUI: Record<string, any>;
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
            fonts: ISelectOption[];
            currentManager: any;
            mainManger: any;
            //仅在编辑模式下存在的属性
            dragScaleProvider?: DragScaleProvider | EditorViewportCompatibility;
            [key: string]: any;
        };

        [key: string]: any;
    }
}
