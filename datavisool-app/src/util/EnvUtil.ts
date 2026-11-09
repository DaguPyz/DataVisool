/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {DesignerMode} from "@datavisool/sdk/types";

export default class EnvUtil {
    public static getModeByUrl() {
        const {pathname} = window.location;
        if (pathname.startsWith("/preview"))
            return DesignerMode.PREVIEW
        if (pathname.startsWith("/designer"))
            return DesignerMode.EDIT
        if (pathname.startsWith("/release"))
            return DesignerMode.RELEASE
        return null;
    }
}
