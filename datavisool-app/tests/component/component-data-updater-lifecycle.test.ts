/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mqttConnect = vi.hoisted(() => vi.fn());
vi.mock('mqtt', () => ({default: {connect: mqttConnect}}));

import ComponentDataUpdater from '@/framework/core/tools/ComponentDataUpdater';

class FakeWebSocket {
    onmessage?: (event: MessageEvent) => Promise<void>;
    onerror?: (event: Event) => void;
    onclose?: (event: CloseEvent) => void;
    close = vi.fn(() => this.onclose?.(new CloseEvent('close')));

    constructor(readonly url: string, readonly protocols: string[]) {
        sockets.push(this);
    }
}

const sockets: FakeWebSocket[] = [];
const websocketConfig = {sourceType: 'webSocket', webSocket: {url: 'ws://localhost/data'}} as any;

function createMqttClient() {
    return {
        end: vi.fn(),
        on: vi.fn(),
        subscribe: vi.fn((_topics: string[], _options: unknown, callback: (error?: Error | null) => void) => callback(null)),
    };
}

describe('ComponentDataUpdater transport lifecycle', () => {
    beforeEach(() => {
        sockets.length = 0;
        mqttConnect.mockReset();
        vi.stubGlobal('WebSocket', FakeWebSocket);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('retries after exactly three seconds, suppresses the old socket, and accepts new data', async () => {
        const success = vi.fn();
        const fail = vi.fn();
        const updater = new ComponentDataUpdater(success, fail);
        try {
            updater.run(websocketConfig);
            sockets[0].onerror?.(new Event('error'));
            sockets[0].onclose?.(new CloseEvent('close'));
            expect(fail).toHaveBeenCalledOnce();

            vi.advanceTimersByTime(2999);
            expect(sockets).toHaveLength(1);
            vi.advanceTimersByTime(1);
            expect(sockets).toHaveLength(2);
            expect(vi.getTimerCount()).toBe(0);
            expect(sockets[0].close).toHaveBeenCalledOnce();

            await sockets[0].onmessage?.({data: 'stale'} as MessageEvent);
            expect(success).not.toHaveBeenCalled();
            await sockets[1].onmessage?.({data: 'reconnected'} as MessageEvent);
            expect(success).toHaveBeenCalledWith('reconnected');
        } finally {
            updater.destroy();
        }
    });

    it('closes the socket and cancels its retry when switching to static data', () => {
        const updater = new ComponentDataUpdater(vi.fn(), vi.fn());
        try {
            updater.run(websocketConfig);
            sockets[0].onerror?.(new Event('error'));
            updater.run({sourceType: 'static', staticData: {value: 'static'}} as any);
            expect(sockets[0].close).toHaveBeenCalledOnce();
            vi.advanceTimersByTime(3000);
            expect(sockets).toHaveLength(1);
        } finally {
            updater.destroy();
        }
    });

    it('cancels WebSocket retries when switching to MQTT and ends MQTT when switching away', () => {
        const mqttClient = createMqttClient();
        mqttConnect.mockReturnValue(mqttClient);
        const updater = new ComponentDataUpdater(vi.fn(), vi.fn());
        try {
            updater.run(websocketConfig);
            sockets[0].onerror?.(new Event('error'));
            updater.run({sourceType: 'mqtt', mqtt: {host: 'ws://localhost', port: 8080, topics: 'test'}} as any);
            expect(sockets[0].close).toHaveBeenCalledOnce();
            expect(mqttConnect).toHaveBeenCalledOnce();
            vi.advanceTimersByTime(3000);
            expect(sockets).toHaveLength(1);

            updater.run({sourceType: 'static', staticData: {value: 'static'}} as any);
            expect(mqttClient.end).toHaveBeenCalledOnce();
        } finally {
            updater.destroy();
        }
    });

    it('replaces an active WebSocket on same-source run and ignores the old socket callbacks', async () => {
        const success = vi.fn();
        const updater = new ComponentDataUpdater(success, vi.fn());
        try {
            updater.run(websocketConfig);
            const oldMessage = sockets[0].onmessage?.({data: 'old'} as MessageEvent);
            updater.run(websocketConfig);
            expect(sockets).toHaveLength(2);
            expect(sockets[0].close).toHaveBeenCalledOnce();
            await oldMessage;
            expect(success).not.toHaveBeenCalled();

            await sockets[1].onmessage?.({data: 'current'} as MessageEvent);
            expect(success).toHaveBeenCalledWith('current');
        } finally {
            updater.destroy();
        }
    });

    it('clears a pending reconnect and prevents restarting after destroy', () => {
        const updater = new ComponentDataUpdater(vi.fn(), vi.fn());
        updater.run(websocketConfig);
        sockets[0].onerror?.(new Event('error'));
        updater.destroy();
        updater.run(websocketConfig);
        vi.advanceTimersByTime(3000);
        expect(sockets).toHaveLength(1);
        expect(sockets[0].close).toHaveBeenCalledOnce();
    });

    it('clears the old refresh interval when a new data source replaces it', () => {
        const updater = new ComponentDataUpdater(vi.fn(), vi.fn(), {
            globalVariableManager: {globalVariableInstance: {}},
        } as any);
        try {
            updater.run({sourceType: 'database', database: {sql: '', autoFlush: true, frequency: 1}} as any);
            expect(vi.getTimerCount()).toBe(1);
            updater.run({sourceType: 'static', staticData: {value: 'static'}} as any);
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            updater.destroy();
        }
    });
});
