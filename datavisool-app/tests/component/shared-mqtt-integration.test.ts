/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createRequire} from 'node:module';
import {waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import AbstractDesignerController from '@/framework/core/AbstractDesignerController';
import BPExecutor from '@/designer/blueprint/core/BPExecutor';

class Controller extends AbstractDesignerController<unknown, any> {
    changeData = vi.fn();
    update(config: any) { this.config = config; }
    getConfig() { return this.config; }
}

it.runIf(process.env.DATAVISOOL_NETWORK_TESTS === '1')('receives a subscribed MQTT message and disconnects on destroy', async () => {
    const localRequire = createRequire(import.meta.url);
    const jsdomRequire = createRequire(localRequire.resolve('jsdom'));
    const mqttRequire = createRequire(localRequire.resolve('mqtt'));
    const WebSocket = jsdomRequire('ws');
    const packet = mqttRequire('mqtt-packet');
    const broker = new WebSocket.Server({host: '127.0.0.1', port: 0, path: '/mqtt'});
    const closed = vi.fn();
    const subscribed = vi.fn();
    broker.on('connection', (socket: any) => {
        const parser = packet.parser();
        socket.on('close', closed);
        socket.on('message', (data: Buffer) => parser.parse(data));
        parser.on('packet', (received: any) => {
            if (received.cmd === 'connect') socket.send(packet.generate({cmd: 'connack', returnCode: 0, sessionPresent: false}));
            if (received.cmd === 'subscribe') {
                subscribed(received.subscriptions.map((subscription: {topic: string}) => subscription.topic));
                socket.send(packet.generate({cmd: 'suback', messageId: received.messageId, granted: received.subscriptions.map(() => 0)}));
                setTimeout(() => {
                    if (socket.readyState === WebSocket.OPEN) socket.send(packet.generate({cmd: 'publish', topic: 'test/data', payload: 'mqtt-data', qos: 0}));
                }, 20);
            }
        });
    });
    await new Promise<void>((resolve, reject) => { broker.once('listening', resolve); broker.once('error', reject); });
    const address = broker.address();
    if (!address || typeof address === 'string') throw new Error('Local MQTT test server did not provide a TCP port');
    vi.stubGlobal('WebSocket', WebSocket);
    const controller = new Controller();
    try {
        await controller.create(document.createElement('div'), {
            data: {sourceType: 'mqtt', mqtt: {host: 'ws://127.0.0.1', port: address.port, path: '/mqtt', topics: '  test/data , floor 1/temperature , x\\s/y  ', keepalive: 0}},
        }, new BPExecutor({} as any));
        controller.loadComponentData();
        await waitFor(() => expect(controller.changeData).toHaveBeenCalledWith({topic: 'test/data', message: 'mqtt-data'}));
        expect(subscribed).toHaveBeenCalledWith(['test/data', 'floor 1/temperature', 'x\\s/y']);
        controller.destroy();
        await waitFor(() => expect(closed).toHaveBeenCalledOnce());
    } finally {
        controller.destroy();
        for (const socket of broker.clients) socket.terminate();
        await new Promise<void>(resolve => broker.close(() => resolve()));
        vi.unstubAllGlobals();
    }
});

it.runIf(process.env.DATAVISOOL_NETWORK_TESTS === '1')('authenticates and resubscribes after a local MQTT broker reconnect', async () => {
    const localRequire = createRequire(import.meta.url);
    const WebSocket = createRequire(localRequire.resolve('jsdom'))('ws');
    const packet = createRequire(localRequire.resolve('mqtt'))('mqtt-packet');
    const broker = new WebSocket.Server({host: '127.0.0.1', port: 0, path: '/mqtt'});
    const connected = vi.fn();
    const subscribed = vi.fn();
    broker.on('connection', (socket: any) => {
        const parser = packet.parser();
        socket.on('message', (data: Buffer) => parser.parse(data));
        parser.on('packet', (received: any) => {
            if (received.cmd === 'connect') {
                const credentials = {username: received.username, password: received.password?.toString()};
                connected(credentials);
                const returnCode = credentials.username === 'test-user' && credentials.password === 'test-password' ? 0 : 4;
                socket.send(packet.generate({cmd: 'connack', returnCode, sessionPresent: false}));
            }
            if (received.cmd === 'subscribe') {
                subscribed(received.subscriptions.map((item: {topic: string}) => item.topic));
                socket.send(packet.generate({cmd: 'suback', messageId: received.messageId, granted: received.subscriptions.map(() => 0)}));
                if (subscribed.mock.calls.length === 1) {
                    setTimeout(() => socket.terminate(), 10);
                } else {
                    setTimeout(() => {
                        if (socket.readyState === WebSocket.OPEN) socket.send(packet.generate({cmd: 'publish', topic: 'test/reconnect', payload: 'after-reconnect', qos: 0}));
                    }, 10);
                }
            }
            if (received.cmd === 'disconnect') socket.close();
        });
    });
    await new Promise<void>((resolve, reject) => {broker.once('listening', resolve); broker.once('error', reject);});
    const address = broker.address();
    if (!address || typeof address === 'string') throw new Error('Local MQTT test server did not provide a TCP port');
    vi.stubGlobal('WebSocket', WebSocket);
    const controller = new Controller();
    try {
        await controller.create(document.createElement('div'), {
            data: {sourceType: 'mqtt', mqtt: {host: 'ws://127.0.0.1', port: address.port, path: '/mqtt', topics: 'test/reconnect', keepalive: 0, reconnectPeriod: 50, username: 'test-user', password: 'test-password'}},
        }, new BPExecutor({} as any));
        controller.loadComponentData();
        await waitFor(() => expect(controller.changeData).toHaveBeenCalledWith({topic: 'test/reconnect', message: 'after-reconnect'}), {timeout: 8000});
        expect(connected).toHaveBeenCalledTimes(2);
        expect(connected).toHaveBeenNthCalledWith(1, {username: 'test-user', password: 'test-password'});
        expect(connected).toHaveBeenNthCalledWith(2, {username: 'test-user', password: 'test-password'});
        expect(subscribed).toHaveBeenCalledTimes(2);
        expect(subscribed).toHaveBeenLastCalledWith(['test/reconnect']);
    } finally {
        controller.destroy();
        for (const socket of broker.clients) socket.terminate();
        await new Promise<void>(resolve => broker.close(() => resolve()));
        vi.unstubAllGlobals();
    }
}, 10000);
