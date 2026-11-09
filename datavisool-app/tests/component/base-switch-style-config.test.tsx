/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SwitchStyleConfig} from '@/comps/builtin/base-switch/BaseSwitchStyleConfig';

function renderConfig(style: Record<string, any>) {
    const update = vi.fn();
    const controller = {getConfig: () => ({style}), update};
    const view = render(<SwitchStyleConfig controller={controller as any}/>);
    return {...view, update};
}

describe('BaseSwitchStyleConfig', () => {
    beforeEach(() => {
        window.DATAVISOOL_ENV = {fonts: []} as any;
    });

    it('writes loading and disabled to style.props through the rendered GUI', () => {
        const {update} = renderConfig({props: {loading: false, disabled: false}});
        fireEvent.click(screen.getByRole('button', {name: '基础设置'}));
        const [loading, disabled] = screen.getAllByRole('switch');

        fireEvent.click(loading);
        expect(update).toHaveBeenLastCalledWith({style: {props: {loading: true}}});
        fireEvent.click(disabled);
        expect(update).toHaveBeenLastCalledWith({style: {props: {disabled: true}}});
    });

    it('preserves configured zero dimensions and uses matching defaults when absent', () => {
        const view = renderConfig({components: {
            handleSize: 0, trackHeight: 0, trackMinWidth: 0, trackPadding: 0,
        }});
        fireEvent.click(screen.getByRole('button', {name: '开关按钮样式'}));
        expect(Array.from(view.container.querySelectorAll<HTMLInputElement>('input[type="number"]')).map(input => input.value))
            .toEqual(['0', '0', '0', '0']);

        view.unmount();
        const defaults = renderConfig({components: {}});
        fireEvent.click(screen.getByRole('button', {name: '开关按钮样式'}));
        expect(Array.from(defaults.container.querySelectorAll<HTMLInputElement>('input[type="number"]')).map(input => input.value))
            .toEqual(['20', '24', '44', '2']);
    });
});
