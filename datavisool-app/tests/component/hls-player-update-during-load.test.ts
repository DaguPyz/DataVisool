/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, it, vi} from 'vitest';
import {waitFor} from '@testing-library/react';
const mocks = vi.hoisted(() => {
    let finishImport!: () => void;
    const importReady = new Promise<void>(resolve => { finishImport = resolve; });
    let finishRender!: (value: any) => void;
    const renderReady = new Promise<any>(resolve => { finishRender = resolve; });
    return {importReady, finishImport, renderReady, finishRender, started: false, render: vi.fn()};
});
vi.mock('@/comps/builtin/hls-player/HlsPlayerComponent.tsx', async () => {
    mocks.started = true;
    await mocks.importReady;
    return {default: function HlsPlayerFixture() { return null; }};
});
vi.mock('@/util/ComponentUtil.ts', () => ({default: {createAndRender: mocks.render, release: vi.fn()}}));
import {HlsPlayerController} from '@/comps/builtin/hls-player/HlsPlayerController';

it('preserves configuration changes while the module and component are loading', async () => {
    const instance = {destroy: vi.fn(), updateConfig: vi.fn()};
    mocks.render.mockReturnValue(mocks.renderReady);
    const controller = new HlsPlayerController();
    const creation = controller.create(document.createElement('div'), {base: {id: 'hls'}, style: {url: 'initial'}} as any, {} as any);
    await waitFor(() => expect(mocks.started).toBe(true));
    controller.update({style: {url: 'during import'}} as any);
    mocks.finishImport();
    await waitFor(() => expect(mocks.render).toHaveBeenCalledOnce());
    expect(mocks.render.mock.calls[0][2]).toMatchObject({style: {url: 'during import'}});
    controller.update({style: {url: 'during render'}} as any);
    mocks.finishRender(instance);
    await creation;
    expect(instance.updateConfig).toHaveBeenCalledWith(expect.objectContaining({style: {url: 'during render'}}));
    controller.destroy();
});
