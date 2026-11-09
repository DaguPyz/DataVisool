/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {URLUtil} from "@datavisool/sdk";
import DesignerView from "../../designer/view/DesignerView.tsx";

export default function DesignerViewPage() {
    const {id} = URLUtil.parseUrlParams();
    return <DesignerView id={id}/>
}
