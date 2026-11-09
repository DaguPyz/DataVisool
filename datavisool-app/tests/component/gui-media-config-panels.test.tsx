/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {BaseImageStyleConfig} from '@/comps/builtin/base-image/BaseImageConfig';
import {BaseVideoStyleConfig} from '@/comps/builtin/base-video/BaseVideoConfig';
import {CarouselConfig} from '@/comps/builtin/carousel/CarouselConfig';

function makeController(style: Record<string, unknown>) {
    const update = vi.fn((fragment: {style?: Record<string, unknown>}) => Object.assign(style, fragment.style));
    return {getConfig: () => ({style}), update};
}

describe('media GUI configuration writes', () => {
    it('changes image source, online URL and opacity in the style path', () => {
        const controller = makeController({type: 'local', localUrl: '/images/local.png', onLineUrl: '', opacity: 0.5});
        const view = render(<BaseImageStyleConfig controller={controller as never}/>);

        fireEvent.click(screen.getByRole('radio', {name: '在线'}));
        expect(controller.update).toHaveBeenLastCalledWith({style: {type: 'online'}});
        fireEvent.change(screen.getByRole('textbox'), {target: {value: 'https://example.test/a.png?x=1&y=2'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {onLineUrl: 'https://example.test/a.png?x=1&y=2'}});
        fireEvent.click(screen.getByRole('radio', {name: '本地'}));
        expect(controller.update).toHaveBeenLastCalledWith({style: {type: 'local'}});

        const opacity = view.container.querySelector('input[type="number"]');
        expect(opacity).toHaveValue(0.5);
        expect(opacity).toHaveAttribute('min', '0');
        expect(opacity).toHaveAttribute('max', '1');
        fireEvent.change(opacity as HTMLInputElement, {target: {value: '1'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {opacity: 1}});
        fireEvent.change(opacity as HTMLInputElement, {target: {value: '0'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {opacity: 0}});
    });

    it('writes video URL fields, play controls and object fit', () => {
        const controller = makeController({src: '', poster: '', autoPlay: false, loop: false, muted: false, controls: true, objectFit: 'contain'});
        const view = render(<BaseVideoStyleConfig controller={controller as never}/>);
        fireEvent.click(screen.getByRole('button', {name: '基础设置'}));
        fireEvent.change(screen.getAllByRole('textbox')[0], {target: {value: '/static/video/a.mp4?x=1&y=2'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {src: '/static/video/a.mp4?x=1&y=2'}});
        fireEvent.change(screen.getAllByRole('textbox')[1], {target: {value: '/static/image/poster.png'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {poster: '/static/image/poster.png'}});

        fireEvent.click(screen.getByRole('button', {name: '播放控制'}));
        fireEvent.click(screen.getAllByRole('switch')[0]);
        expect(controller.update).toHaveBeenLastCalledWith({style: {autoPlay: true}});
        fireEvent.click(screen.getAllByRole('switch')[1]);
        expect(controller.update).toHaveBeenLastCalledWith({style: {loop: true}});

        fireEvent.click(screen.getByRole('button', {name: '样式设置'}));
        const objectFit = within(view.container).getByRole('combobox');
        fireEvent.click(objectFit);
        fireEvent.click(screen.getByRole('option', {name: '覆盖 (Cover)'}));
        expect(controller.update).toHaveBeenLastCalledWith({style: {objectFit: 'cover'}});
    });

    it('writes carousel switches and timing fields independently', () => {
        const controller = makeController({autoplay: true, autoplaySpeed: 0, dots: false, fade: false, speed: 10000});
        render(<CarouselConfig controller={controller as never}/>);
        fireEvent.click(screen.getAllByRole('switch')[0]);
        expect(controller.update).toHaveBeenLastCalledWith({style: {autoplay: false}});
        fireEvent.click(screen.getAllByRole('switch')[1]);
        expect(controller.update).toHaveBeenLastCalledWith({style: {dots: true}});
        fireEvent.click(screen.getAllByRole('switch')[2]);
        expect(controller.update).toHaveBeenLastCalledWith({style: {fade: true}});
        const autoplaySpeed = screen.getByDisplayValue('0');
        expect(autoplaySpeed).toHaveAttribute('min', '0');
        expect(autoplaySpeed).toHaveAttribute('max', '60000');
        fireEvent.change(autoplaySpeed, {target: {value: '60000'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {autoplaySpeed: 60000}});
        fireEvent.change(autoplaySpeed, {target: {value: '60001'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {autoplaySpeed: 60000}});

        const transitionSpeed = screen.getByDisplayValue('10000');
        expect(transitionSpeed).toHaveAttribute('min', '0');
        expect(transitionSpeed).toHaveAttribute('max', '10000');
        fireEvent.change(transitionSpeed, {target: {value: '1250'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {speed: 1250}});
        fireEvent.change(transitionSpeed, {target: {value: '-1'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {speed: 0}});
    });
});
