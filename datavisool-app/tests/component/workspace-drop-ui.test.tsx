/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, test, vi} from 'vitest';

vi.mock('@/designer/manager/ManagerStore.ts', () => ({
    default: {currentManager: {canvasManager: {canvasConfig: {width: 1920, height: 1080}}}},
}));

import DesignerWorkspaceShell from '@/designer/workspace/DesignerWorkspaceShell.tsx';
import {getMainCanvasDropPoint} from '@/designer/workspace/viewport/ArtboardDropTarget.ts';
import viewportStore from '@/designer/workspace/viewport/ViewportStore.ts';

describe('floating workspace drop boundaries', () => {
    beforeEach(() => viewportStore.setCamera({translationX: 0, translationY: 0, scale: 1}));

    test('rejects drops on zoom controls while accepting the same point on the artboard', () => {
        const {container} = render(<DesignerWorkspaceShell
            canvas={<div className="designer-ds-container"><div id="artboard"/></div>}
            header={null} left={null} right={null} footer={null}
        />);
        const canvas = container.querySelector<HTMLElement>('#artboard')!;
        const point = {x: 500, y: 760};
        const zoomControls = screen.getByRole('group', {name: '画布缩放'});
        const controls = [zoomControls, ...zoomControls.querySelectorAll('button, input, svg, span')];

        for (const target of controls)
            expect(getMainCanvasDropPoint(point, canvas, target)?.within).toBe(false);
        expect(getMainCanvasDropPoint(point, canvas, canvas)).toEqual({position: point, within: true});
    });
});
