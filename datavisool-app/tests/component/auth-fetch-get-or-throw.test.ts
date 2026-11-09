/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, expect, test, vi} from 'vitest';

const request = vi.hoisted(() => vi.fn());
const handler = vi.hoisted(() => vi.fn((response: any) => response.data));
vi.mock('@/util/FetchUtil.ts', () => ({default: {doRequest: request}}));
vi.mock('@/util/AuthTools.ts', () => ({default: {getToken: () => 'test-token'}}));
vi.mock('@/api/ReponseHandler.ts', () => ({default: handler}));
vi.mock('@datavisool/ui', () => ({globalMessage: {openLoading: vi.fn(), destroy: vi.fn()}}));

import AuthFetchUtil, {AuthRequestError} from '@/util/AuthFetchUtil.ts';

beforeEach(() => { request.mockReset(); handler.mockClear(); });

test('returns authenticated GET data and forwards request options', async () => {
    const signal = new AbortController().signal;
    request.mockResolvedValue({code: 200, msg: '', data: {value: 2}});
    expect(await AuthFetchUtil.getOrThrow('/settings', {signal, suppressErrorMessage: true})).toEqual({value: 2});
    expect(request).toHaveBeenCalledWith('/settings', 'GET', {Authorization: 'Bearer test-token'}, {},
        expect.objectContaining({signal}));
});

test('propagates the server error without showing suppressed messages', async () => {
    const response = {code: 500, msg: '不支持的 AI 运行设置版本，仅支持版本 2', data: null};
    request.mockResolvedValue(response);
    await expect(AuthFetchUtil.getOrThrow('/settings', {suppressErrorMessage: true}))
        .rejects.toThrow(AuthRequestError);
    expect(handler).toHaveBeenCalledWith(response, expect.objectContaining({suppressErrorMessage: true}));
});
