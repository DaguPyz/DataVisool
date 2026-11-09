/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({clients: [] as any[], connect: vi.fn()}));
vi.mock('mqtt', () => ({default: {connect: mocks.connect}}));
import ComponentDataUpdater from '@/framework/core/tools/ComponentDataUpdater';

beforeEach(() => {
    mocks.clients.length = 0;
    mocks.connect.mockReset().mockImplementation(() => {
        const handlers: Record<string, (...args: any[]) => void> = {};
        const client = {handlers, on: vi.fn((name, handler) => { handlers[name] = handler; return client; }), subscribe: vi.fn(), end: vi.fn()};
        mocks.clients.push(client);
        return client;
    });
});

it('ignores MQTT errors and subscription callbacks from replaced or destroyed connections', () => {
    const fail = vi.fn();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const updater = new ComponentDataUpdater(vi.fn(), fail);
    const config = {sourceType: 'mqtt', mqtt: {host: 'ws://127.0.0.1', port: 1, topics: 'test'}} as any;
    try {
        updater.run(config);
        const old = mocks.clients[0];
        updater.run(config);
        const current = mocks.clients[1];
        expect(old.end).toHaveBeenCalledOnce();
        old.handlers.error(new Error('stale connection'));
        old.subscribe.mock.calls[0][2](new Error('stale subscription'));
        expect(fail).not.toHaveBeenCalled();
        current.handlers.error(new Error('current connection'));
        expect(fail).toHaveBeenCalledOnce();
        updater.destroy();
        current.handlers.error(new Error('closed connection'));
        current.subscribe.mock.calls[0][2](new Error('closed subscription'));
        expect(fail).toHaveBeenCalledOnce();
    } finally {
        updater.destroy();
        errorLog.mockRestore();
        warnLog.mockRestore();
    }
});


it('reports incomplete MQTT configuration and never restarts a destroyed updater', () => {
    const fail = vi.fn();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const updater = new ComponentDataUpdater(vi.fn(), fail);
    try {
        updater.run({sourceType: 'mqtt', mqtt: {host: '', port: 1, topics: 'test'}} as any);
        expect(fail).toHaveBeenCalledOnce();
        expect(mocks.connect).not.toHaveBeenCalled();
        updater.destroy();
        updater.run({sourceType: 'mqtt', mqtt: {host: 'ws://127.0.0.1', port: 1, topics: 'test'}} as any);
        expect(mocks.connect).not.toHaveBeenCalled();
        expect(fail).toHaveBeenCalledOnce();
    } finally {
        updater.destroy();
        errorLog.mockRestore();
    }
});
