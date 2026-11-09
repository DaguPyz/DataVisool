/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useEffect} from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {observable, runInAction} from 'mobx';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@datavisool/ui', () => ({
    Accordion: ({children, label}: {children: React.ReactNode; label: string}) => <section aria-label={label}>{children}</section>,
}));
vi.mock('@icon-park/react', () => ({
    Close: () => <span aria-hidden="true"/>,
    Setting: () => <span aria-hidden="true"/>,
    Return: () => <span aria-hidden="true"/>,
}));
vi.mock('@/designer/blueprint/right/BPNodeCommonConfig', () => ({default: () => <div/>}));

import BPWorkspaceShell from '@/designer/blueprint/workspace/BPWorkspaceShell';
import bpWorkspaceUIStore from '@/designer/blueprint/workspace/BPWorkspaceUIStore';
import bpRightStore from '@/designer/blueprint/right/BPRightStore';
import BPRight from '@/designer/blueprint/right/BPRight';
import BPHeader from '@/designer/blueprint/header/BPHeader';
import BluePrintPageManager from '@/designer/blueprint/manager/BluePrintPageManager';

describe('blueprint floating workspace UI', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;
    let canvasMounts = 0;
    let canvasUnmounts = 0;
    let viewportWidth = 1440;

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
        bpWorkspaceUIStore.resetPanelState();
        runInAction(() => { bpRightStore.activeNode = null; });
        canvasMounts = 0;
        canvasUnmounts = 0;
    });

    afterEach(() => {
        cleanup();
        bpWorkspaceUIStore.resetPanelState();
        runInAction(() => { bpRightStore.activeNode = null; });
        window.DATAVISOOL_ENV = previousEnvironment;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const Canvas = () => {
        useEffect(() => {
            canvasMounts += 1;
            return () => { canvasUnmounts += 1; };
        }, []);
        return <div data-testid="canvas"/>;
    };

    const renderWorkspace = () => render(<BPWorkspaceShell
        canvas={<Canvas/>}
        header={<div>
            <button onClick={() => bpWorkspaceUIStore.openRight()}>打开配置</button>
            <button onClick={() => bpWorkspaceUIStore.closeRight()}>关闭配置</button>
            <button onClick={() => bpWorkspaceUIStore.openLeft()}>打开节点库</button>
        </div>}
        left={<input aria-label="节点搜索" defaultValue="未提交搜索词"/>}
        right={<input aria-label="配置草稿" defaultValue="未提交配置"/>}
        footer={null}
    />);

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

    it('shows an empty config state instead of a stale node after page data changes', async () => {
        viewportWidth = 1440;
        const controller = {
            getConfig: () => ({
                id: 'node-1', type: 'test', name: 'Old page node',
                input: [], output: [],
            }),
            getConfigComponent: () => null,
        };
        const manager = observable<any>({
            currentPageManager: {bpNodeLayoutMap: { 'node-1': {} }},
            currPageNodeControllers: {'node-1': controller},
        });
        window.DATAVISOOL_ENV = {currentManager: {bluePrintManager: manager}} as typeof window.DATAVISOOL_ENV;
        bpWorkspaceUIStore.openRight();
        act(() => runInAction(() => { bpRightStore.activeNode = 'node-1'; }));

        render(<BPRight/>);
        expect(screen.getByText('Old page node')).toBeInTheDocument();

        act(() => runInAction(() => {
            manager.currentPageManager = {bpNodeLayoutMap: {}};
            manager.currPageNodeControllers = {};
        }));

        expect(screen.queryByText('Old page node')).not.toBeInTheDocument();
        expect(screen.getByText('请双击画布节点查看配置')).toBeInTheDocument();
    });

    it('refreshes the workspace identity when the current page is renamed', () => {
        const page = new BluePrintPageManager();
        page.pageName = 'Before rename';
        const manager = observable.object({
            currentPageManager: page,
            currPageNodeControllers: {},
        }, {currentPageManager: observable.ref});
        window.DATAVISOOL_ENV = {currentManager: {bluePrintManager: manager}} as typeof window.DATAVISOOL_ENV;

        render(<BPHeader/>);
        expect(screen.getByTitle('Before rename')).toBeInTheDocument();

        act(() => page.setPageName('After rename'));

        expect(screen.getByTitle('After rename')).toBeInTheDocument();
    });
});
