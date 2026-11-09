/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {getDefaultMenuList} from "@/designer/right/util";
import AntdCommonColumnController, {AntdColumnProps} from "./AntdCommonColumnController";
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";
import {ClazzTemplate} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";

const AnimationConfig = React.lazy(() => import("@/comps/common-component/animation-config/AnimationConfig"));
const AntdColumnCommonStyleConfig = React.lazy(() => import("./AntdColumnCommonConfig").then((module) => ({default: module.AntdColumnCommonStyleConfig})));
const AntdColumnCommonFieldMapping = React.lazy(() => import("./AntdColumnCommonConfig").then((module) => ({default: module.AntdColumnCommonFieldMapping})));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));

abstract class AbstractColumnDefinition extends AntdCommonDefinition<AntdCommonColumnController, AntdColumnProps> {

    getController(): ClazzTemplate<AntdCommonColumnController> | null {
        return AntdCommonColumnController;
    }

    getMenuList(): Array<MenuInfo> {
        return getDefaultMenuList();
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdColumnCommonStyleConfig,
            animation: AnimationConfig,
            mapping: AntdColumnCommonFieldMapping
        };
    }
}

export default AbstractColumnDefinition;
