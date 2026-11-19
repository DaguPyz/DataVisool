/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {EditorWorkspaceContext} from '@/shared/designer/EditorWorkspaceContext.ts';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';
import {createInspectorConsumerDomain} from '@/plugins/editor-inspector/consumer-domain.ts';
import {createInspectorTarget, createInspectorTestDomain} from './support/inspectorDomainFixture.ts';

vi.mock('@/plugins/editor-inspector/DesignerRight.tsx', async () => {
    const React = await import('react');
    return {
        default: ({domain, closePanel, store}: {
            domain: EditorInspectorDomain;
            closePanel(restoreFocus: boolean): void;
            store: ReturnType<typeof createInspectorStore>;
        }) => {
            const [draft, setDraft] = React.useState('');
            return <section data-testid="inspector-domain" data-open={String(store.panelOpen)}>
                <output>{(domain.sceneIdentity as {label: string}).label}</output>
                {store.activeElem.id && <nav data-testid="inspector-menu"/>}
                {store.panelOpen && <div data-testid="inspector-config"/>}
                <input aria-label="草稿" value={draft} onChange={event => setDraft(event.currentTarget.value)}/>
                <button type="button" onClick={() => closePanel(false)}>关闭</button>
            </section>;
        },
    };
});

import InspectorRoot from '@/plugins/editor-inspector/InspectorRoot.tsx';

const createScene = (label: string, version = 7) => ({
    identity: {label},
    version,
    isActive: () => true,
}) as DesignerEditingScene;

const createDomain = (scene: DesignerEditingScene) => ({
    sceneIdentity: scene.identity,
    sceneVersion: scene.version,
    isActive: () => true,
}) as EditorInspectorDomain;

const renderRoot = (scene: DesignerEditingScene, store: ReturnType<typeof createInspectorStore>, prepareDomain: () => Promise<EditorInspectorDomain>) => (
    <EditorWorkspaceContext.Provider value={{readScene: () => scene} as never}>
        <InspectorRoot
            prepareDomain={prepareDomain}
            closePanel={() => store.setContentVisible(false)}
            store={store}
            trackTask={task => task}
        />
    </EditorWorkspaceContext.Provider>
);

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('InspectorRoot scene lifecycle', () => {
    it('keeps the right menu mounted for a selected layer while the narrow panel is collapsed', async () => {
        vi.stubGlobal('innerWidth', 700);
        const scene = createScene('scene-narrow');
        const target = createInspectorTarget('layer-a');
        const store = createInspectorStore();
        store.activateTarget(target, 'layer-list');
        expect(store.panelOpen).toBe(false);
        const prepareDomain = vi.fn(() => Promise.resolve(createDomain(scene)));
        const view = render(renderRoot(scene, store, prepareDomain));

        expect(await screen.findByTestId('inspector-menu')).toBeInTheDocument();
        expect(screen.getByTestId('inspector-domain')).toHaveAttribute('data-open', 'false');
        expect(screen.queryByTestId('inspector-config')).not.toBeInTheDocument();
        expect(prepareDomain).toHaveBeenCalledOnce();

        view.unmount();
        store.dispose();
    });

    it('waits for the panel to open, then keeps the prepared domain and draft across close and reopen', async () => {
        const scene = createScene('scene-a');
        const store = createInspectorStore();
        const domain = createDomain(scene);
        const prepareDomain = vi.fn(() => store.panelOpen
            ? Promise.resolve(domain)
            : new Promise<EditorInspectorDomain>(() => undefined));
        const view = render(renderRoot(scene, store, prepareDomain));

        expect(prepareDomain).not.toHaveBeenCalled();
        expect(screen.queryByTestId('inspector-domain')).not.toBeInTheDocument();

        await act(async () => {
            store.setContentVisible(true);
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(await screen.findByTestId('inspector-domain')).toHaveAttribute('data-open', 'true');
        expect(prepareDomain).toHaveBeenCalledTimes(1);

        fireEvent.change(screen.getByRole('textbox', {name: '草稿'}), {target: {value: '保留的草稿'}});
        fireEvent.click(screen.getByRole('button', {name: '关闭'}));
        expect(screen.getByTestId('inspector-domain')).toHaveAttribute('data-open', 'false');
        expect(screen.getByRole('textbox', {name: '草稿'})).toHaveValue('保留的草稿');

        await act(async () => {
            store.setContentVisible(true);
            await Promise.resolve();
            await Promise.resolve();
        });
        await waitFor(() => expect(screen.getByTestId('inspector-domain')).toHaveAttribute('data-open', 'true'));
        expect(prepareDomain).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('textbox', {name: '草稿'})).toHaveValue('保留的草稿');

        view.unmount();
        store.dispose();
    });

    it('keeps the inspector UI and local draft mounted while writes are paused and resumed', async () => {
        const scene = createScene('scene-a');
        const target = createInspectorTarget('component-a');
        const store = createInspectorStore();
        store.activateTarget(target);
        const owner = {
            ...createInspectorTestDomain([target]).domain,
            sceneIdentity: scene.identity,
            sceneVersion: scene.version,
        };
        let ownerWritesEnabled = true;
        const domain = createInspectorConsumerDomain(owner, {
            isActive: () => true,
            canEdit: () => store.isAccepting && ownerWritesEnabled,
        });
        const prepareDomain = vi.fn(() => Promise.resolve(domain));
        const view = render(renderRoot(scene, store, prepareDomain));

        expect(await screen.findByTestId('inspector-domain')).toHaveAttribute('data-open', 'true');
        fireEvent.change(screen.getByRole('textbox', {name: '草稿'}), {target: {value: '暂停期间的草稿'}});

        await act(async () => {
            ownerWritesEnabled = false;
            store.setAccepting(false);
            await Promise.resolve();
        });
        expect(domain.isActive()).toBe(true);
        expect(domain.readTarget('component-a')?.id).toBe('component-a');
        expect(screen.getByTestId('inspector-domain')).toBeInTheDocument();
        expect(screen.getByRole('textbox', {name: '草稿'})).toHaveValue('暂停期间的草稿');

        await act(async () => {
            ownerWritesEnabled = true;
            store.setAccepting(true);
            await Promise.resolve();
        });
        expect(screen.getByTestId('inspector-domain')).toBeInTheDocument();
        expect(screen.getByRole('textbox', {name: '草稿'})).toHaveValue('暂停期间的草稿');
        expect(prepareDomain).toHaveBeenCalledOnce();

        view.unmount();
        store.dispose();
    });

    it('rebinds the domain when scene identity changes without a version change', async () => {
        const sceneA = createScene('scene-a', 11);
        const sceneB = createScene('scene-b', 11);
        const store = createInspectorStore();
        const domainA = createDomain(sceneA);
        const domainB = createDomain(sceneB);
        const prepareDomain = vi.fn()
            .mockResolvedValueOnce(domainA)
            .mockResolvedValueOnce(domainB);
        const view = render(renderRoot(sceneA, store, prepareDomain));

        act(() => store.setContentVisible(true));
        expect(await screen.findByText('scene-a')).toBeInTheDocument();
        expect(prepareDomain).toHaveBeenCalledTimes(1);

        await act(async () => {
            view.rerender(renderRoot(sceneB, store, prepareDomain));
            await Promise.resolve();
            await Promise.resolve();
        });
        await waitFor(() => expect(screen.getByText('scene-b')).toBeInTheDocument());
        expect(prepareDomain).toHaveBeenCalledTimes(2);

        view.unmount();
        store.dispose();
    });
});
