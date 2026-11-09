/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export const MACOS_WEBVIEW_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 11_0_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15";

export const getDesktopWebviewUserAgent = (): string | undefined => {
    if (typeof navigator === "undefined") {
        return undefined;
    }

    const platform = navigator.platform || "";
    const userAgent = navigator.userAgent || "";
    const isMac = /mac/i.test(platform) || /macintosh|mac os x/i.test(userAgent);
    return isMac ? MACOS_WEBVIEW_USER_AGENT : undefined;
};

export const withDesktopWebviewUserAgent = <T extends Record<string, unknown>>(options: T): T & { userAgent?: string } => {
    const userAgent = getDesktopWebviewUserAgent();
    if (!userAgent) {
        return options as T & { userAgent?: string };
    }

    return {
        ...options,
        userAgent,
    };
};
