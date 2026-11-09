/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createRequire} from 'node:module';
import {waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import ComponentDataUpdater from '@/framework/core/tools/ComponentDataUpdater';

it.runIf(process.env.DATAVISOOL_NETWORK_TESTS === '1')('receives data again after a local WebSocket server disconnects', async () => {
    const localRequire = createRequire(import.meta.url);
    const WebSocket = createRequire(localRequire.resolve('jsdom'))('ws');
    const server = new WebSocket.Server({host: '127.0.0.1', port: 0});
    let connectionCount = 0;
    server.on('connection', (socket: any) => {
        connectionCount += 1;
        if (connectionCount === 1) {
            socket.send('before-reconnect');
            setTimeout(() => socket.terminate(), 10);
        } else if (connectionCount === 2) {
            socket.send('after-reconnect');
        }
    });
    await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local WebSocket server did not provide a TCP port');
    vi.stubGlobal('WebSocket', WebSocket);
    const success = vi.fn();
    const fail = vi.fn();
    const updater = new ComponentDataUpdater(success, fail);
    try {
        updater.run({sourceType: 'webSocket', webSocket: {url: `ws://127.0.0.1:${address.port}`}} as any);
        await waitFor(() => expect(success).toHaveBeenCalledWith('before-reconnect'));
        await waitFor(() => expect(success).toHaveBeenCalledWith('after-reconnect'), {timeout: 8000});
        expect(connectionCount).toBe(2);
        expect(fail).toHaveBeenCalledOnce();
    } finally {
        updater.destroy();
        for (const socket of server.clients) socket.terminate();
        await new Promise<void>(resolve => server.close(() => resolve()));
        vi.unstubAllGlobals();
    }
}, 10000);
