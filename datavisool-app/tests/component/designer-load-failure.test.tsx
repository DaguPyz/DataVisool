/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

interface MockLoader {
    loaded: boolean;
    projectInfo: {name: string};
    cancelLoad: ReturnType<typeof vi.fn>;
}

const pending = vi.hoisted(() => [] as Array<{
    id: string;
    loader: MockLoader;
    resolve: () => void;
    reject: (error: Error) => void;
}>);

vi.mock('@/designer/loader/EditDesignerLoader.ts', async () => {
    const {makeObservable, observable, runInAction} = await import('mobx');
    return {default: class {
        loaded = false;
        projectInfo = {name: '测试项目'};
        cancelLoad = vi.fn();

        constructor() {
            makeObservable(this, {loaded: observable});
        }

        load(id: string) {
            runInAction(() => { this.loaded = false; });
            return new Promise<void>((resolve, reject) => {
                pending.push({id, loader: this, resolve: () => {
                    runInAction(() => { this.loaded = true; });
                    resolve();
                }, reject});
            });
        }
    }};
});
vi.mock('@/global/ExportEditGlobalMember.ts', () => ({}));
vi.mock('@/designer/left/DesignerLeft', () => ({default: () => null}));
vi.mock('@/designer/right/DesignerRight', () => ({default: () => null}));
vi.mock('@/designer/footer/DesignerFooter', () => ({default: () => null}));
vi.mock('@/designer/header/DesignerHeader', () => ({default: () => null}));
vi.mock('@/designer/canvas/DesignerCanvas', () => ({default: () => null}));
vi.mock('@/designer/workspace/DesignerWorkspaceShell.tsx', () => ({default: () => <div>主设计器</div>}));
vi.mock('@/designer/event/ContextMenuStore.ts', () => ({default: {reset: vi.fn()}}));
vi.mock('@/designer/operate-provider/EventOperateStore', () => ({default: {reset: vi.fn()}}));
vi.mock('@/designer/footer/FooterStore.ts', () => ({default: {resetSaveState: vi.fn()}}));
vi.mock('@/designer/footer/auto-save/AutoSaveManager.ts', () => ({stopAutoSave: vi.fn()}));
vi.mock('@/designer/operate-provider/hot-key/HotKeyImpl.ts', () => ({doPaste: vi.fn()}));
vi.mock('@/designer/header/DesignerHeaderStore.ts', () => ({default: {currentKey: 'main'}}));
vi.mock('@/designer/operate-provider/hot-key/ShortcutStore.ts', () => ({default: {initialize: async () => {}}}));
vi.mock('@/util/AuthTools.ts', () => ({default: {getUserId: () => 'test-user'}}));
vi.mock('@datavisool/ui', () => ({Loading: () => <div>加载中</div>}));

import Designer from '@/designer/Designer.tsx';

const view = (id = 'project-1') => (
    <MemoryRouter initialEntries={['/designer']} future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
        <Routes>
            <Route path="/designer" element={<Designer id={id}/>}/>
            <Route path="/home" element={<div>首页</div>}/>
        </Routes>
    </MemoryRouter>
);
const fail = async (index = 0) => {
    await act(async () => { pending[index].reject(new Error('项目请求失败')); });
};

describe('designer load failure recovery', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;
    const previousTitle = document.title;

    beforeEach(() => {
        pending.length = 0;
        window.DATAVISOOL_ENV = {} as typeof window.DATAVISOOL_ENV;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        window.DATAVISOOL_ENV = previousEnvironment;
        document.title = previousTitle;
        vi.restoreAllMocks();
    });

    test('replaces loading with failure actions after a rejected request', async () => {
        render(view());
        expect(screen.getByText('加载中')).toBeInTheDocument();
        await fail();
        expect(screen.getByRole('alert')).toHaveTextContent('项目加载失败');
        expect(screen.queryByText('加载中')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: '重试'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: '返回首页'})).toBeInTheDocument();
    });

    test('retries with a fresh loader without cancelling it during old effect cleanup', async () => {
        render(view());
        await fail();
        fireEvent.click(screen.getByRole('button', {name: '重试'}));
        expect(screen.getByText('加载中')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(pending[1].id).toBe('project-1');
        expect(pending[1].loader).not.toBe(pending[0].loader);
        expect(pending[0].loader.cancelLoad).toHaveBeenCalledTimes(2);
        expect(pending[1].loader.cancelLoad).toHaveBeenCalledTimes(1);
        expect(window.DATAVISOOL_ENV.editorLoader).toBe(pending[1].loader);
        await act(async () => { pending[1].resolve(); });
        expect(screen.getByText('主设计器')).toBeInTheDocument();
        expect(document.title).toBe('测试项目');
    });

    test('allows another retry when the first retry also fails', async () => {
        render(view());
        await fail();
        fireEvent.click(screen.getByRole('button', {name: '重试'}));
        await fail(1);
        expect(screen.getByRole('alert')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: '重试'}));
        await act(async () => { pending[2].resolve(); });
        expect(screen.getByText('主设计器')).toBeInTheDocument();
    });

    test('returns to the home route and cancels the failed loader', async () => {
        render(view());
        await fail();
        fireEvent.click(screen.getByRole('button', {name: '返回首页'}));
        expect(screen.getByText('首页')).toBeInTheDocument();
        expect(pending[0].loader.cancelLoad).toHaveBeenCalledTimes(2);
    });

    test('ignores a stale rejection after switching projects', async () => {
        const {rerender} = render(view());
        rerender(view('project-2'));
        await fail();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByText('加载中')).toBeInTheDocument();
        expect(pending[1].id).toBe('project-2');
        await act(async () => { pending[1].resolve(); });
        expect(screen.getByText('主设计器')).toBeInTheDocument();
    });

    test('ignores rejection after the designer unmounts', async () => {
        const {unmount} = render(view());
        unmount();
        await fail();
        expect(console.error).not.toHaveBeenCalled();
        expect(pending[0].loader.cancelLoad).toHaveBeenCalledTimes(2);
    });
});
