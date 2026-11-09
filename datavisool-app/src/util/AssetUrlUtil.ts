/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export default class AssetUrlUtil {
    private static readonly ASSET_HTTP_PREFIX = 'http://asset.localhost/';
    private static readonly ASSET_SCHEME_PREFIX = 'asset://localhost/';

    public static isTauri() {
        return typeof window !== 'undefined' && (('__TAURI_INTERNALS__' in window) || ('__TAURI__' in window));
    }

    public static isAssetLikeUrl(url?: string | null) {
        const value = (url || '').trim();
        return value.startsWith(AssetUrlUtil.ASSET_HTTP_PREFIX) || value.startsWith(AssetUrlUtil.ASSET_SCHEME_PREFIX);
    }

    public static decodeAssetLikeUrl(url?: string | null) {
        const value = (url || '').trim();
        if (!value) return value;
        let encoded = value;
        if (value.startsWith(AssetUrlUtil.ASSET_HTTP_PREFIX))
            encoded = value.slice(AssetUrlUtil.ASSET_HTTP_PREFIX.length);
        else if (value.startsWith(AssetUrlUtil.ASSET_SCHEME_PREFIX))
            encoded = value.slice(AssetUrlUtil.ASSET_SCHEME_PREFIX.length);
        try {
            return decodeURIComponent(encoded);
        } catch {
            return encoded;
        }
    }

    private static isWindowsAbsolutePath(value: string) {
        return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
    }

    private static isUnixAbsolutePath(value: string) {
        return /^\/(Users|home|var|private|opt|Volumes|tmp|Applications|System|Library|data)\//.test(value);
    }

    private static isLocalAbsolutePath(value: string) {
        return AssetUrlUtil.isWindowsAbsolutePath(value) || AssetUrlUtil.isUnixAbsolutePath(value);
    }

    private static isWebRelativePath(value: string) {
        return value.startsWith('/') || value.startsWith('./') || value.startsWith('../');
    }

    private static isNetworkLikeUrl(value: string) {
        return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:') || value.startsWith('blob:');
    }

    private static normalizeLocalPath(value: string) {
        return value.replace(/\\/g, '/');
    }

    private static stripQueryAndHash(value: string) {
        return value.split('#')[0].split('?')[0];
    }

    private static resolveRelativePath(baseDir: string, relativePath: string) {
        const normalizedBase = AssetUrlUtil.normalizeLocalPath(baseDir);
        const normalizedRelative = AssetUrlUtil.normalizeLocalPath(relativePath);

        const windowsRootMatch = normalizedBase.match(/^[A-Za-z]:\//);
        const isUnix = normalizedBase.startsWith('/');
        const root = windowsRootMatch?.[0] ?? (isUnix ? '/' : '');

        const baseBody = windowsRootMatch
            ? normalizedBase.slice(windowsRootMatch[0].length)
            : (isUnix ? normalizedBase.slice(1) : normalizedBase);

        const segments = baseBody.split('/').filter(Boolean);
        for (const part of normalizedRelative.split('/')) {
            if (!part || part === '.') continue;
            if (part === '..') {
                segments.pop();
                continue;
            }
            segments.push(part);
        }
        return `${root}${segments.join('/')}`;
    }

    private static toLocalPath(url?: string | null) {
        const value = (url || '').trim();
        if (!value) return value;

        if (AssetUrlUtil.isAssetLikeUrl(value))
            return AssetUrlUtil.normalizeLocalPath(AssetUrlUtil.stripQueryAndHash(AssetUrlUtil.decodeAssetLikeUrl(value)));

        if (AssetUrlUtil.isLocalAbsolutePath(value))
            return AssetUrlUtil.normalizeLocalPath(AssetUrlUtil.stripQueryAndHash(value));

        return '';
    }

    public static toAssetUrl(path?: string | null) {
        const value = (path || '').trim();
        if (!value) return value;
        if (AssetUrlUtil.isAssetLikeUrl(value)) {
            if (!AssetUrlUtil.isTauri()) return value;
            return AssetUrlUtil.decodeAssetLikeUrl(value);
        }
        if (AssetUrlUtil.isNetworkLikeUrl(value))
            return value;
        if (value.startsWith('asset://') || value.startsWith('tauri://'))
            return value;
        return value;
    }

    public static toLoadableUrl(url?: string | null) {
        const value = (url || '').trim();
        if (!value) return value;

        const resourceUrl = value;

        const assetOrLocal = AssetUrlUtil.toAssetUrl(resourceUrl);
        if (assetOrLocal !== resourceUrl)
            return assetOrLocal;

        if (AssetUrlUtil.isLocalAbsolutePath(resourceUrl))
            return resourceUrl;

        if (AssetUrlUtil.isNetworkLikeUrl(resourceUrl) || resourceUrl.startsWith('asset://') || resourceUrl.startsWith('tauri://'))
            return resourceUrl;

        if (AssetUrlUtil.isWebRelativePath(resourceUrl) && typeof window !== 'undefined')
            return new URL(resourceUrl, window.location.origin).toString();

        return resourceUrl;
    }

    public static toResourceDirectoryUrl(url?: string | null) {
        const localPath = AssetUrlUtil.toLocalPath(url);
        if (!localPath)
            return '';

        const lastSlashIndex = localPath.lastIndexOf('/');
        if (lastSlashIndex < 0)
            return '';

        const baseDir = localPath.slice(0, lastSlashIndex + 1);
        return AssetUrlUtil.toLoadableUrl(baseDir);
    }

    public static resolveSubResourceUrl(baseUrl?: string | null, requestUrl?: string | null) {
        const request = (requestUrl || '').trim();
        if (!request) return request;

        if (AssetUrlUtil.isNetworkLikeUrl(request) || request.startsWith('asset://') || request.startsWith('tauri://'))
            return request;

        if (request.startsWith('/')) {
            const absolute = AssetUrlUtil.toLoadableUrl(request);
            return absolute || request;
        }

        const localBasePath = AssetUrlUtil.toLocalPath(baseUrl);
        if (!localBasePath)
            return request;

        const lastSlashIndex = localBasePath.lastIndexOf('/');
        if (lastSlashIndex < 0)
            return request;

        const baseDir = localBasePath.slice(0, lastSlashIndex + 1);
        const resolvedPath = AssetUrlUtil.resolveRelativePath(baseDir, request);
        return AssetUrlUtil.toLoadableUrl(resolvedPath) || request;
    }
}
