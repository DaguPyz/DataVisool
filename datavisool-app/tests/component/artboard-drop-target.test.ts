/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from 'vitest';

const stores = vi.hoisted(() => ({
    manager: {currentManager: null as any},
    viewport: {camera: {translationX: 0, translationY: 0, scale: 1}},
}));

vi.mock('@/designer/manager/ManagerStore.ts', () => ({default: stores.manager}));
vi.mock('@/designer/workspace/viewport/ViewportStore.ts', () => ({default: stores.viewport}));

import {getMainCanvasDropPoint} from '@/designer/workspace/viewport/ArtboardDropTarget.ts';

afterEach(() => {
    stores.manager.currentManager = null;
    stores.viewport.camera = {translationX: 0, translationY: 0, scale: 1};
});

describe('main canvas drop target', () => {
    test('uses the current camera and canvas origin, and ignores floating UI', () => {
        stores.manager.currentManager = {
            canvasManager: {canvasConfig: {width: 1280, height: 720}},
        };
        stores.viewport.camera = {translationX: -180, translationY: 72, scale: 2};

        const viewport = document.createElement('div');
        viewport.className = 'designer-ds-container';
        viewport.getBoundingClientRect = () => ({left: 100, top: 40, right: 1500, bottom: 940, width: 1400, height: 900} as DOMRect);
        const canvas = document.createElement('div');
        viewport.appendChild(canvas);

        const clientPoint = {x: 100 + 20, y: 40 + 472};
        const drop = getMainCanvasDropPoint(clientPoint, canvas);
        expect(drop).toEqual({position: {x: 100, y: 200}, within: true});

        const floatingPanel = document.createElement('div');
        floatingPanel.dataset.viewportUi = '';
        expect(getMainCanvasDropPoint(clientPoint, canvas, floatingPanel)?.within).toBe(false);
    });
});
