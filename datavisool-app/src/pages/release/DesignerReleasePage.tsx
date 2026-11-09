/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useParams} from "react-router-dom";
import DesignerRelease from "../../designer/release/DesignerRelease.tsx";
import {Base64Util} from "@datavisool/sdk";

export default function DesignerReleasePage() {
    const params = useParams();
    return <DesignerRelease id={Base64Util.fromBase64(params.id as string)}/>
}
