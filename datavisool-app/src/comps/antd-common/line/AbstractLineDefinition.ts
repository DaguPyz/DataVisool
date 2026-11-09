/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {ClazzTemplate} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";
import {getDefaultMenuList} from "@/designer/right/util";

import AntdCommonLineController, {AntdLineProps} from "./AntdCommonLineController";
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";

const AnimationConfig = React.lazy(() => import("@/comps/common-component/animation-config/AnimationConfig"));
const AntdLineCommonStyleConfig = React.lazy(() => import("./AntdLineCommonConfig").then((module) => ({default: module.AntdLineCommonStyleConfig})));
const AntdLineCommonFieldMapping = React.lazy(() => import("./AntdLineCommonConfig").then((module) => ({default: module.AntdLineCommonFieldMapping})));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));


abstract class AbstractLineDefinition extends AntdCommonDefinition<AntdCommonLineController, AntdLineProps> {

    getController(): ClazzTemplate<AntdCommonLineController> | null {
        return AntdCommonLineController;
    }

    getMenuList(): Array<MenuInfo> {
        return getDefaultMenuList();
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdLineCommonStyleConfig,
            animation: AnimationConfig,
            mapping: AntdLineCommonFieldMapping
        };
    }
}

export default AbstractLineDefinition;
