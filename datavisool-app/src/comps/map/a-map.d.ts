/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

declare global {
    interface Window {
        AMap_Key: string;
        AMap_securityJsCode: string;
        _AMapSecurityConfig: {
            securityJsCode: string;
        };
    }
}

export {}