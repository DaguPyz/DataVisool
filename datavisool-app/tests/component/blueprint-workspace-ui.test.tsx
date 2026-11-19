/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useEffect} from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {observable, runInAction} from 'mobx';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BPWorkspaceUIStore} from '@/plugins/editor-blueprint/state/BPWorkspaceUIStore.ts';
import {BPRightStore} from '@/plugins/editor-blueprint/state/BPRightStore.ts';
import {BlueprintContextMenuStore} from '@/plugins/editor-blueprint/state/BlueprintContextMenuStore.ts';
import {EditorBlueprintSessionProvider} from '@/plugins/editor-blueprint/session/EditorBlueprintSessionContext.tsx';

vi.mock('@datavisool/ui', () => ({
    Accordion: ({children, label}: {children: React.ReactNode; label: string}) => <section aria-label={label}>{children}</section>,
}));
vi.mock('@icon-park/react', async importOriginal => ({
    ...await importOriginal<typeof import('@icon-park/react')>(),
    Close: () => <span aria-hidden="true"/>,
    Setting: () => <span aria-hidden="true"/>,
    Return: () => <span aria-hidden="true"/>,
}));
vi.mock('@/plugins/editor-blueprint/right/BPNodeCommonConfig.tsx', () => ({default: () => <div/>}));

import BPWorkspaceShell from '@/plugins/editor-blueprint/workspace/BPWorkspaceShell';
import BPRight from '@/plugins/editor-blueprint/right/BPRight';
import BPHeader from '@/plugins/editor-blueprint/header/BPHeader';

describe('blueprint floating workspace UI', () => {
    let session: any;
    let canvasMounts = 0;
    let canvasUnmounts = 0;
    let viewportWidth = 1440;

    const createSession = (page: any = null, controllers: Record<string, any> = {}) => observable.object({
        leftStore: {setActiveMenu: vi.fn(), setSearchValue: vi.fn()},
        rightStore: new BPRightStore(),
        workspaceUIStore: new BPWorkspaceUIStore(),
        contextMenu: new BlueprintContextMenuStore(),
        currentPageManager: page,
        currPageNodeControllers: controllers,
        setCanvasTranslate: vi.fn(),
        setCanvasScale: vi.fn(),
    }, {
        currentPageManager: observable.ref,
        currPageNodeControllers: observable.ref,
    }, {deep: false});

    beforeEach(() => {
        viewportWidth = 1440;
        vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
            matches: query === '(max-width: 959px)' && viewportWidth < 960,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }) as MediaQueryList);
        session = undefined;
        canvasMounts = 0;
        canvasUnmounts = 0;
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    const withSession = (children: React.ReactNode, value = session) => (
        <EditorBlueprintSessionProvider value={value}>{children}</EditorBlueprintSessionProvider>
    );

    const Canvas = () => {
        useEffect(() => {
            canvasMounts += 1;
            return () => { canvasUnmounts += 1; };
        }, []);
        return <div data-testid="canvas"/>;
    };

    const renderWorkspace = () => {
        session = createSession();
        return render(withSession(<BPWorkspaceShell
            canvas={<Canvas/>}
            header={<div>
                <button onClick={() => session.workspaceUIStore.openRight()}>打开配置</button>
                <button onClick={() => session.workspaceUIStore.closeRight()}>关闭配置</button>
                <button onClick={() => session.workspaceUIStore.openLeft()}>打开节点库</button>
            </div>}
            left={<input aria-label="节点搜索" defaultValue="未提交搜索词"/>}
            right={<input aria-label="配置草稿" defaultValue="未提交配置"/>}
            footer={null}
        />));
    };

    it('keeps panel inputs and the canvas mounted while opening and closing panels', () => {
        viewportWidth = 1440;
        renderWorkspace();

        const search = screen.getByRole('textbox', {name: '节点搜索'}) as HTMLInputElement;
        fireEvent.change(search, {target: {value: 'still here'}});
        fireEvent.click(screen.getByRole('button', {name: '打开配置'}));
        const config = screen.getByRole('textbox', {name: '配置草稿'}) as HTMLInputElement;
        fireEvent.change(config, {target: {value: 'draft survives'}});
        fireEvent.click(screen.getByRole('button', {name: '关闭配置'}));
        fireEvent.click(screen.getByRole('button', {name: '打开配置'}));

        expect(search).toHaveValue('still here');
        expect(config).toHaveValue('draft survives');
        expect(screen.getByTestId('canvas')).toBeInTheDocument();
        expect(canvasMounts).toBe(1);
        expect(canvasUnmounts).toBe(0);
    });

    it('switches the active floating panel on a narrow viewport without closing either panel', () => {
        viewportWidth = 800;
        const {container} = renderWorkspace();

        fireEvent.click(screen.getByRole('button', {name: '打开配置'}));
        expect(container.querySelector('.bp-workspace-left')).toHaveClass('bp-workspace-left--narrow-collapsed');
        expect(container.querySelector('.bp-workspace-right')).not.toHaveClass('bp-workspace-right--hidden');
        expect(container.querySelector('.bp-workspace-shell')).toHaveAttribute('data-left-open', 'true');
        expect(container.querySelector('.bp-workspace-shell')).toHaveAttribute('data-right-open', 'true');

        fireEvent.click(screen.getByRole('button', {name: '打开节点库'}));
        expect(container.querySelector('.bp-workspace-left')).not.toHaveClass('bp-workspace-left--narrow-collapsed');
        expect(container.querySelector('.bp-workspace-right')).toHaveClass('bp-workspace-right--hidden');
        expect(container.querySelector('.bp-workspace-shell')).toHaveAttribute('data-right-open', 'true');
    });

    it('shows an empty config state instead of a stale node after page data changes', () => {
        viewportWidth = 1440;
        const unsubscribe = vi.fn();
        const controller = {
            getConfig: () => ({id: 'node-1', type: 'test', name: 'Old page node', input: [], output: []}),
            getNodeInfo: () => null,
            update: vi.fn(),
            subscribe: vi.fn(() => unsubscribe),
            destroy: vi.fn(),
        };
        const page = observable.object({pageId: 'page-1', pageName: 'Page 1', bpNodeLayoutMap: {'node-1': {}}});
        session = createSession(page, {'node-1': controller});
        session.workspaceUIStore.openRight();
        act(() => runInAction(() => session.rightStore.setActiveNode('node-1')));

        render(withSession(<BPRight/>));
        expect(screen.getByText('Old page node')).toBeInTheDocument();

        act(() => runInAction(() => {
            session.currentPageManager = observable.object({pageId: 'page-2', pageName: 'Page 2', bpNodeLayoutMap: {}});
            session.currPageNodeControllers = {};
        }));

        expect(screen.queryByText('Old page node')).not.toBeInTheDocument();
        expect(screen.getByText('请双击画布节点查看配置')).toBeInTheDocument();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
        expect(controller.subscribe).toHaveBeenCalledTimes(1);
    });

    it('refreshes the workspace identity when the current page is renamed', () => {
        const page = observable.object({pageId: 'page-1', pageName: 'Before rename', bpNodeLayoutMap: {}});
        session = createSession(page);

        render(withSession(<BPHeader onClose={vi.fn()}/>));
        expect(screen.getByTitle('Before rename')).toBeInTheDocument();

        act(() => runInAction(() => { page.pageName = 'After rename'; }));

        expect(screen.getByTitle('After rename')).toBeInTheDocument();
    });
});
