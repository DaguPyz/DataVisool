/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it} from 'vitest';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';

const originalBaseUrlMap = Object.getOwnPropertyDescriptor(window, '__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__');

afterEach(() => {
    if (originalBaseUrlMap)
        Object.defineProperty(window, '__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__', originalBaseUrlMap);
    else
        delete (window as any).__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__;
});

describe('runtime-owned remote component base URLs', () => {
    it.each(['older', 'newer'])('restores the original mapping after overlapping activations close %s first', first => {
        window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__ = {sharedEntry: '/legacy/'};
        const older = new DesignerRuntimeContext();
        const newer = new DesignerRuntimeContext();
        older.registerRemoteBaseUrl({}, 'sharedEntry', '/older/');
        newer.registerRemoteBaseUrl({}, 'sharedEntry', '/newer/');
        try {
            if (first === 'older') {
                older.dispose();
                expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.sharedEntry).toBe('/newer/');
                newer.dispose();
            } else {
                newer.dispose();
                expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.sharedEntry).toBe('/older/');
                older.dispose();
            }
            expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.sharedEntry).toBe('/legacy/');
        } finally {
            older.dispose();
            newer.dispose();
        }
    });

    it('keeps the latest loader mapping when an older loader closes first', () => {
        const previous = {sharedEntry: '/legacy/'};
        window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__ = previous;
        const runtime = new DesignerRuntimeContext();
        const olderLoader = {};
        const newerLoader = {};

        runtime.registerRemoteBaseUrl(olderLoader, 'sharedEntry', '/older/');
        runtime.registerRemoteBaseUrl(newerLoader, 'sharedEntry', '/newer/');
        runtime.releaseRemoteBaseUrls(olderLoader);
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.sharedEntry).toBe('/newer/');

        runtime.releaseRemoteBaseUrls(newerLoader);
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.sharedEntry).toBe('/legacy/');
        runtime.dispose();
    });

    it('removes only mappings owned by the runtime when the activation is disposed', () => {
        const previous = {sharedEntry: '/legacy/', unrelatedEntry: '/external/'};
        window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__ = previous;
        const runtime = new DesignerRuntimeContext();
        runtime.registerRemoteBaseUrl({}, 'sharedEntry', '/runtime/');

        runtime.dispose();

        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__).toEqual(previous);
    });
});
