/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {render, screen} from '@testing-library/react';
import {describe, expect, test} from 'vitest';

import DesignerWorkspaceShell from '@/plugins/editor-shell/DesignerWorkspaceShell.tsx';
import {getMainCanvasDropPoint} from '@/plugins/editor-canvas/viewport/ArtboardDropTarget.ts';
import WorkspaceZoomControls from '@/plugins/editor-canvas/WorkspaceZoomControls.tsx';
import {EditorCanvasActivationProvider, type EditorCanvasActivation} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';
import {ViewportStore} from '@/plugins/editor-canvas/viewport/ViewportStore.ts';

const viewportStore = new ViewportStore();
const activation = {viewportStore} as unknown as EditorCanvasActivation;

describe('floating workspace drop boundaries', () => {
    test('rejects drops on zoom controls while accepting the same point on the artboard', () => {
        const {container} = render(<DesignerWorkspaceShell
            canvas={<div className="designer-ds-container"><div id="artboard"/></div>}
            header={null} left={null} right={null} footer={null}
            zoomControls={<EditorCanvasActivationProvider value={activation}>
                <WorkspaceZoomControls/>
            </EditorCanvasActivationProvider>}
        />);
        const canvas = container.querySelector<HTMLElement>('#artboard')!;
        const point = {x: 500, y: 760};
        const canvasSize = {width: 1920, height: 1080};
        const zoomControls = screen.getByRole('group', {name: '画布缩放'});
        const controls = [zoomControls, ...zoomControls.querySelectorAll('button, input, svg, span')];

        for (const target of controls)
            expect(getMainCanvasDropPoint(point, canvas, viewportStore.camera, canvasSize, target)?.within).toBe(false);
        expect(getMainCanvasDropPoint(point, canvas, viewportStore.camera, canvasSize, canvas))
            .toEqual({position: point, within: true});
    });
});
