/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import DynamicScriptList from "@/pages/home/dynamic-script/DynamicScriptList.tsx";

const DynamicScriptManagement = observer(() => {
    return <DynamicScriptList title={'动态脚本管理'} variant="resource"/>
})

export default DynamicScriptManagement
