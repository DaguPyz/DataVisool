/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, waitFor} from '@testing-library/react';
import {Component, createElement, memo} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ComponentUtil} from '@datavisool/sdk/react';

describe('SDK 0.1.1 component rendering', () => {
    let container: HTMLDivElement;
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });
    afterEach(() => {
        act(() => ComponentUtil.unmount(container));
        container.remove();
        vi.restoreAllMocks();
    });

    it('settles a failed class render and recovers on the next render', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        class Example extends Component<{broken: boolean}> {
            render() {
                if (this.props.broken) throw new Error('test render error');
                return createElement('span', null, 'recovered');
            }
        }
        let failed!: Promise<Example | null>;
        await act(async () => { failed = ComponentUtil.createAndRender<Example>(container, Example as never, {broken: true}); });
        await expect(failed).resolves.toBeNull();
        await waitFor(() => expect(container.textContent).toContain('组件渲染失败'));
        let recovered!: Promise<Example | null>;
        await act(async () => { recovered = ComponentUtil.createAndRender<Example>(container, Example as never, {broken: false}); });
        expect(await recovered).toBeInstanceOf(Example);
        expect(container.textContent).toBe('recovered');
    });

    it('renders a memo-wrapped class but does not return its instance', async () => {
        class Example extends Component { render() { return createElement('span', null, 'memo'); } }
        const MemoExample = memo(Example);
        let result!: Promise<Example | null>;
        await act(async () => { result = ComponentUtil.createAndRender<Example>(container, MemoExample as never); });
        await expect(result).resolves.toBeNull();
        expect(container.textContent).toBe('memo');
    });
});
