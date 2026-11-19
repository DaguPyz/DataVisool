/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {Suspense} from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';

const coverApi = vi.hoisted(() => ({uploadCover: vi.fn()}));
vi.mock('@/api/engineering/BaseApi.ts', () => ({default: coverApi}));
vi.mock('@datavisool/ui', () => {
    const Dragger = ({beforeUpload, children}: any) => {
        const file = new File(['cover'], 'cover.png', {type: 'image/png'});
        return <div><button type="button" onClick={() => beforeUpload(file, [file])}>选择测试封面</button>{children}</div>;
    };
    return {
        Button: ({children, onClick, disabled}: any) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
        Dialog: ({children}: any) => <div role="dialog">{children}</div>,
        Upload: {LIST_IGNORE: Symbol('LIST_IGNORE'), Dragger},
        globalMessage: {messageApi: {warning: vi.fn(), info: vi.fn(), error: vi.fn()}},
    };
});

import {createEditorProjectPlugin} from '@/plugins/editor-project/editorProjectPlugin.ts';

const createProjectContext = () => {
    let stop: any;
    const overlays = new Map<string, React.ComponentType<any>>();
    const editorShell = {
        registerView: () => () => undefined,
        registerToolbarItem: () => () => undefined,
        registerDockPanel: () => () => undefined,
        registerOverlay: (overlay: {id: string; View: React.ComponentType<any>}) => {
            overlays.set(overlay.id, overlay.View);
            return () => overlays.delete(overlay.id);
        },
        registerProject: () => () => undefined,
        openOverlay: () => true,
        closeOverlay: () => undefined,
        isOverlayOpen: () => false,
    };
    const context = {
        editorShell,
        editorCanvas: {prepareRepair: vi.fn()},
        editorCommands: {register: () => () => undefined},
        onStop: (participant: any) => { stop = participant; },
        onDispose: () => () => undefined,
        provide: () => undefined,
    };
    createEditorProjectPlugin().activate(context as any);
    return {stop, overlays};
};

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
afterEach(() => {
    cleanup();
    coverApi.uploadCover.mockReset();
    if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    else delete (URL as any).createObjectURL;
    if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
    else delete (URL as any).revokeObjectURL;
});

it('waits for a cover upload already in flight before the project plugin stops', async () => {
    Object.defineProperty(URL, 'createObjectURL', {configurable: true, value: vi.fn(() => 'blob:cover-fixture')});
    Object.defineProperty(URL, 'revokeObjectURL', {configurable: true, value: vi.fn()});
    let finishUpload!: (result: boolean) => void;
    coverApi.uploadCover.mockReturnValue(new Promise(resolve => { finishUpload = resolve; }));
    const {stop, overlays} = createProjectContext();
    const CoverOverlay = overlays.get('project.cover')!;
    const onClose = vi.fn();
    render(<Suspense fallback={null}><CoverOverlay onClose={onClose} project={{}}/></Suspense>);

    await screen.findByRole('button', {name: '选择测试封面'});
    fireEvent.click(screen.getByRole('button', {name: '选择测试封面'}));
    fireEvent.click(screen.getByRole('button', {name: '保存封面'}));
    await waitFor(() => expect(coverApi.uploadCover).toHaveBeenCalledOnce());

    stop.pause('plugin');
    let prepared = false;
    const preparation = stop.prepare('plugin').then(() => { prepared = true; });
    await act(async () => { await Promise.resolve(); });
    expect(prepared).toBe(false);

    await act(async () => { finishUpload(true); });
    await preparation;
    expect(prepared).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
});
