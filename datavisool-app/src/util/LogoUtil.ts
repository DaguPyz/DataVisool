/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export const setFavicon = (url: string, defaultUrl: string) => {
    if (!url) return;
    const testImage = new Image();
    testImage.onload = () => {
        updateFavicon(url);
        testImage.onload = null;
    };
    testImage.onerror = () => {
        updateFavicon(defaultUrl);
        testImage.onerror = null;
    };
    testImage.src = url;
};

const updateFavicon = (href: string) => {
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = href;
};
