/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, expect, it, vi} from 'vitest';
import {waitFor} from '@testing-library/react';

const mocks = vi.hoisted(() => {
    let finishImport!: () => void;
    const importReady = new Promise<void>(resolve => { finishImport = resolve; });
    return {importReady, finishImport, started: false, render: vi.fn()};
});
vi.mock('@/comps/builtin/hls-player/HlsPlayerComponent.tsx', async () => {
    mocks.started = true;
    await mocks.importReady;
    return {default: function HlsPlayerFixture() { return null; }};
});
vi.mock('@/util/ComponentUtil.ts', () => ({default: {createAndRender: mocks.render, release: vi.fn()}}));
import {HlsPlayerController} from '@/comps/builtin/hls-player/HlsPlayerController';

beforeEach(() => { mocks.render.mockReset(); });

it('does not render an HLS component destroyed while its code is loading', async () => {
    const controller = new HlsPlayerController();
    expect(mocks.started).toBe(false);
    const creation = controller.create(document.createElement('div'), {base: {id: 'hls'}} as any, {} as any);
    await waitFor(() => expect(mocks.started).toBe(true));
    controller.destroy();
    mocks.finishImport();
    await expect(creation).resolves.toBeUndefined();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(controller.instance).toBeNull();
});

it('creates, updates and destroys the player after loading its module', async () => {
    const instance = {destroy: vi.fn(), updateConfig: vi.fn(), setEventHandler: vi.fn()};
    mocks.render.mockResolvedValue(instance);
    const controller = new HlsPlayerController();
    const config = {base: {id: 'hls'}, style: {url: 'initial'}} as any;
    await controller.create(document.createElement('div'), config, {} as any);
    expect(mocks.render).toHaveBeenCalledOnce();
    controller.update({style: {url: 'changed'}} as any);
    expect(instance.updateConfig).toHaveBeenCalledWith(expect.objectContaining({style: {url: 'changed'}}));
    controller.destroy();
    expect(instance.destroy).toHaveBeenCalledOnce();
});
