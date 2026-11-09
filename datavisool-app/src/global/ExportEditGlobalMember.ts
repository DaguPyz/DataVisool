/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {registerHostConfigPanels} from "@datavisool/sdk/host";
import BaseInfo from "@/comps/common-component/base-info/BaseInfo";
import AnimationConfig from "@/comps/common-component/animation-config/AnimationConfig";
import ThemeConfig from "@/comps/common-component/theme-config/ThemeConfig";
import DataConfig from "@/comps/common-component/data-config/DataConfig";
import FilterConfig from "@/comps/common-component/filter-config/FilterConfig";
import {exportComponentRuntime} from "./ComponentRuntime";

registerHostConfigPanels({BaseInfo, AnimationConfig, ThemeConfig, DataConfig, FilterConfig});
exportComponentRuntime();
