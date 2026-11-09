/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AntdCommonBarController from "@/comps/antd-common/bar/AntdCommonBarController.ts";

export default class AntdPercentBarController extends AntdCommonBarController {

    changeData(data: any) {
        super.changeData(data);
        this.instance?.render();
    }

}
