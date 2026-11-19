/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {EditorSelectionChange} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {editorSelectionChangedKey} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {PluginStopParticipant} from '@datavisool/sdk/plugin';
import type {ComponentDataUpdater, HostDataUpdaterOptions} from '@datavisool/sdk/core';
import {createEditorInspectorPlugin} from '@/plugins/editor-inspector/editorInspectorPlugin.tsx';
import {createInspectorConsumerDomain} from '@/plugins/editor-inspector/consumer-domain.ts';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';
import {createInspectorTarget, createInspectorTestDomain} from './support/inspectorDomainFixture.ts';

type Harness = ReturnType<typeof createPluginHarness>;
const harnesses: Harness[] = [];

function createPluginHarness(prepareInspectorDomain: () => Promise<EditorInspectorDomain>) {
    const disposers: Array<() => void> = [];
    const stops: PluginStopParticipant[] = [];
    const listeners = new Map<string, Array<(payload: any) => unknown>>();
    const sidePanels = new Map<string, {readState(): {open: boolean; order: number}; close(restoreFocus: boolean): void}>();
    const context = {
        designerRuntime: {registerHostConfigPanels: () => () => undefined},
        editorCanvas: {prepareInspectorDomain},
        editorShell: {
            nextPanelOpenOrder: () => 1,
            registerSidePanel(panel: {id: string; readState(): {open: boolean; order: number}; close(restoreFocus: boolean): void}) {
                sidePanels.set(panel.id, panel);
                return () => sidePanels.delete(panel.id);
            },
            registerView: () => () => undefined,
        },
        onDispose(dispose: () => void) { disposers.push(dispose); },
        onStop(stop: PluginStopParticipant) { stops.push(stop); },
        on(key: {id: string}, listener: (payload: any) => unknown) {
            const subscribers = listeners.get(key.id) ?? [];
            subscribers.push(listener);
            listeners.set(key.id, subscribers);
            return () => listeners.set(key.id, subscribers.filter(item => item !== listener));
        },
        emit: async () => undefined,
    };
    createEditorInspectorPlugin().activate(context as never);
    const harness = {
        sidePanels,
        stop: stops[0],
        async emitSelection(payload: EditorSelectionChange) {
            await Promise.all((listeners.get(editorSelectionChangedKey.id) ?? []).map(listener => listener(payload)));
        },
        dispose() { disposers.splice(0).reverse().forEach(dispose => dispose()); },
    };
    harnesses.push(harness);
    return harness;
}

const select = (id: string): EditorSelectionChange => ({
    ids: [id],
    source: 'canvas',
    interaction: {kind: 'inspect', id},
});

afterEach(() => {
    harnesses.splice(0).forEach(harness => harness.dispose());
    vi.useRealTimers();
});

describe('editor inspector activation lifecycle', () => {
    it('keeps each activation isolated and preserves its panel when stop is cancelled', async () => {
        const targets = ['a', 'b'].map(id => createInspectorTarget(id));
        const firstDomain = createInspectorTestDomain(targets).domain;
        const secondDomain = createInspectorTestDomain(targets).domain;
        const first = createPluginHarness(async () => firstDomain);
        const second = createPluginHarness(async () => secondDomain);

        await first.emitSelection(select('a'));
        await second.emitSelection(select('a'));
        expect(first.sidePanels.get('inspector')?.readState().open).toBe(true);
        expect(second.sidePanels.get('inspector')?.readState().open).toBe(true);

        await first.stop.pause?.('application');
        await first.emitSelection({ids: [], source: 'canvas', interaction: {kind: 'clear-inspector'}});
        await second.emitSelection({ids: [], source: 'canvas', interaction: {kind: 'clear-inspector'}});
        expect(first.sidePanels.get('inspector')?.readState().open).toBe(true);
        expect(second.sidePanels.get('inspector')?.readState().open).toBe(false);

        await first.stop.cancel?.('application');
        await first.emitSelection({ids: [], source: 'canvas', interaction: {kind: 'clear-inspector'}});
        expect(first.sidePanels.get('inspector')?.readState().open).toBe(false);
    });

    it('lets stop preparation finish after aborting a pending domain read and rejects its late result', async () => {
        const domain = createInspectorTestDomain([createInspectorTarget('a')]).domain;
        let resolveFirst: ((value: EditorInspectorDomain) => void) | undefined;
        let calls = 0;
        const harness = createPluginHarness(() => {
            calls++;
            if (calls === 1) return new Promise<EditorInspectorDomain>(resolve => { resolveFirst = resolve; });
            return Promise.resolve(domain);
        });

        const lateSelection = harness.emitSelection(select('a'));
        await harness.stop.pause?.('application');
        await harness.stop.prepare?.('application');
        resolveFirst?.(domain);
        await lateSelection;
        expect(harness.sidePanels.get('inspector')?.readState().open).toBe(false);
        await harness.stop.cancel?.('application');
        await harness.emitSelection(select('a'));

        expect(calls).toBe(2);
        expect(harness.sidePanels.get('inspector')?.readState().open).toBe(true);
    });

    it('keeps facade reads available during pause while rejecting every write and stale scene writes', () => {
        const target = createInspectorTarget('a');
        const mutable = {active: true, accepting: true, writes: 0};
        const facade = {
            config: {style: {color: 'red'}},
            getConfig: () => ({style: {color: 'red'}}),
            update: () => { mutable.writes++; },
            changeData: () => { mutable.writes++; },
            isCurrent: () => mutable.active,
        };
        const owner = {
            ...createInspectorTestDomain([target]).domain,
            createControllerFacade: () => facade,
            applyStatusChange: () => { mutable.writes++; return true; },
            applyLayerEdit: () => { mutable.writes++; return true; },
            resetConfig: () => { mutable.writes++; return true; },
            prepareDataSourceTest: (_id, _kind, config) => { mutable.writes++; return config; },
            applyTheme: () => { mutable.writes++; return true; },
            applyFilter: () => { mutable.writes++; return true; },
        };
        const consumer = createInspectorConsumerDomain(owner, {
            isActive: () => mutable.active,
            canEdit: () => mutable.accepting,
        });
        const consumerFacade = consumer.createControllerFacade('a')!;

        mutable.accepting = false;
        expect(consumer.readTarget('a')?.id).toBe('a');
        expect(consumerFacade.getConfig()).toEqual({style: {color: 'red'}});
        expect(consumerFacade.isCurrent()).toBe(true);
        consumerFacade.update({style: {color: 'blue'}});
        consumerFacade.changeData({value: 1});
        expect(consumer.applyStatusChange('a', {kind: 'add'})).toBe(false);
        expect(consumer.applyLayerEdit('a', {kind: 'rename', name: 'ignored'})).toBe(false);
        expect(consumer.resetConfig('a')).toBe(false);
        expect(consumer.prepareDataSourceTest('a', 'api', {url: 'late'})).toBeUndefined();
        expect(consumer.applyTheme('a', {id: 'theme'} as never)).toBe(false);
        expect(consumer.applyFilter('a', {enable: true})).toBe(false);
        expect(mutable.writes).toBe(0);

        mutable.accepting = true;
        consumerFacade.update({style: {color: 'green'}});
        expect(mutable.writes).toBe(1);
        mutable.active = false;
        consumerFacade.update({style: {color: 'late'}});
        expect(consumerFacade.isCurrent()).toBe(false);
        expect(mutable.writes).toBe(1);
    });

    it('binds host data updaters to the owner and uses a fresh signal after stop cancellation', () => {
        let signalController = new AbortController();
        let accepting = true;
        const updaterRuns: Array<ReturnType<typeof vi.fn>> = [];
        const updaterDestroys: Array<ReturnType<typeof vi.fn>> = [];
        const facade = {
            config: {},
            getConfig: () => ({}),
            isCurrent: () => true,
            update: () => undefined,
            changeData: () => undefined,
            createHostDataUpdater: vi.fn(function (
                this: unknown,
                _success: (data?: any) => void,
                _fail: () => void,
                options?: HostDataUpdaterOptions,
            ): ComponentDataUpdater {
                expect(this).toBe(facade);
                let disposed = false;
                const run = vi.fn();
                const destroy = vi.fn(() => {
                    if (disposed) return;
                    disposed = true;
                    options?.onDispose?.();
                });
                updaterRuns.push(run);
                updaterDestroys.push(destroy);
                options?.signal?.addEventListener('abort', destroy, {once: true});
                return {run, destroy};
            }),
        };
        const owner = {
            ...createInspectorTestDomain([createInspectorTarget('a')]).domain,
            createControllerFacade: () => facade,
        };
        const consumer = createInspectorConsumerDomain(owner, {
            isActive: () => true,
            canEdit: () => accepting,
            readSignal: () => signalController.signal,
        });
        const controller = consumer.createControllerFacade('a')!;

        const first = controller.createHostDataUpdater!(() => undefined, () => undefined)!;
        expect(facade.createHostDataUpdater).toHaveBeenCalledOnce();
        signalController.abort();
        expect(updaterDestroys[0]).toHaveBeenCalledOnce();
        first.run({sourceType: 'static'} as never);
        expect(updaterRuns[0]).not.toHaveBeenCalled();

        accepting = false;
        expect(controller.createHostDataUpdater!(() => undefined, () => undefined)).toBeNull();
        expect(facade.createHostDataUpdater).toHaveBeenCalledOnce();

        accepting = true;
        signalController = new AbortController();
        const second = controller.createHostDataUpdater!(() => undefined, () => undefined)!;
        second.run({sourceType: 'static'} as never);
        expect(facade.createHostDataUpdater).toHaveBeenCalledTimes(2);
        expect(updaterRuns[1]).toHaveBeenCalledOnce();
        second.destroy();
        expect(updaterDestroys[1]).toHaveBeenCalledOnce();
    });

    it('runs all pause cleanup callbacks even when one cleanup throws', () => {
        vi.useFakeTimers();
        const store = createInspectorStore();
        const target = createInspectorTarget('a');
        const cancelPendingEdit = vi.fn();
        const secondCleanup = vi.fn();
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        store.activateTarget(target);
        store.setBaseInfoRef('a', {setState: () => undefined, cancelPending: cancelPendingEdit});
        store.registerPauseCleanup(() => { throw new Error('cleanup failure'); });
        store.registerPauseCleanup(secondCleanup);
        store.remountConfigDetailsPanel();

        store.setAccepting(false);
        store.clearTarget();
        const lateCleanup = vi.fn();
        store.registerPauseCleanup(lateCleanup);
        vi.runAllTimers();
        expect(store.activeElem.id).toBe('a');
        expect(store.detailVisible).toBe(true);
        expect(cancelPendingEdit).toHaveBeenCalledOnce();
        expect(secondCleanup).toHaveBeenCalledOnce();
        expect(lateCleanup).toHaveBeenCalledOnce();
        expect(log).toHaveBeenCalled();

        store.setAccepting(true);
        store.dispose();
        expect(secondCleanup).toHaveBeenCalledTimes(2);
        log.mockRestore();
    });
});
