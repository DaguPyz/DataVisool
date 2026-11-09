/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {getDefaultMenuList} from "@/designer/right/util";

import AntdCommonBarController, {AntdBarProps} from "@/comps/antd-common/bar/AntdCommonBarController";
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";
import {ClazzTemplate} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";

const AnimationConfig = React.lazy(() => import("@/comps/common-component/animation-config/AnimationConfig"));
const AntdBarCommonStyleConfig = React.lazy(() => import("./AntdBarCommonConfig").then((module) => ({default: module.AntdBarCommonStyleConfig})));
const AntdBarFieldMapping = React.lazy(() => import("./AntdBarCommonConfig").then((module) => ({default: module.AntdBarFieldMapping})));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));

abstract class AbstractBarDefinition extends AntdCommonDefinition<AntdCommonBarController, AntdBarProps> {

    getController(): ClazzTemplate<AntdCommonBarController> | null {
        return AntdCommonBarController;
    }

    getMenuList(): Array<MenuInfo> {
        return getDefaultMenuList();
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdBarCommonStyleConfig,
            animation: AnimationConfig,
            mapping: AntdBarFieldMapping,
        };
    }
}

export default AbstractBarDefinition;
