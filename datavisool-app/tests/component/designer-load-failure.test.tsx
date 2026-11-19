/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter, Route, Routes, useNavigate} from 'react-router-dom';
import type {DesignerProjectSession} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {makeObservable, observable, runInAction} from 'mobx';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

class MockSession implements DesignerProjectSession {
    loaded = false;
    name = '测试项目';
    close = vi.fn();
    getProjectId = () => undefined;
    getSnapshot = () => undefined;
    readRemoteComponentPaths = () => ({});
    renderCanvas = () => ({filterStyle: {}, content: null});

    constructor() {
        makeObservable(this, {loaded: observable});
    }

    load(id: string) {
        return new Promise<void>((resolve, reject) => {
            pending.push({id, session: this, resolve: () => {
                runInAction(() => { this.loaded = true; });
                resolve();
            }, reject});
        });
    }
}

const pending: Array<{
    id: string;
    session: MockSession;
    resolve: () => void;
    reject: (error: Error) => void;
}> = [];
const createSession = () => new MockSession();
const projectFeature = {
    createActions: () => ({
        rootProjectId: 'project-1', readWorkspace: () => undefined,
        switchWorkspace: async () => {}, onWorkspaceDeleted: async () => {}, renameWorkspace() {},
        restoreSnapshot: async () => false, cancelSnapshotRestore() {}, openPreview: async () => {}, publish: async () => undefined,
        start() {}, close() {}, save: async () => true, saveThrottled() {}, importProject() {}, exportProject() {},
    }),
    Dialogs: () => null,
};

vi.mock('@/plugins/editor-shell/dock/DesignerLeft.tsx', () => ({default: () => null}));
vi.mock('@/plugins/editor-inspector/DesignerRight', () => ({default: () => null}));
vi.mock('@/plugins/editor-canvas/DesignerFooter', () => ({default: () => null}));
vi.mock('@/plugins/editor-shell/header/DesignerHeader', () => ({default: () => null}));
vi.mock('@/plugins/editor-shell/DesignerWorkspaceShell.tsx', () => ({default: () => <div>主设计器</div>}));
vi.mock('@/plugins/editor-canvas/context-menu/CanvasContextMenuStore.ts', () => ({default: {reset: vi.fn()}}));
vi.mock('@/plugins/editor-canvas/state/EventOperateStore', () => ({default: {reset: vi.fn()}}));
vi.mock('@/plugins/editor-canvas/commands/CanvasActions.ts', () => ({doPaste: vi.fn()}));
vi.mock('@/util/AuthTools.ts', () => ({default: {getUserId: () => 'test-user'}}));
vi.mock('@datavisool/ui', () => ({Loading: () => <div>加载中</div>}));

import Designer from '@/plugins/editor-shell/Designer.tsx';
import {DesignerDockState} from '@/plugins/editor-shell/dock/DesignerDockState.ts';

const dock = new DesignerDockState(() => 1);
const shell = {isOverlayOpen: () => false};
const empty = () => [];

function Editor({id}: {id: string}) {
    const navigate = useNavigate();
    return <Designer key={id} id={id} createSession={createSession} projectFeature={projectFeature}
                     getCanvas={() => undefined} getDockPanels={empty} getViews={() => ({})}
                     getOverlays={empty} getToolbarItems={empty} dock={dock} shell={shell as never}
                     commands={{} as never} returnHome={async () => navigate('/home')}/>;
}

const view = (id = 'project-1') => (
    <MemoryRouter initialEntries={['/designer']} future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
        <Routes>
            <Route path="/designer" element={<Editor id={id}/>}/>
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
        expect(pending[1].session).not.toBe(pending[0].session);
        expect(pending[0].session.close).toHaveBeenCalledTimes(1);
        expect(pending[1].session.close).not.toHaveBeenCalled();
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
        expect(pending[0].session.close).toHaveBeenCalledTimes(1);
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
        expect(pending[0].session.close).toHaveBeenCalledTimes(1);
    });
});
