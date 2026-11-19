/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {Suspense} from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';

const api = vi.hoisted(() => ({createSubProject: vi.fn(), getSubProjectList: vi.fn()}));
const project = vi.hoisted(() => ({
    rootProjectId: 'root-project',
    readWorkspace: vi.fn(() => ({activeId: 'root-project'})),
    switchWorkspace: vi.fn(async () => undefined),
    onWorkspaceDeleted: vi.fn(async () => undefined),
    renameWorkspace: vi.fn(),
}));
vi.mock('@/api/engineering/BaseApi.ts', () => ({default: api}));
vi.mock('@/shared/designer/EditorProjectContext.ts', () => ({useEditorProject: () => project}));
vi.mock('@/shared/project/NewProjectDialog.tsx', () => ({
    default: ({visible, onOk}: any) => visible ? <div role="dialog" className="new-project-dialog">
        <button type="button" onClick={() => onOk({name: 'Child project', des: '', width: 1200, height: 700})}>创建项目</button>
    </div> : null,
}));
vi.mock('@/shared/components/panel-header/DesignerPanelHeader', () => ({
    default: ({title, onClose, actions}: any) => <header><span>{title}</span>{actions}<button onClick={onClose}>关闭</button></header>,
}));
vi.mock('@datavisool/ui', () => ({
    Button: ({children, onClick, disabled, className, title, 'aria-label': ariaLabel}: any) =>
        <button type="button" onClick={onClick} disabled={disabled} className={className} title={title} aria-label={ariaLabel}>{children}</button>,
    Input: ({value, onChange, placeholder, className}: any) =>
        <input value={value} placeholder={placeholder} className={className} onChange={event => onChange?.(event.target.value)}/>,
    globalMessage: {messageApi: {success: vi.fn(), error: vi.fn()}},
    globalModal: {modalApi: {confirm: vi.fn(), destroy: vi.fn()}},
}));

import {createEditorSubprojectsPlugin} from '@/plugins/editor-subprojects/editorSubprojectsPlugin.tsx';

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

it('waits for an already submitted subproject creation before stopping', async () => {
    api.getSubProjectList.mockResolvedValue([]);
    let finishCreate!: (id: string) => void;
    api.createSubProject.mockReturnValue(new Promise(resolve => { finishCreate = resolve; }));
    let stop: any;
    let dockPanel: any;
    const context = {
        onStop: (participant: any) => { stop = participant; },
        onDispose: () => () => undefined,
        editorShell: {registerDockPanel: (panel: any) => { dockPanel = panel; return () => undefined; }},
    };
    createEditorSubprojectsPlugin().activate(context as any);
    const Panel = dockPanel.Panel;
    render(<Suspense fallback={null}><Panel open onClose={vi.fn()}/></Suspense>);

    await screen.findByPlaceholderText('搜索项目');
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', {name: '新建子项目'}));
    fireEvent.click(screen.getByRole('button', {name: '创建项目'}));
    await waitFor(() => expect(api.createSubProject).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Child project', pid: 'root-project',
    })));

    stop.pause('plugin');
    let prepared = false;
    const preparation = stop.prepare('plugin').then(() => { prepared = true; });
    await act(async () => { await Promise.resolve(); });
    expect(prepared).toBe(false);

    await act(async () => { finishCreate('child-project'); });
    await preparation;
    expect(prepared).toBe(true);
});
