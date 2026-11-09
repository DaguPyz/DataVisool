import {createElement, createRef, forwardRef, useImperativeHandle} from 'react';
import {render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';

it('renders the public lazy component directly and forwards its ref', async () => {
    vi.resetModules();
    let resolveChunk!: () => void;
    let started!: () => void;
    const startedLoading = new Promise<void>(resolve => { started = resolve; });
    const chunkGate = new Promise<void>(resolve => { resolveChunk = resolve; });
    vi.doMock('@/util/ComponentUtil.ts', () => ({default: {createAndRender: vi.fn(), release: vi.fn()}}));
    vi.doMock('../../src/comps/builtin/3d-model/ThreeModelComponent', async () => {
        started();
        await chunkGate;
        return {
            ThreeModelComponent: forwardRef((props: any, ref) => {
                useImperativeHandle(ref, () => ({marker: 'ready'}));
                return createElement('div', {'data-testid': 'three-model-component', 'data-label': props.label});
            }),
        };
    });

    const {default: ThreeModelDefinition} = await import('../../src/comps/builtin/3d-model/ThreeModelDefinition');
    const PublicComponent = new ThreeModelDefinition().getReactComponent();
    const ref = createRef<{marker: string}>();
    render(createElement(PublicComponent, {ref, label: 'lazy-render'}));
    await startedLoading;
    expect(screen.queryByTestId('three-model-component')).toBeNull();
    resolveChunk();
    await waitFor(() => expect(screen.getByTestId('three-model-component')).toHaveAttribute('data-label', 'lazy-render'));
    expect(ref.current).toEqual({marker: 'ready'});
});

afterEach(() => {
    vi.doUnmock('@/util/ComponentUtil.ts');
    vi.doUnmock('../../src/comps/builtin/3d-model/ThreeModelComponent');
    vi.resetModules();
});
