/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
/**
 * A full-size viewport can sit behind panels and body portals. A rectangle check
 * alone therefore cannot decide whether a drop or anchor gesture reaches it.
 * elementFromPoint respects stacking order and ignores pointer-events:none
 * decorations (including the node library's drag preview).
 */
export function isBPCanvasPointAvailable(
    clientX: number,
    clientY: number,
    viewport: HTMLElement | null = document.querySelector('.blue-print-canvas'),
): boolean {
    if (!viewport?.isConnected || !Number.isFinite(clientX) || !Number.isFinite(clientY))
        return false;

    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0
        || clientX < rect.left || clientX >= rect.right
        || clientY < rect.top || clientY >= rect.bottom)
        return false;

    const topElement = viewport.ownerDocument.elementFromPoint(clientX, clientY);
    return Boolean(topElement && viewport.contains(topElement) && !topElement.closest('[data-bp-ui]'));
}
