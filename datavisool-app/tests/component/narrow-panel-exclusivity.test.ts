/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';
import {createEditorShellPlugin} from '@/plugins/editor-shell/editorShellPlugin.tsx';

function createShellHarness() {
    const disposers: Array<() => void> = [];
    const stops: Array<{pause?(): void; cancel?(): void}> = [];
    let shell: any;
    const routes = {dispose: vi.fn()};
    createEditorShellPlugin().activate({
        designerRuntime: {},
        router: {registerRoutes: () => routes},
        provide: (id: string, service: unknown) => { if (id === 'editorShell') shell = service; },
        onDispose: (dispose: () => void) => { disposers.push(dispose); },
        onStop: (stop: {pause?(): void; cancel?(): void}) => { stops.push(stop); },
    } as never);
    shell.registerDockPanel({id: 'components', Panel: () => null});
    return {shell, stops, dispose: () => disposers.reverse().forEach(dispose => dispose())};
}

describe('narrow editor panel exclusivity', () => {
    let harness: ReturnType<typeof createShellHarness>;
    let inspectorStore: ReturnType<typeof createInspectorStore>;

    beforeEach(() => {
        vi.stubGlobal('innerWidth', 959);
        harness = createShellHarness();
        inspectorStore = createInspectorStore();
        inspectorStore.setPanelOrderProvider(harness.shell.nextPanelOpenOrder);
    });

    afterEach(() => {
        harness.dispose();
        inspectorStore.dispose();
        vi.unstubAllGlobals();
    });

    const registerInspectorSidePanel = () => harness.shell.registerSidePanel({
        id: 'inspector',
        side: 'right',
        readState: () => ({open: inspectorStore.panelOpen, order: inspectorStore.panelOpenOrder}),
        close: (restoreFocus: boolean) => inspectorStore.setContentVisible(false, restoreFocus),
    });

    test('keeps the panel opened most recently when the viewport is narrow', () => {
        harness.shell.openDockPanel('components');
        registerInspectorSidePanel();
        inspectorStore.setContentVisible(true, false);

        expect(harness.shell.isDockPanelOpen('components')).toBe(false);
        expect(inspectorStore.panelOpen).toBe(true);
    });

    test('keeps the left panel when it was opened most recently', () => {
        registerInspectorSidePanel();
        inspectorStore.setContentVisible(true, false);
        harness.shell.openDockPanel('components');

        expect(harness.shell.isDockPanelOpen('components')).toBe(true);
        expect(inspectorStore.panelOpen).toBe(false);
    });

    test('allows both panels to stay open at the wide-screen breakpoint', () => {
        vi.stubGlobal('innerWidth', 960);
        harness.shell.openDockPanel('components');
        registerInspectorSidePanel();
        inspectorStore.setContentVisible(true, false);

        expect(harness.shell.isDockPanelOpen('components')).toBe(true);
        expect(inspectorStore.panelOpen).toBe(true);
    });

    test('keeps a later registration when an old disposer is called twice', () => {
        const panel = {id: 'layers', Panel: () => null};
        const withdrawOld = harness.shell.registerDockPanel(panel);
        harness.shell.openDockPanel('layers');
        withdrawOld();
        expect(harness.shell.isDockPanelOpen('layers')).toBe(false);

        harness.shell.registerDockPanel(panel);
        harness.shell.openDockPanel('layers');
        withdrawOld();
        expect(harness.shell.isDockPanelOpen('layers')).toBe(true);
    });

    test('pauses new opens and resumes the existing dock when stopping is cancelled', () => {
        harness.stops.forEach(stop => stop.pause?.());
        expect(harness.shell.openDockPanel('components')).toBe(false);
        expect(() => harness.shell.registerDockPanel({id: 'late', Panel: () => null})).toThrow();
        harness.stops.forEach(stop => stop.cancel?.());
        expect(harness.shell.openDockPanel('components')).toBe(true);
    });

    test('does not carry dock visibility into another activation', () => {
        harness.shell.openDockPanel('components');
        const next = createShellHarness();
        try {
            expect(next.shell.isDockPanelOpen('components')).toBe(false);
            harness.dispose();
            expect(harness.shell.openDockPanel('components')).toBe(false);
            expect(() => harness.shell.registerDockPanel({id: 'late', Panel: () => null})).toThrow();
            expect(next.shell.openDockPanel('components')).toBe(true);
        } finally { next.dispose(); }
    });
});
