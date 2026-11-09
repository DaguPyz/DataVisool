/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {ClazzTemplate} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";
import {getDefaultMenuList} from "@/designer/right/util";

import AntdCommonRoseController, {AntdRoseProps} from "./AntdCommonRoseController";
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";

const AnimationConfig = React.lazy(() => import("@/comps/common-component/animation-config/AnimationConfig"));
const AntdRoseCommonStyleConfig = React.lazy(() => import("./AntdRoseCommonConfig"));
const AntdRoseFieldMapping = React.lazy(() => import("./AntdRoseCommonConfig").then((module) => ({default: module.AntdRoseFieldMapping})));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));

abstract class AbstractRoseDefinition extends AntdCommonDefinition<AntdCommonRoseController, AntdRoseProps> {

    getController(): ClazzTemplate<AntdCommonRoseController> | null {
        return AntdCommonRoseController;
    }

    getMenuList(): Array<MenuInfo> {
        return getDefaultMenuList();
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdRoseCommonStyleConfig,
            animation: AnimationConfig,
            mapping: AntdRoseFieldMapping
        };
    }
}

export default AbstractRoseDefinition;
