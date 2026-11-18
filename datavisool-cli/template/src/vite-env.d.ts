/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/// <reference types="vite/client" />

import {AbstractDesignerDefinition} from "@datavisool/sdk";

declare global {
    interface Window {
        __DEFINITION_MAP__: Record<string, AbstractDesignerDefinition>;
        __COMPONENT_INFO_LIST__: object[];
        __CURRENT_COMPONENT__: string;
    }
}