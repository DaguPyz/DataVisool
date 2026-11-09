/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

type WebviewOptions = {
    url?: string;
    title?: string;
    [key: string]: unknown;
};

type TauriWebviewWindowCtor = new (label: string, options: WebviewOptions) => unknown;

export const isTauriRuntime = () => {
    return typeof window !== 'undefined' && (('__TAURI_INTERNALS__' in window) || ('__TAURI__' in window));
};

export const loadTauriModule = async <T = any>(specifier: string): Promise<T> => {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    return await dynamicImport(specifier);
};

export const openExternalUrl = async (url: string) => {
    if (!url) return;
    if (isTauriRuntime()) {
        try {
            const shell = await loadTauriModule<{ open: (path: string) => Promise<void> }>('@tauri-apps/plugin-shell');
            await shell.open(url);
            return;
        } catch (e) {
            console.error('openExternalUrl.tauri failed', e);
        }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
};

export const openDesktopWebview = async (label: string, options: WebviewOptions) => {
    if (isTauriRuntime()) {
        try {
            const module = await loadTauriModule<{ WebviewWindow: TauriWebviewWindowCtor }>('@tauri-apps/api/webviewWindow');
            return new module.WebviewWindow(label, options);
        } catch (e) {
            console.error('openDesktopWebview.tauri failed', e);
        }
    }
    if (options.url && typeof options.url === 'string') {
        window.open(options.url, '_blank', 'noopener,noreferrer');
    }
    return null;
};

export const selectDirectory = async (title: string): Promise<string | null> => {
    if (!isTauriRuntime()) return null;
    const dialog = await loadTauriModule<{ open: (options: any) => Promise<string | string[] | null> }>('@tauri-apps/plugin-dialog');
    const selected = await dialog.open({
        directory: true,
        multiple: false,
        title
    });
    if (!selected || Array.isArray(selected)) return null;
    return selected;
};

export const selectZipFile = async (title: string): Promise<string | null> => {
    if (!isTauriRuntime()) return null;
    const dialog = await loadTauriModule<{ open: (options: any) => Promise<string | string[] | null> }>('@tauri-apps/plugin-dialog');
    const selected = await dialog.open({
        multiple: false,
        directory: false,
        title,
        filters: [{name: 'DataVisool 项目包', extensions: ['zip']}]
    });
    if (!selected || Array.isArray(selected)) return null;
    return selected;
};

export const saveFilePath = async (options: any): Promise<string | null> => {
    if (!isTauriRuntime()) return null;
    const dialog = await loadTauriModule<{ save: (options: any) => Promise<string | null> }>('@tauri-apps/plugin-dialog');
    return await dialog.save(options);
};
