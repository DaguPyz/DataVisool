/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {createRef} from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext';
import type {ScreenReferenceComponentRef} from '@/plugins/designer-runtime/internal/builtin/screen-reference/ScreenReferenceComponent';

const state = vi.hoisted(() => ({
    requests: [] as Array<{id: string; loader: any; resolve: () => void; reject: (error: Error) => void}>,
    error: vi.fn(),
    runtimeContext: null as any,
}));
vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {} removeEventListener() {} postMessage() {} terminate() {}
    }, configurable: true});
});
vi.mock('@datavisool/ui', () => ({Loading: () => <span>加载中</span>, globalMessage: {messageApi: {error: state.error}}}));
vi.mock('@/plugins/designer-runtime/internal/designer/left/layer-list/CanvasRender.ts', () => ({
    default: {buildCanvasComponents: (manager: any) => <span>{manager.screen}</span>},
}));
vi.mock('@/util/EnvUtil.ts', () => ({default: {getModeByUrl: () => DesignerMode.PREVIEW}}));
vi.mock('@/plugins/designer-runtime/internal/designer/loader/ViewDesignerLoader.ts', () => ({
    default: class {
        designerManager: any;
        cancelLoad = vi.fn();
        constructor(public mode: DesignerMode, public runtimeContext: any) {
            this.designerManager = {
                screen: '', runtimeContext, canvasManager: {canvasConfig: {width: 320, height: 180}},
                globalFilterManger: {getFilterStyle: () => ({})},
                destroy: vi.fn(() => runtimeContext?.unregisterManager(this.designerManager)),
            };
            runtimeContext?.registerManager(this.designerManager);
        }
        simpleLoad(id: string) {
            this.designerManager.screen = id;
            return new Promise<void>((resolve, reject) => state.requests.push({id, loader: this, resolve, reject}));
        }
    },
}));

import ScreenReferenceComponent from '@/plugins/designer-runtime/internal/builtin/screen-reference/ScreenReferenceComponent';

describe('screen reference lifecycle', () => {
    const previousEnv = window.DATAVISOOL_ENV;
    beforeEach(() => {
        state.requests.length = 0;
        state.error.mockReset();
        state.runtimeContext = new DesignerRuntimeContext();
        window.DATAVISOOL_ENV = {managers: {existing: {}}} as any;
    });
    afterEach(() => {
        cleanup();
        state.runtimeContext.dispose();
        state.runtimeContext = null;
        window.DATAVISOOL_ENV = previousEnv;
        vi.restoreAllMocks();
    });

    it('keeps multiple references and removes only the one being unmounted', async () => {
        const first = render(<ScreenReferenceComponent runtimeContext={state.runtimeContext} base={{id: 'first'} as any} style={{screenId: 'screen-a'}}/>);
        await waitFor(() => expect(state.requests).toHaveLength(1));
        const second = render(<ScreenReferenceComponent runtimeContext={state.runtimeContext} base={{id: 'second'} as any} style={{screenId: 'screen-b'}}/>);
        await waitFor(() => expect(state.requests).toHaveLength(2));
        await act(async () => { state.requests.forEach(request => request.resolve()); });
        const firstManager = state.requests[0].loader.designerManager;
        const secondManager = state.requests[1].loader.designerManager;
        expect(firstManager).not.toBe(secondManager);
        expect(firstManager.runtimeContext).toBe(state.runtimeContext);
        expect(secondManager.runtimeContext).toBe(state.runtimeContext);
        expect(window.DATAVISOOL_ENV.managers).toEqual({existing: {}});
        expect(state.requests.every(request => request.loader.mode === DesignerMode.PREVIEW)).toBe(true);
        first.unmount();
        expect(firstManager.destroy).toHaveBeenCalledOnce();
        expect(secondManager.destroy).not.toHaveBeenCalled();
        expect(window.DATAVISOOL_ENV.managers).toEqual({existing: {}});
        expect(state.requests[0].loader.cancelLoad).toHaveBeenCalledOnce();
        second.unmount();
        expect(secondManager.destroy).toHaveBeenCalledOnce();
    });

    it('ignores the old result after switching referenced projects', async () => {
        const ref = createRef<ScreenReferenceComponentRef>();
        render(<ScreenReferenceComponent ref={ref} runtimeContext={state.runtimeContext} base={{id: 'ref'} as any} style={{screenId: 'old'}}/>);
        await waitFor(() => expect(state.requests).toHaveLength(1));
        act(() => ref.current!.updateConfig({base: {id: 'ref'} as any, style: {screenId: 'new'}}));
        await waitFor(() => expect(state.requests).toHaveLength(2));
        await act(async () => state.requests[1].resolve());
        expect(screen.getByText('new')).toBeInTheDocument();
        await act(async () => state.requests[0].resolve());
        expect(state.requests[0].loader.designerManager.destroy).toHaveBeenCalledOnce();
        expect(state.requests[1].loader.designerManager.runtimeContext).toBe(state.runtimeContext);
        expect(window.DATAVISOOL_ENV.managers).toEqual({existing: {}});
        expect(screen.queryByText('old')).not.toBeInTheDocument();
        expect(state.requests[0].loader.cancelLoad).toHaveBeenCalledOnce();
    });

    it('does not publish a result after unmount and reports active failures', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const first = render(<ScreenReferenceComponent runtimeContext={state.runtimeContext} base={{id: 'gone'} as any} style={{screenId: 'late'}}/>);
        await waitFor(() => expect(state.requests).toHaveLength(1));
        first.unmount();
        await act(async () => state.requests[0].resolve());
        expect(window.DATAVISOOL_ENV.managers).toEqual({existing: {}});
        expect(state.requests[0].loader.designerManager.destroy).toHaveBeenCalledOnce();
        render(<ScreenReferenceComponent runtimeContext={state.runtimeContext} base={{id: 'fail'} as any} style={{screenId: 'missing'}}/>);
        await waitFor(() => expect(state.requests).toHaveLength(2));
        await act(async () => state.requests[1].reject(new Error('missing')));
        expect(screen.getByRole('alert')).toHaveTextContent('大屏引用失败');
        expect(state.error).toHaveBeenCalledWith('大屏引用失败');
        expect(state.requests[1].loader.designerManager.destroy).toHaveBeenCalledOnce();
    });

    it('shows a prompt when no project has been selected', () => {
        render(<ScreenReferenceComponent runtimeContext={state.runtimeContext} base={{id: 'empty'} as any} style={{}}/>);
        expect(screen.getByText('请引用大屏')).toBeInTheDocument();
        expect(state.requests).toHaveLength(0);
    });
});
