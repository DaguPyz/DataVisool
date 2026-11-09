/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, it, vi} from 'vitest';
import {waitFor} from '@testing-library/react';
const mocks = vi.hoisted(() => {
    let fail!: (reason: Error) => void;
    const pending = new Promise<never>((_, reject) => { fail = reject; });
    return {pending, fail, started: false, render: vi.fn()};
});
vi.mock('@/comps/builtin/hls-player/HlsPlayerComponent.tsx', async () => {
    mocks.started = true;
    return mocks.pending;
});
vi.mock('@/util/ComponentUtil.ts', () => ({default: {createAndRender: mocks.render, release: vi.fn()}}));
import {HlsPlayerController} from '@/comps/builtin/hls-player/HlsPlayerController';

it('propagates a module load error for an active controller', async () => {
    const active = new HlsPlayerController();
    const config = {style: {url: ''}} as any;
    const first = active.create(document.createElement('div'), config, {} as any);
    await waitFor(() => expect(mocks.started).toBe(true));
    const failure = first.then(() => null, error => error);
    mocks.fail(new Error('module unavailable'));
    const error = await failure;
    expect(error).toBeInstanceOf(Error);
    expect(error.cause?.message ?? error.message).toContain('module unavailable');
    expect(mocks.render).not.toHaveBeenCalled();
    active.destroy();
});
