/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Suspense} from 'react';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PluginStopParticipant} from '@datavisool/sdk/plugin';
import {editorAiDraftChangedKey, type EditorAiEditingSession} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {createEditorAiPlugin} from '@/plugins/editor-ai/editorAiPlugin.tsx';

const mocks = vi.hoisted(() => ({
    onTaskEvent: undefined as undefined | ((event: never) => Promise<void>),
    terminal: undefined as undefined | {logs: Array<{level: string; message: string}>},
    createBridge: vi.fn(),
    handleEvent: vi.fn(async () => {}), pause: vi.fn(), prepareStop: vi.fn(async () => {}),
    cancelStop: vi.fn(), withdraw: vi.fn(async () => {}), readDraftSession: vi.fn(),
}));
vi.mock('@/plugins/editor-ai/AiDrivenBar.tsx', () => ({
    default: (props: {onTaskEvent(event: never): Promise<void>; terminal: NonNullable<typeof mocks.terminal>}) => {
        mocks.onTaskEvent = props.onTaskEvent;
        mocks.terminal = props.terminal;
        return null;
    },
}));
vi.mock('@/plugins/editor-ai/AiDrivenWebEffectBridge.ts', () => ({
    createAiDrivenWebEffectBridge: (...args: unknown[]) => mocks.createBridge(...args),
}));

const cleanups: Array<() => void | Promise<void>> = [];
const stableScope = Object.freeze({rootId: '10', activeId: '10', nested: false, loopPath: Object.freeze([])});
beforeEach(() => {
    vi.clearAllMocks();
    mocks.onTaskEvent = undefined;
    mocks.terminal = undefined;
    mocks.readDraftSession.mockReturnValue(undefined);
    mocks.createBridge.mockReturnValue({...mocks, invalidateInactiveScopes() {}, readDraftSession: mocks.readDraftSession});
});
afterEach(async () => {
    cleanup();
    for (const dispose of cleanups.splice(0).reverse()) await dispose();
});

function fixture(catalog: Promise<unknown> = Promise.resolve({})) {
    const views = new Map<string, any>();
    const listeners = new Map<unknown, (value: any) => void>();
    let stop!: PluginStopParticipant;
    const prepare = vi.fn(() => catalog);
    const context = {
        designerCatalog: {prepare}, editorCanvas: {readAiWorkspace: () => ({scope: stableScope, sceneVersion: 7})},
        editorShell: {
            registerView: (id: string, view: unknown) => { views.set(id, view); return () => { views.delete(id); }; },
            setAssistantVisible: vi.fn(),
        },
        editorCommands: {register: () => () => {}},
        on: (key: unknown, listener: (value: any) => void) => {
            listeners.set(key, listener);
            return () => { listeners.delete(key); };
        },
        onDispose: (dispose: () => void | Promise<void>) => { cleanups.push(dispose); return () => {}; },
        onStop: (participant: PluginStopParticipant) => { stop = participant; return () => {}; },
    };
    createEditorAiPlugin().activate(context as never);
    return {prepare, views, emit: (key: unknown, value: unknown) => listeners.get(key)?.(value), get stop() { return stop; }};
}

async function mountAssistant(views: Map<string, any>) {
    const Panel = views.get('assistant').Panel;
    render(<Suspense fallback={null}><Panel open onClose={() => {}}/></Suspense>);
    await waitFor(() => expect(mocks.onTaskEvent).toBeTypeOf('function'));
}

describe('AI activation owns lazy task initialization', () => {
    it('prepares the catalog and effect tools only when the first task event arrives', async () => {
        const {prepare, views} = fixture();
        expect(prepare).not.toHaveBeenCalled();
        expect(mocks.createBridge).not.toHaveBeenCalled();
        await mountAssistant(views);
        expect(prepare).not.toHaveBeenCalled();
        await mocks.onTaskEvent!({eventId: 'first'} as never);
        await mocks.onTaskEvent!({eventId: 'second'} as never);
        expect(prepare).toHaveBeenCalledOnce();
        expect(mocks.createBridge).toHaveBeenCalledOnce();
        expect(mocks.handleEvent).toHaveBeenCalledTimes(2);
    });

    it('rejects initialization that finishes after pause and creates a fresh bridge after cancel', async () => {
        let resolve!: (value: unknown) => void;
        const {prepare, views, stop} = fixture(new Promise(done => { resolve = done; }));
        await mountAssistant(views);
        const pending = mocks.onTaskEvent!({eventId: 'before-pause'} as never);
        await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
        await stop.pause?.('plugin');
        resolve({});
        await pending;
        expect(mocks.createBridge).not.toHaveBeenCalled();
        await stop.cancel?.('plugin');
        await mocks.onTaskEvent!({eventId: 'after-cancel'} as never);
        expect(mocks.createBridge).toHaveBeenCalledOnce();
        expect(mocks.handleEvent).toHaveBeenCalledWith({eventId: 'after-cancel'});
    });

    it('reports a failed lazy preparation and retries on the next task event', async () => {
        let reject!: (error: Error) => void;
        const {prepare, views} = fixture(new Promise((_resolve, fail) => { reject = fail; }));
        await mountAssistant(views);
        const pending = mocks.onTaskEvent!({eventId: 'failed-prepare'} as never);
        reject(new Error('catalog unavailable'));
        await expect(pending).resolves.toBeUndefined();
        expect(mocks.createBridge).not.toHaveBeenCalled();
        expect(mocks.terminal?.logs).toContainEqual(expect.objectContaining({level: 'error', message: expect.stringContaining('catalog unavailable')}));
        prepare.mockResolvedValueOnce({});
        await mocks.onTaskEvent!({eventId: 'retry-prepare'} as never);
        expect(prepare).toHaveBeenCalledTimes(2);
        expect(mocks.handleEvent).toHaveBeenCalledWith({eventId: 'retry-prepare'});
    });

    it('ignores a failed lazy preparation that returns after the plugin paused', async () => {
        let reject!: (error: Error) => void;
        const {views, stop} = fixture(new Promise((_resolve, fail) => { reject = fail; }));
        await mountAssistant(views);
        const pending = mocks.onTaskEvent!({eventId: 'stale-prepare'} as never);
        await stop.pause?.('plugin');
        reject(new Error('late catalog failure'));
        await expect(pending).resolves.toBeUndefined();
        expect(mocks.createBridge).not.toHaveBeenCalled();
        expect(mocks.terminal?.logs).toEqual([]);
    });

    it('restores the same rendered draft after a prepared stop is cancelled in the same scene', async () => {
        const sceneIdentity = {};
        const draft = {
            draftId: 'draft-kept', revision: 6, layerCount: 1, interactive: true,
            batches: [{batchId: 'batch-kept', sequence: 1, layerCount: 1, bounds: {x: 10, y: 12, width: 220, height: 80}}],
        };
        const session = {
            sceneIdentity, sceneVersion: 7, scope: stableScope,
            isActive: () => true,
            readDraft: vi.fn(() => draft),
            renderDraftBatch: vi.fn(() => <div data-testid="ai-draft-batch">pending draft</div>),
        } as unknown as EditorAiEditingSession;
        mocks.readDraftSession.mockReturnValue(session);
        const {views, stop, emit} = fixture();
        await mountAssistant(views);
        await mocks.onTaskEvent!({eventId: 'create-bridge'} as never);
        emit(editorAiDraftChangedKey, {sceneIdentity, sceneVersion: 7, scope: stableScope, revision: 6});

        const DraftCanvas = views.get('canvasDraft');
        const mounted = render(<Suspense fallback={null}><DraftCanvas/></Suspense>);
        await waitFor(() => expect(mounted.getByTestId('ai-draft-batch')).toBeTruthy());

        await act(async () => { await stop.pause?.('plugin'); });
        expect(mounted.queryByTestId('ai-draft-batch')).toBeNull();
        await stop.prepare?.('plugin');
        await act(async () => { await stop.cancel?.('plugin'); });

        await waitFor(() => expect(mounted.getByTestId('ai-draft-batch')).toBeTruthy());
        expect(session.readDraft()).toBe(draft);
        expect(session.renderDraftBatch).toHaveBeenCalledWith('batch-kept');
    });

});
