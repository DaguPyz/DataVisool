/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, waitFor} from '@testing-library/react';
import {Component, createElement, forwardRef, memo, useImperativeHandle} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useDataVisoolUI} from '@datavisool/ui';
import {getLocale, setLocale} from '@/i18n/miniI18n';
import ComponentUtil from '@/util/ComponentUtil';

describe('ComponentUtil shared SDK adapter', () => {
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

    it('updates the rendered content when reusing a container', async () => {
        const Template = (props: {value: string}) => createElement('span', null, props.value);
        await act(async () => { await ComponentUtil.createAndRender(container, Template as never, {value: 'first'}); });
        expect(container.textContent).toBe('first');
        await act(async () => { await ComponentUtil.createAndRender(container, Template as never, {value: 'second'}); });
        expect(container.textContent).toBe('second');
    });

    it('can render again after unmounting a container', async () => {
        const Template = () => createElement('span', null, 'content');
        await act(async () => { await ComponentUtil.createAndRender(container, Template as never); });
        act(() => ComponentUtil.unmount(container));
        expect(container.textContent).toBe('');
        await act(async () => { await ComponentUtil.createAndRender(container, Template as never); });
        expect(container.textContent).toBe('content');
    });

    it('recovers when a reused container renders successfully after an error', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const Broken = () => { throw new Error('broken render'); };
        const Healthy = () => createElement('span', null, 'render ok');
        await act(async () => { await ComponentUtil.createAndRender(container, Broken as never); });
        await waitFor(() => expect(container.textContent).toContain('组件渲染失败'));
        await act(async () => { await ComponentUtil.createAndRender(container, Healthy as never); });
        expect(container.textContent).toBe('render ok');
    });

    it('returns class and forwardRef component instances', async () => {
        class ClassTemplate extends Component { render() { return createElement('span', null, 'class'); } }
        let classResult: Promise<ClassTemplate | null> | undefined;
        await act(async () => { classResult = ComponentUtil.createAndRender<ClassTemplate>(container, ClassTemplate as never); });
        expect(await classResult).toBeInstanceOf(ClassTemplate);

        const ForwardTemplate = forwardRef<{ready: boolean}>((_props, ref) => {
            useImperativeHandle(ref, () => ({ready: true}));
            return createElement('span', null, 'forward');
        });
        let forwardResult: Promise<{ready: boolean} | null> | undefined;
        await act(async () => { forwardResult = ComponentUtil.createAndRender<{ready: boolean}>(container, ForwardTemplate as never); });
        expect(await forwardResult).toEqual({ready: true});
    });

    it('returns instances of memo-wrapped class and forwardRef components', async () => {
        class ClassTemplate extends Component { render() { return createElement('span', null, 'memo class'); } }
        const MemoClass = memo(ClassTemplate);
        let classResult!: Promise<ClassTemplate | null>;
        await act(async () => { classResult = ComponentUtil.createAndRender<ClassTemplate>(container, MemoClass as never); });
        expect(await classResult).toBeInstanceOf(ClassTemplate);
        expect(container.textContent).toBe('memo class');

        const MemoForward = memo(forwardRef<{ready: boolean}>((_props, ref) => {
            useImperativeHandle(ref, () => ({ready: true}));
            return createElement('span', null, 'memo forward');
        }));
        let forwardResult!: Promise<{ready: boolean} | null>;
        await act(async () => { forwardResult = ComponentUtil.createAndRender<{ready: boolean}>(container, MemoForward as never); });
        expect(await forwardResult).toEqual({ready: true});
        expect(container.textContent).toBe('memo forward');
    });

    it('does not pass a ref to a memo-wrapped ordinary function component', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const MemoFunction = memo(() => createElement('span', null, 'memo function'));
        let result!: Promise<unknown>;
        await act(async () => { result = ComponentUtil.createAndRender(container, MemoFunction as never); });
        await expect(result).resolves.toBeNull();
        expect(container.textContent).toBe('memo function');
        expect(error).not.toHaveBeenCalled();
    });

    it('provides and updates the shared UI locale inside a separate component root', async () => {
        const original = getLocale();
        const Consumer = () => {
            const context = useDataVisoolUI();
            return createElement('span', null, `${context.locale}: ${context.translate?.('保存')}`);
        };
        try {
            act(() => { setLocale('zh-CN'); });
            await act(async () => { await ComponentUtil.createAndRender(container, Consumer as never); });
            expect(container.textContent).toBe('zh-CN: 保存');
            act(() => { setLocale('en-US'); });
            expect(container.textContent).toBe('en-US: Save');
        } finally {
            act(() => { setLocale(original); });
        }
    });

    it('settles the instance promise when a class fails before mounting', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        class BrokenClass extends Component { render(): never { throw new Error('broken class'); } }
        let result: Promise<BrokenClass | null> | undefined;
        await act(async () => { result = ComponentUtil.createAndRender<BrokenClass>(container, BrokenClass as never); });
        await expect(result).resolves.toBeNull();
        expect(container.textContent).toContain('组件渲染失败');
    });

    it('settles a superseded render without waiting for a ref that will never mount', async () => {
        class Template extends Component<{value: string}> {
            render() { return createElement('span', null, this.props.value); }
        }
        let first!: Promise<Template | null>;
        let second!: Promise<Template | null>;
        await act(async () => {
            first = ComponentUtil.createAndRender<Template>(container, Template as never, {value: 'first'});
            second = ComponentUtil.createAndRender<Template>(container, Template as never, {value: 'second'});
        });
        const timeout = Symbol('timeout');
        expect(await Promise.race([first, new Promise(resolve => setTimeout(() => resolve(timeout), 50))])).toBeNull();
        expect(await second).toBeInstanceOf(Template);
        expect(container.textContent).toBe('second');
    });

    it('settles a pending render when the container is unmounted', async () => {
        class Template extends Component { render() { return createElement('span', null, 'content'); } }
        let pending!: Promise<Template | null>;
        await act(async () => {
            pending = ComponentUtil.createAndRender<Template>(container, Template as never);
            ComponentUtil.unmount(container);
        });
        const timeout = Symbol('timeout');
        expect(await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(timeout), 50))])).toBeNull();
        expect(container.textContent).toBe('');
    });

    it('does not cancel a pending render in another container', async () => {
        class Template extends Component { render() { return createElement('span', null, 'content'); } }
        const other = document.createElement('div');
        document.body.appendChild(other);
        try {
            let first!: Promise<Template | null>;
            let second!: Promise<Template | null>;
            await act(async () => {
                first = ComponentUtil.createAndRender<Template>(container, Template as never);
                second = ComponentUtil.createAndRender<Template>(other, Template as never);
            });
            expect(await first).toBeInstanceOf(Template);
            expect(await second).toBeInstanceOf(Template);
        } finally {
            act(() => ComponentUtil.unmount(other));
            other.remove();
        }
    });

    it('does not release a new render when a container is reused immediately', async () => {
        const oldUnmount = vi.fn();
        const newUnmount = vi.fn();
        class Old extends Component {
            componentWillUnmount() { oldUnmount(); }
            render() { return createElement('span', null, 'old'); }
        }
        class New extends Component {
            componentWillUnmount() { newUnmount(); }
            render() { return createElement('span', null, 'new'); }
        }
        await act(async () => { ComponentUtil.createAndRender(container, Old as never); });
        await act(async () => {
            ComponentUtil.release(container);
            ComponentUtil.createAndRender(container, New as never);
        });
        expect(oldUnmount).toHaveBeenCalledOnce();
        expect(newUnmount).not.toHaveBeenCalled();
        expect(container.textContent).toBe('new');
    });
});
