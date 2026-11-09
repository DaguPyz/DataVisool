/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from 'vitest';
import {isCanvasToolShortcutTarget, shouldFocusWorkspaceCanvas} from '@/designer/operate-provider/hot-key/CanvasToolContext.ts';

const createWorkspace = () => {
    const ruler = document.createElement('div');
    ruler.className = 'datavisool-ruler-content';
    const viewport = document.createElement('div');
    viewport.className = 'designer-ds-container';
    ruler.appendChild(viewport);
    document.body.appendChild(ruler);
    return {ruler, viewport};
};

describe('workspace canvas shortcut target', () => {
    it('allows canvas blank space and focuses the workspace viewport', () => {
        const {ruler, viewport} = createWorkspace();
        const blankCanvas = document.createElement('div');
        viewport.appendChild(blankCanvas);

        expect(isCanvasToolShortcutTarget(blankCanvas)).toBe(true);
        expect(shouldFocusWorkspaceCanvas(blankCanvas, viewport)).toBe(true);
        expect(shouldFocusWorkspaceCanvas(ruler, viewport)).toBe(false);
        ruler.remove();
    });

    it.each([
        ['input', 'input'],
        ['button', 'button'],
        ['toolbar marker', '[data-workspace-toolbar]'],
        ['blueprint canvas', '.blue-print-canvas'],
    ])('excludes %s from tool shortcuts and focus transfer', (_label, selector) => {
        const {ruler, viewport} = createWorkspace();
        const target = document.createElement('div');
        const excluded = document.createElement(selector.startsWith('.') ? 'div' : selector === 'input' ? 'input' : selector === 'button' ? 'button' : 'div');
        if (selector.startsWith('.'))
            excluded.classList.add(selector.slice(1));
        else if (selector.startsWith('['))
            excluded.setAttribute('data-workspace-toolbar', '');
        excluded.appendChild(target);
        viewport.appendChild(excluded);

        expect(isCanvasToolShortcutTarget(target)).toBe(false);
        expect(shouldFocusWorkspaceCanvas(target, viewport)).toBe(false);
        ruler.remove();
    });

    it('excludes editable content nested in the canvas', () => {
        const {ruler, viewport} = createWorkspace();
        const editable = document.createElement('div');
        editable.setAttribute('contenteditable', 'true');
        const child = document.createElement('span');
        editable.appendChild(child);
        viewport.appendChild(editable);

        expect(isCanvasToolShortcutTarget(child)).toBe(false);
        expect(shouldFocusWorkspaceCanvas(child, viewport)).toBe(false);
        ruler.remove();
    });
});
