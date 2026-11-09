/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {getDefaultMenuList} from "@/designer/right/util";
import AntdCommonScatterController, {AntdScatterProps} from "./AntdCommonScatterController";
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";
import {ClazzTemplate} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";

const AnimationConfig = React.lazy(() => import("@/comps/common-component/animation-config/AnimationConfig"));
const AntdScatterCommonStyleConfig = React.lazy(() => import("./AntdScatterCommonConfig").then((module) => ({default: module.AntdScatterCommonStyleConfig})));
const AntdScatterFieldMapping = React.lazy(() => import("./AntdScatterCommonConfig").then((module) => ({default: module.AntdScatterFieldMapping})));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));

abstract class AbstractScatterDefinition extends AntdCommonDefinition<AntdCommonScatterController, AntdScatterProps> {

    getController(): ClazzTemplate<AntdCommonScatterController> | null {
        return AntdCommonScatterController;
    }

    getMenuList(): Array<MenuInfo> {
        return getDefaultMenuList();
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdScatterCommonStyleConfig,
            animation: AnimationConfig,
            mapping: AntdScatterFieldMapping
        };
    }
}

export default AbstractScatterDefinition;
