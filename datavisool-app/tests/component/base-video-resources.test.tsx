/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createRef} from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import BaseVideoComponent, {BaseVideoComponentRef} from '@/comps/builtin/base-video/BaseVideoComponent.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('video resources', () => {
    it('loads root-relative video and poster resources and reloads when the source changes', () => {
        const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
        const ref = createRef<BaseVideoComponentRef>();
        const {container} = render(<BaseVideoComponent ref={ref} style={{
            src: '/static/videos/first.mp4', poster: '/static/images/poster.png',
        }} />);
        const video = container.querySelector('video')!;
        expect(video.getAttribute('poster')).toBe(`${window.location.origin}/static/images/poster.png`);
        expect(video.querySelector('source')!.getAttribute('src')).toBe(`${window.location.origin}/static/videos/first.mp4`);
        expect(load).not.toHaveBeenCalled();

        act(() => ref.current!.updateConfig({style: {src: '/static/videos/next.mp4', poster: 'https://example.test/poster.png'}}));
        expect(video.querySelector('source')!.getAttribute('src')).toBe(`${window.location.origin}/static/videos/next.mp4`);
        expect(video.getAttribute('poster')).toBe('https://example.test/poster.png');
        expect(load).toHaveBeenCalledOnce();
    });
});
