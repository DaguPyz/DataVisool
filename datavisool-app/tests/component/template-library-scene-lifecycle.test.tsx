/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorWorkspaceContext} from '@/shared/designer/EditorWorkspaceContext.ts';
import TemplateLibraryStore from '@/plugins/editor-template-library/TemplateLibraryStore.ts';

const api = vi.hoisted(() => ({getTemplateList: vi.fn(), getTemplate: vi.fn()}));
vi.mock('@/api/engineering/BaseApi.ts', () => ({default: api}));
vi.mock('@datavisool/ui', () => ({
    Input: ({placeholder, value, onChange}: any) => <input placeholder={placeholder} value={value} onChange={event => onChange?.(event.target.value)}/>,
    globalModal: {modalApi: {destroy: vi.fn()}},
    globalMessage: {messageApi: {error: vi.fn(), success: vi.fn()}},
}));
vi.mock('@/shared/components/panel-header/DesignerPanelHeader', () => ({
    default: ({title, onClose}: {title: string; onClose(): void}) => <header><span>{title}</span><button onClick={onClose}>关闭</button></header>,
}));

import TemplateLib from '@/plugins/editor-template-library/TemplateLib.tsx';

const createScene = (version: number) => ({version});
const workspace = (scene: ReturnType<typeof createScene>) => ({readScene: () => scene}) as any;
const templateInfo = {layers: {layer1: {id: 'layer1', type: 'BaseText', x: 10, y: 20}}, configs: {layer1: {base: {id: 'layer1'}}}};

function renderTemplateLibrary(version: number, canvas: any, lifecycle: any, store = new TemplateLibraryStore()) {
    const scene = createScene(version);
    return {
        scene,
        store,
        view: render(<EditorWorkspaceContext.Provider value={workspace(scene)}>
            <TemplateLib canvas={canvas} store={store} lifecycle={lifecycle} onClose={vi.fn()}/>
        </EditorWorkspaceContext.Provider>),
    };
}

function createHarness() {
    let activeSceneVersion = 1;
    const inserted = vi.fn();
    const canvas = {
        isSceneActive: (version: number) => version === activeSceneVersion,
        insertTemplate: inserted,
        resolveDrop: () => null,
    };
    const lifecycle = {
        isActive: () => true,
        isAccepting: () => true,
        registerPauseCleanup: () => () => undefined,
        trackTask: <T,>(task: Promise<T>) => task,
    };
    return {canvas, lifecycle, inserted, setActiveScene: (version: number) => { activeSceneVersion = version; }};
}

describe('template insertion scene lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.getTemplateList.mockResolvedValue([{id: 'template-1', name: 'Fixture template'}]);
    });
    afterEach(cleanup);

    it('does not insert a template read that resolves after changing scenes', async () => {
        const harness = createHarness();
        let resolveTemplate!: (value: {templateJson: string}) => void;
        api.getTemplate.mockReturnValue(new Promise(resolve => { resolveTemplate = resolve; }));
        const {view, store} = renderTemplateLibrary(1, harness.canvas, harness.lifecycle);
        await screen.findByText('Fixture template');
        fireEvent.doubleClick(view.container.querySelector('.template-item')!);
        await waitFor(() => expect(api.getTemplate).toHaveBeenCalledWith('template-1'));

        const nextScene = createScene(2);
        harness.setActiveScene(2);
        view.rerender(<EditorWorkspaceContext.Provider value={workspace(nextScene)}>
            <TemplateLib canvas={harness.canvas} store={store} lifecycle={harness.lifecycle} onClose={vi.fn()}/>
        </EditorWorkspaceContext.Provider>);
        await act(async () => { resolveTemplate({templateJson: JSON.stringify(templateInfo)}); });

        expect(harness.inserted).not.toHaveBeenCalled();
    });

    it('inserts a template when its read completes in the scene where it was requested', async () => {
        const harness = createHarness();
        api.getTemplate.mockResolvedValue({templateJson: JSON.stringify(templateInfo)});
        const {view} = renderTemplateLibrary(1, harness.canvas, harness.lifecycle);
        await screen.findByText('Fixture template');
        fireEvent.doubleClick(view.container.querySelector('.template-item')!);
        await waitFor(() => expect(harness.inserted).toHaveBeenCalledWith(templateInfo));
    });
});
