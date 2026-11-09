/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from 'vitest';
import {act, cleanup, fireEvent, render} from '@testing-library/react';

const pixiHarness = vi.hoisted(() => ({
    resolveInit: null as null | (() => void),
    webgpuUnavailable: false,
    destroy: vi.fn(),
    addLine: vi.fn(),
}));

vi.mock('pixi.js', () => ({
    Application: class {
        canvas = document.createElement('canvas');
        stage = {interactive: false, addChild: vi.fn(), destroy: vi.fn()};
        renderer: {resize: ReturnType<typeof vi.fn>} | undefined;
        init = vi.fn((options: {preference?: string}) => {
            if (pixiHarness.webgpuUnavailable && options.preference === 'webgpu')
                return Promise.reject(new TypeError('Failed to fetch dynamically imported module: WebGPURenderer.js'));
            return new Promise<void>((resolve) => {
                pixiHarness.resolveInit = () => {
                    this.renderer = {resize: vi.fn()};
                    resolve();
                };
            });
        });
        destroy = vi.fn(() => { pixiHarness.destroy(); });
    },
    Graphics: class {
        clear = vi.fn();
        destroy = vi.fn();
    },
}));

vi.mock('@/designer/blueprint/util/BpCanvasUtil.ts', () => ({
    default: {
        calculateControlPoint: vi.fn(() => ({firstCP: {x: 250, y: 200}, secondCP: {x: 350, y: 200}})),
        reDrawLine: vi.fn(),
        reRenderAllLine: vi.fn(),
    },
    bpLineConfig: {
        connectingColor: '#8c55ff',
        connectingWidth: 2,
        lineColor: '#7654ff',
        lineWidth: 1.6,
        glowWidth: 5,
        hoverColor: '#9d7dff',
        hoverWidth: 2.4,
        circleRadius: 3,
        selectedColor: '#4aa8ff',
        selectedWidth: 2.6,
    },
}));

vi.mock('@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy', () => ({
    default: {doAddLine: pixiHarness.addLine},
    syncBpAnchorColorsFromLines: vi.fn(),
}));

import LineLayer from '@/designer/blueprint/line/LineLayer.tsx';

let restoreEnv: PropertyDescriptor | undefined;

describe('blueprint line layer lifecycle', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        pixiHarness.resolveInit = null;
        pixiHarness.webgpuUnavailable = false;
        pixiHarness.destroy.mockClear();
        pixiHarness.addLine.mockClear();
        if (restoreEnv)
            Object.defineProperty(window, 'DATAVISOOL_ENV', restoreEnv);
        else
            delete (window as Window & {DATAVISOOL_ENV?: unknown}).DATAVISOOL_ENV;
        restoreEnv = undefined;
    });

    test('does not attach a late Pixi canvas or document listeners after closing during init', async () => {
        restoreEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
        const bluePrintManager = {
            canvasOffset: {x: 0, y: 0},
            currentPageManager: {pageId: 'page-1', bpLines: {}, bpNodeLayoutMap: {}},
            currPageNodeControllers: {},
            lineInstances: {},
            pixiApp: null as unknown,
        };
        Object.defineProperty(window, 'DATAVISOOL_ENV', {
            configurable: true,
            value: {currentManager: {bluePrintManager}},
        });

        const addEventListener = vi.spyOn(document, 'addEventListener');
        const removeEventListener = vi.spyOn(document, 'removeEventListener');
        const {container, unmount} = render(
            <div className="blue-print-canvas">
                <LineLayer metrics={{left: 0, top: 0, width: 800, height: 600, resolution: 1}}/>
            </div>
        );
        expect(pixiHarness.resolveInit).toBeTypeOf('function');

        unmount();
        const finishInitialization = pixiHarness.resolveInit;
        await act(async () => {
            finishInitialization?.();
            await Promise.resolve();
        });

        const mouseListenerAdds = addEventListener.mock.calls.filter(([type]) => ['mousedown', 'mousemove', 'mouseup'].includes(String(type)));
        const mouseListenerRemoves = removeEventListener.mock.calls.filter(([type]) => ['mousedown', 'mousemove', 'mouseup'].includes(String(type)));
        expect(mouseListenerAdds).toHaveLength(0);
        expect(mouseListenerRemoves).toHaveLength(3);
        expect(container.querySelector('canvas')).toBeNull();
        expect(bluePrintManager.pixiApp).toBeNull();
        expect(pixiHarness.destroy).toHaveBeenCalledOnce();
    });

    test('can connect anchors when the WebGPU renderer module is unavailable', async () => {
        pixiHarness.webgpuUnavailable = true;
        restoreEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
        Object.defineProperty(window, 'DATAVISOOL_ENV', {
            configurable: true,
            value: {currentManager: {bluePrintManager: {
                canvasOffset: {x: 0, y: 0},
                currentPageManager: {pageId: 'page-1', bpLines: {}, bpNodeLayoutMap: {}},
                currPageNodeControllers: {},
                lineInstances: {},
                selectedLines: [],
                isRepeatLine: () => false,
                pixiApp: null,
            }}},
        });
        vi.stubGlobal('AudioContext', class {
            state = 'running';
            sampleRate = 48000;
            currentTime = 0;
            destination = {};
            createBuffer = vi.fn();
            createBufferSource = () => ({buffer: null, connect: vi.fn(), start: vi.fn()});
            createOscillator = () => ({frequency: {value: 0}, connect: vi.fn(), start: vi.fn(), stop: vi.fn()});
            createGain = () => ({connect: vi.fn(), gain: {
                setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(),
            }});
            close = () => Promise.resolve();
        });
        const {container} = render(
            <div className="blue-print-canvas">
                <div className="ap-circle" id="source:execute:1"/>
                <div className="ap-circle" id="target:execute:0"/>
                <LineLayer metrics={{left: 0, top: 0, width: 800, height: 600, resolution: 1}}/>
            </div>
        );
        const viewport = container.querySelector('.blue-print-canvas')!;
        const source = document.getElementById('source:execute:1')!;
        const target = document.getElementById('target:execute:0')!;
        vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600));
        vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(195, 195, 10, 10));
        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(395, 195, 10, 10));
        const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: vi.fn(() => viewport),
        });
        try {
            await act(async () => {
                pixiHarness.resolveInit?.();
                await Promise.resolve();
            });
            fireEvent.mouseDown(source, {button: 0, clientX: 200, clientY: 200});
            fireEvent.mouseMove(target, {clientX: 400, clientY: 200});
            fireEvent.mouseUp(target, {button: 0, clientX: 400, clientY: 200});

            expect(container.querySelector('.bp-line-layer canvas')).not.toBeNull();
            expect(pixiHarness.addLine).toHaveBeenCalledOnce();
            expect(pixiHarness.addLine).toHaveBeenCalledWith(expect.objectContaining({
                startAnchorId: source.id,
                endAnchorId: target.id,
                startPoint: {x: 200, y: 200},
                endPoint: {x: 400, y: 200},
            }));
        } finally {
            if (elementFromPointDescriptor)
                Object.defineProperty(document, 'elementFromPoint', elementFromPointDescriptor);
            else
                Reflect.deleteProperty(document, 'elementFromPoint');
        }
    });
});
