/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from 'vitest';

vi.stubGlobal('Worker', class {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    postMessage() {}
    terminate() {}
});
if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {configurable: true, value: () => 'blob:viewport-test'});
}
const {getWheelIntent, handleWorkspaceWheel} = await import('@/designer/workspace/viewport/ViewportController.ts');

const setMetrics = (element: HTMLElement, metrics: Partial<Record<'clientWidth' | 'clientHeight' | 'scrollWidth' | 'scrollHeight' | 'scrollLeft' | 'scrollTop', number>>) => {
    Object.entries(metrics).forEach(([key, value]) => {
        Object.defineProperty(element, key, {configurable: true, value});
    });
};

const wheel = (target: EventTarget, overrides: Partial<WheelEvent> = {}) => ({
    target,
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides,
});

describe('workspace wheel routing', () => {
    let viewport: HTMLDivElement;

    afterEach(() => {
        viewport?.remove();
    });

    const createViewport = () => {
        viewport = document.createElement('div');
        document.body.append(viewport);
        return viewport;
    };

    test.each([false, true])('leaves consumed component wheel events alone (Alt: %s)', (altKey) => {
        const root = createViewport();
        const component = document.createElement('canvas');
        root.append(component);
        const zoom = vi.fn();
        const pan = vi.fn();
        const componentWheel = vi.fn((event: WheelEvent) => event.preventDefault());
        component.addEventListener('wheel', componentWheel, {passive: false});
        root.addEventListener('wheel', (event) => handleWorkspaceWheel(event, root, zoom, pan), {passive: false});

        component.dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: -100, altKey}));

        expect(componentWheel).toHaveBeenCalledOnce();
        expect(pan).not.toHaveBeenCalled();
        expect(zoom).not.toHaveBeenCalled();
    });

    test('leaves vertical scrolling to a nested scrollable component while it has room', () => {
        const root = createViewport();
        const outer = document.createElement('div');
        const inner = document.createElement('div');
        const content = document.createElement('span');
        outer.style.overflowY = 'auto';
        inner.style.overflowY = 'auto';
        root.append(outer);
        outer.append(inner);
        inner.append(content);
        setMetrics(outer, {clientHeight: 100, scrollHeight: 300, scrollTop: 0});
        setMetrics(inner, {clientHeight: 100, scrollHeight: 300, scrollTop: 50});

        expect(getWheelIntent(wheel(content, {deltaY: 20}), root)).toBe('native');
    });

    test('lets a parent scroller consume a nested scroller event at the inner boundary', () => {
        const root = createViewport();
        const outer = document.createElement('div');
        const inner = document.createElement('div');
        const content = document.createElement('span');
        outer.style.overflowY = 'auto';
        inner.style.overflowY = 'auto';
        root.append(outer);
        outer.append(inner);
        inner.append(content);
        setMetrics(outer, {clientHeight: 100, scrollHeight: 300, scrollTop: 20});
        setMetrics(inner, {clientHeight: 100, scrollHeight: 300, scrollTop: 200});

        expect(getWheelIntent(wheel(content, {deltaY: 10}), root)).toBe('native');
    });

    test.each(['contain', 'none'] as const)('honors overscroll-behavior: %s at the nested scroller boundary', (behavior) => {
        const root = createViewport();
        const outer = document.createElement('div');
        const inner = document.createElement('div');
        outer.style.overflowY = 'auto';
        inner.style.overflowY = 'auto';
        inner.style.overscrollBehaviorY = behavior;
        root.append(outer);
        outer.append(inner);
        setMetrics(outer, {clientHeight: 100, scrollHeight: 300, scrollTop: 20});
        setMetrics(inner, {clientHeight: 100, scrollHeight: 300, scrollTop: 200});
        const event = new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: 10});
        Object.defineProperty(event, 'target', {value: inner});
        const pan = vi.fn();

        expect(getWheelIntent(wheel(inner, {deltaY: 10}), root)).toBe('blocked');
        expect(handleWorkspaceWheel(event, root, vi.fn(), pan)).toBe('blocked');
        expect(event.defaultPrevented).toBe(true);
        expect(pan).not.toHaveBeenCalled();
    });

    test('pans the workspace when all vertical scrollers are at the requested boundary', () => {
        const root = createViewport();
        const inner = document.createElement('div');
        inner.style.overflowY = 'auto';
        root.append(inner);
        setMetrics(inner, {clientHeight: 100, scrollHeight: 300, scrollTop: 0});

        expect(getWheelIntent(wheel(inner, {deltaY: -10}), root)).toBe('pan');
        const event = new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: -10});
        Object.defineProperty(event, 'target', {value: inner});
        const pan = vi.fn();
        expect(handleWorkspaceWheel(event, root, vi.fn(), pan)).toBe('pan');
        expect(event.defaultPrevented).toBe(true);
        expect(pan).toHaveBeenCalledOnce();
        expect(Math.abs(pan.mock.calls[0][0])).toBe(0);
        expect(pan.mock.calls[0][1]).toBe(10);
    });

    test('routes horizontal scrolling by direction and returns to panning at the edge', () => {
        const root = createViewport();
        const scroller = document.createElement('div');
        scroller.style.overflowX = 'auto';
        root.append(scroller);
        setMetrics(scroller, {clientWidth: 100, scrollWidth: 300, scrollLeft: 100});

        expect(getWheelIntent(wheel(scroller, {deltaX: 20}), root)).toBe('native');
        setMetrics(scroller, {scrollLeft: 200});
        expect(getWheelIntent(wheel(scroller, {deltaX: 20}), root)).toBe('pan');
    });

    test('does not let floating UI wheel events control the workspace', () => {
        const root = createViewport();
        const panel = document.createElement('div');
        const button = document.createElement('button');
        panel.dataset.viewportUi = '';
        panel.style.overflowY = 'auto';
        root.append(panel);
        panel.append(button);
        setMetrics(panel, {clientHeight: 100, scrollHeight: 300, scrollTop: 200});

        expect(getWheelIntent(wheel(button, {deltaY: 10}), root)).toBe('native');
    });

    test('keeps Alt-wheel zoom and Ctrl/Cmd-wheel suppression behavior', () => {
        const root = createViewport();
        const target = document.createElement('div');
        root.append(target);

        expect(getWheelIntent(wheel(target, {deltaY: 20, altKey: true}), root)).toBe('zoom');
        expect(getWheelIntent(wheel(target, {deltaY: 20, ctrlKey: true}), root)).toBe('suppress');
        expect(getWheelIntent(wheel(target, {deltaY: 20, metaKey: true}), root)).toBe('suppress');
    });

    test('Alt-wheel prevents the default action and zooms at the pointer', () => {
        const root = createViewport();
        const target = document.createElement('div');
        root.append(target);
        const zoom = vi.fn();
        const pan = vi.fn();
        const event = new WheelEvent('wheel', {bubbles: true, cancelable: true, altKey: true, deltaY: 20, clientX: 30, clientY: 40});
        Object.defineProperty(event, 'target', {value: target});

        handleWorkspaceWheel(event, root, zoom, pan);

        expect(event.defaultPrevented).toBe(true);
        expect(zoom).toHaveBeenCalledWith(1 / 1.2, {x: 30, y: 40});
        expect(pan).not.toHaveBeenCalled();
    });

    test.each([false, true])('suppresses camera changes when wheel input reports pressed buttons (Alt: %s)', (altKey) => {
        const root = createViewport();
        const zoom = vi.fn();
        const pan = vi.fn();
        const event = new WheelEvent('wheel', {cancelable: true, deltaY: 100, buttons: 1, altKey});
        Object.defineProperty(event, 'target', {value: root});

        expect(handleWorkspaceWheel(event, root, zoom, pan)).toBe('suppress');
        expect(event.defaultPrevented).toBe(true);
        expect(zoom).not.toHaveBeenCalled();
        expect(pan).not.toHaveBeenCalled();
    });
});
