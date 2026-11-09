/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createRequire} from 'node:module';
import {waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import ComponentDataUpdater from '@/framework/core/tools/ComponentDataUpdater';

it.runIf(process.env.DATAVISOOL_NETWORK_TESTS === '1')('reports subscription rejection and stops after destruction', async () => {
    const localRequire = createRequire(import.meta.url);
    const WebSocket = createRequire(localRequire.resolve('jsdom'))('ws');
    const packet = createRequire(localRequire.resolve('mqtt'))('mqtt-packet');
    const broker = new WebSocket.Server({host: '127.0.0.1', port: 0, path: '/mqtt'});
    const attempted = vi.fn();
    broker.on('connection', (socket: any) => {
        const parser = packet.parser();
        socket.on('message', (data: Buffer) => parser.parse(data));
        parser.on('packet', (received: any) => {
            if (received.cmd === 'connect') {
                attempted();
                socket.send(packet.generate({cmd: 'connack', returnCode: 0, sessionPresent: false}));
            }
            if (received.cmd === 'subscribe') {
                socket.send(packet.generate({cmd: 'suback', messageId: received.messageId, granted: [128]}));
            }
            if (received.cmd === 'disconnect') socket.close();
        });
    });
    await new Promise<void>((resolve, reject) => {broker.once('listening', resolve); broker.once('error', reject);});
    const address = broker.address();
    if (!address || typeof address === 'string') throw new Error('Local MQTT test server did not provide a TCP port');
    vi.stubGlobal('WebSocket', WebSocket);
    const fail = vi.fn();
    const success = vi.fn();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const updater = new ComponentDataUpdater(success, fail);
    try {
        updater.run({sourceType: 'mqtt', mqtt: {host: 'ws://127.0.0.1', port: address.port, path: '/mqtt', topics: 'test/auth', keepalive: 0, reconnectPeriod: 0, username: 'test-user', password: 'test-password'}} as any);
        await waitFor(() => expect(fail).toHaveBeenCalled(), {timeout: 3000});
        expect(fail).toHaveBeenCalledOnce();
        expect(attempted).toHaveBeenCalledOnce();
        expect(success).not.toHaveBeenCalled();
        updater.destroy();
    } finally {
        updater.destroy();
        for (const socket of broker.clients) socket.terminate();
        await new Promise<void>(resolve => broker.close(() => resolve()));
        vi.unstubAllGlobals();
        errorLog.mockRestore();
        warnLog.mockRestore();
    }
}, 6000);
