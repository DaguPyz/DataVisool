/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
const excludedCanvasToolTargets = [
    'input',
    'textarea',
    'select',
    'button',
    'a',
    '[role="button"]',
    '[role="menuitem"]',
    '[role="textbox"]',
    '[contenteditable]:not([contenteditable="false"])',
    '[data-viewport-ui]',
    '[data-workspace-toolbar]',
    '.workspace-toolbar',
    '.blue-print-canvas',
].join(', ');

export const isCanvasToolShortcutTarget = (target: EventTarget | null): target is Element => {
    if (!(target instanceof Element) || !target.closest('.datavisool-ruler-content'))
        return false;
    return !target.closest(excludedCanvasToolTargets);
};

export const shouldFocusWorkspaceCanvas = (
    target: EventTarget | null,
    viewport: HTMLElement,
): boolean => target instanceof Node
    && viewport.contains(target)
    && isCanvasToolShortcutTarget(target);
