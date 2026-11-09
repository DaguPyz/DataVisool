/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import ComponentDataUpdater from '@/framework/core/tools/ComponentDataUpdater';

const mocks = vi.hoisted(() => ({get: vi.fn(), post: vi.fn(), request: vi.fn()}));
vi.mock('@/util/AuthFetchUtil.ts', () => ({default: {get: mocks.get, post: mocks.post}}));
vi.mock('@/util/FetchUtil.ts', () => ({default: {doRequestNativeResult: mocks.request}}));
vi.mock('@/designer/left/global-variable/parse/ComponentDataGvParser.ts', () => ({
    default: {parseCommonApi: (config: unknown) => config, parseDatabase: (config: unknown) => config},
}));
vi.mock('@/util/DataUtil.ts', () => ({default: {
    resolveHeaders: async (value: unknown) => value,
    resolveParams: async (value: unknown) => value,
    applyFilterAsync: async (value: unknown) => value,
}}));

describe('shared SDK Web host data refresh', () => {
    const previousEnv = window.DATAVISOOL_ENV;
    beforeEach(() => {
        vi.useFakeTimers();
        window.DATAVISOOL_ENV = {} as never;
        mocks.get.mockResolvedValue({url: '/test', method: 'get', params: {}, headers: {}});
        mocks.post.mockResolvedValue([{value: 1}]);
        mocks.request.mockResolvedValue([{value: 2}]);
    });
    afterEach(() => {
        window.DATAVISOOL_ENV = previousEnv;
        vi.useRealTimers();
        vi.resetAllMocks();
        vi.restoreAllMocks();
    });

    it.each([
        ['common API', {sourceType: 'commonApi', commonApi: {commonApiId: 'api', autoFlush: true, frequency: 5}}, mocks.request],
        ['database', {sourceType: 'database', database: {targetDb: 'db', sql: 'select 1', autoFlush: true, frequency: 5}}, mocks.post],
    ])('loads %s immediately, refreshes on schedule and stops on destruction', async (_name, config, request) => {
        const success = vi.fn();
        const updater = new ComponentDataUpdater(success, vi.fn());
        updater.run(config as never);
        await vi.advanceTimersByTimeAsync(0);
        expect(request).toHaveBeenCalledTimes(1);
        expect(success).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(5000);
        expect(request).toHaveBeenCalledTimes(2);
        expect(success).toHaveBeenCalledTimes(2);
        updater.destroy();
        await vi.advanceTimersByTimeAsync(10000);
        expect(request).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['common API', {sourceType: 'commonApi', commonApi: {commonApiId: 'api', autoFlush: true, frequency: 5}}, mocks.request],
        ['database', {sourceType: 'database', database: {targetDb: 'db', sql: 'select 1', autoFlush: true, frequency: 5}}, mocks.post],
    ])('loads %s only once when requested', async (_name, config, request) => {
        const updater = new ComponentDataUpdater(vi.fn(), vi.fn());
        updater.run(config as never, true);
        await vi.advanceTimersByTimeAsync(10000);
        expect(request).toHaveBeenCalledTimes(1);
        updater.destroy();
    });

    it.each([null, undefined])('reports a missing common API configuration (%s)', async (missing) => {
        mocks.get.mockResolvedValue(missing);
        const failure = vi.fn();
        const updater = new ComponentDataUpdater(vi.fn(), failure);
        updater.run({sourceType: 'commonApi', commonApi: {commonApiId: 'api'}} as never);
        await vi.advanceTimersByTimeAsync(0);
        expect(failure).toHaveBeenCalledOnce();
        expect(mocks.request).not.toHaveBeenCalled();
        updater.destroy();
    });

    it.each([
        ['common API', {sourceType: 'commonApi', commonApi: {commonApiId: 'api'}}, mocks.get],
        ['database', {sourceType: 'database', database: {targetDb: 'db', sql: 'select 1'}}, mocks.post],
    ])('reports a failed %s request but ignores a failure after destruction', async (_name, config, request) => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        request.mockRejectedValueOnce(new Error('request failed'));
        const failure = vi.fn();
        const updater = new ComponentDataUpdater(vi.fn(), failure);
        updater.run(config as never);
        await vi.advanceTimersByTimeAsync(0);
        expect(failure).toHaveBeenCalledOnce();
        updater.destroy();

        let reject!: (error: Error) => void;
        request.mockReturnValueOnce(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
        const staleFailure = vi.fn();
        const staleUpdater = new ComponentDataUpdater(vi.fn(), staleFailure);
        staleUpdater.run(config as never);
        await vi.advanceTimersByTimeAsync(0);
        staleUpdater.destroy();
        reject(new Error('late failure'));
        await vi.advanceTimersByTimeAsync(0);
        expect(staleFailure).not.toHaveBeenCalled();
    });

    it('recovers on the next database refresh after a failed request', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.post.mockRejectedValueOnce(new Error('temporary failure'));
        const success = vi.fn();
        const failure = vi.fn();
        const updater = new ComponentDataUpdater(success, failure);
        updater.run({sourceType: 'database', database: {targetDb: 'db', sql: 'select 1', autoFlush: true, frequency: 5}} as never);
        await vi.advanceTimersByTimeAsync(0);
        expect(failure).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(5000);
        expect(success).toHaveBeenCalledWith([{value: 1}]);
        updater.destroy();
    });
});
