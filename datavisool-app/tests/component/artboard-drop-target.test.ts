/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from 'vitest';

import {getMainCanvasDropPoint} from '@/plugins/editor-canvas/viewport/ArtboardDropTarget.ts';

describe('main canvas drop target', () => {
    test('uses the current camera and canvas origin, and ignores floating UI', () => {
        const camera = {translationX: -180, translationY: 72, scale: 2};
        const canvasSize = {width: 1280, height: 720};

        const viewport = document.createElement('div');
        viewport.className = 'designer-ds-container';
        viewport.getBoundingClientRect = () => ({left: 100, top: 40, right: 1500, bottom: 940, width: 1400, height: 900} as DOMRect);
        const canvas = document.createElement('div');
        viewport.appendChild(canvas);

        const clientPoint = {x: 100 + 20, y: 40 + 472};
        const drop = getMainCanvasDropPoint(clientPoint, canvas, camera, canvasSize);
        expect(drop).toEqual({position: {x: 100, y: 200}, within: true});

        const floatingPanel = document.createElement('div');
        floatingPanel.dataset.viewportUi = '';
        expect(getMainCanvasDropPoint(clientPoint, canvas, camera, canvasSize, floatingPanel)?.within).toBe(false);
    });
});
