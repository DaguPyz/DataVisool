/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, it, vi} from 'vitest';
import ComponentDataUpdater from '@/framework/core/tools/ComponentDataUpdater';

it('reports only the active WebSocket error and ignores callbacks after destroy', () => {
    const sockets: Array<{onerror?: (event: Event) => void; close: ReturnType<typeof vi.fn>}> = [];
    class FakeSocket {
        onerror?: (event: Event) => void;
        onmessage?: (event: MessageEvent) => void;
        close = vi.fn();
        constructor() { sockets.push(this); }
    }
    vi.stubGlobal('WebSocket', FakeSocket);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fail = vi.fn();
    const updater = new ComponentDataUpdater(vi.fn(), fail);
    const config = {sourceType: 'webSocket', webSocket: {url: 'ws://127.0.0.1/test'}} as any;
    try {
        updater.run(config);
        updater.run(config);
        expect(sockets[0].close).toHaveBeenCalledOnce();
        sockets[0].onerror?.(new Event('error'));
        expect(fail).not.toHaveBeenCalled();
        sockets[1].onerror?.(new Event('error'));
        expect(fail).toHaveBeenCalledOnce();
        updater.destroy();
        sockets[1].onerror?.(new Event('error'));
        expect(fail).toHaveBeenCalledOnce();
    } finally {
        updater.destroy();
        errorLog.mockRestore();
        vi.unstubAllGlobals();
    }
});
