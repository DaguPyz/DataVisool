/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {URLUtil} from "@datavisool/sdk";
import Designer from "../../designer/Designer.tsx";

export default function DesignerPage() {
    const {id} = URLUtil.parseUrlParams();
    return <Designer id={id}/>
}
