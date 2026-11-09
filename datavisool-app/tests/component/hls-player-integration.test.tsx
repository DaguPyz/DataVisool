/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {HlsPlayerController} from '@/comps/builtin/hls-player/HlsPlayerController';

vi.mock('hls.js', () => ({default: class Hls {
    static isSupported() { return false; }
}}));

it('renders the lazy HLS player and delivers its click event', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const executor = {triggerComponentEvent: vi.fn()};
    const controller = new HlsPlayerController();
    try {
        const config = {base: {id: 'hls-player'}, style: {url: ''}} as any;
        const creation = controller.create(container, config, executor as any, 3);
        await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
        await creation;
        controller.registerEvent();
        fireEvent.click(container.querySelector('video')!);
        expect(executor.triggerComponentEvent).toHaveBeenCalledWith('hls-player', 'click', config, 3);
        controller.destroy();
        await waitFor(() => expect(container.querySelector('video')).toBeNull());
    } finally {
        controller.destroy();
        container.remove();
    }
});
