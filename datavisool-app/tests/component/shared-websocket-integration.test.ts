/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import type {Socket} from 'node:net';
import {waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import AbstractDesignerController from '@/framework/core/AbstractDesignerController';
import BPExecutor from '@/designer/blueprint/core/BPExecutor';
import ComponentDataUpdater from '@/framework/core/tools/ComponentDataUpdater';

class Controller extends AbstractDesignerController<unknown, any> {
    changeData = vi.fn();
    update(config: any) { this.config = config; }
    getConfig() { return this.config; }
}

it.runIf(process.env.DATAVISOOL_NETWORK_TESTS === '1')('loads data from a local WebSocket server and closes the connection on destroy', async () => {
    const server = createServer();
    const sockets = new Set<Socket>();
    const closed = vi.fn();
    server.on('upgrade', (request, socket) => {
        const client = socket as Socket;
        sockets.add(client);
        client.on('close', () => { sockets.delete(client); closed(); });
        client.on('data', data => {
            if ((data[0] & 0x0f) === 8) client.end(Buffer.from([0x88, 0]));
        });
        const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
        client.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        const message = Buffer.from('local-data');
        client.write(Buffer.concat([Buffer.from([0x81, message.length]), message]));
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local server did not provide a TCP port');
    const jsdomRequire = createRequire(createRequire(import.meta.url).resolve('jsdom'));
    vi.stubGlobal('WebSocket', jsdomRequire('ws'));
    const controller = new Controller();
    try {
        await controller.create(document.createElement('div'), {
            data: {sourceType: 'webSocket', webSocket: {url: `ws://127.0.0.1:${address.port}`}},
        }, new BPExecutor({} as any));
        controller.loadComponentData();
        await waitFor(() => expect(controller.changeData).toHaveBeenCalledWith('local-data'));
        controller.destroy();
        await waitFor(() => expect(closed).toHaveBeenCalledOnce());
    } finally {
        controller.destroy();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>(resolve => server.close(() => resolve()));
        vi.unstubAllGlobals();
    }
});


it.runIf(process.env.DATAVISOOL_NETWORK_TESTS === '1')('reports a rejected local WebSocket handshake', async () => {
    const server = createServer();
    server.on('upgrade', (_request, socket) => {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    });
    await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local server did not provide a TCP port');
    const WebSocket = createRequire(createRequire(import.meta.url).resolve('jsdom'))('ws');
    vi.stubGlobal('WebSocket', WebSocket);
    const fail = vi.fn();
    const success = vi.fn();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const updater = new ComponentDataUpdater(success, fail);
    try {
        updater.run({sourceType: 'webSocket', webSocket: {url: `ws://127.0.0.1:${address.port}`}} as any);
        await waitFor(() => expect(fail).toHaveBeenCalledOnce());
        expect(success).not.toHaveBeenCalled();
    } finally {
        updater.destroy();
        await new Promise<void>(resolve => server.close(() => resolve()));
        errorLog.mockRestore();
        vi.unstubAllGlobals();
    }
});
