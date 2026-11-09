/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type DragScaleProvider from '@/framework/drag-scale/DragScaleProvider';
import type BluePrintManager from '../manager/BluePrintManager';

interface Bounds { x: number; y: number; width: number; height: number }

/** Runtime-only bridge: all toolbar changes flow through the same provider as mouse gestures. */
export default class BPViewportController {
    constructor(
        private readonly viewport: HTMLElement,
        private readonly provider: DragScaleProvider,
        private readonly manager: BluePrintManager,
    ) {}

    zoomBy = (factor: number) => {
        if (Number.isFinite(factor) && factor > 0)
            this.setScale(this.manager.canvasScale * factor);
    };

    setScale = (scale: number) => {
        if (!Number.isFinite(scale) || scale <= 0) return;
        const area = this.getVisibleBounds();
        // Narrow windows may have overlapping panels; zoom must still work around the canvas center.
        this.provider.zoomTo(scale, area ? {x: area.x + area.width / 2, y: area.y + area.height / 2} : undefined);
    };

    fitAll = () => {
        const area = this.getVisibleBounds();
        const layouts = this.manager.currentPageManager?.bpNodeLayoutMap;
        if (!area || !layouts) return;
        if (Object.keys(layouts).length === 0) {
            this.provider.setViewport(1, {x: 0, y: 0});
            return;
        }

        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        this.viewport.querySelectorAll<HTMLElement>('.bp-node-container[data-nid]').forEach(node => {
            const layout = layouts[node.dataset.nid!];
            if (!layout || node.offsetWidth <= 0 || node.offsetHeight <= 0) return;
            const x = layout.position?.x ?? 0, y = layout.position?.y ?? 0;
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + node.offsetWidth);
            bottom = Math.max(bottom, y + node.offsetHeight);
        });
        if (!Number.isFinite(left) || right <= left || bottom <= top) return;
        const scale = Math.max(this.provider.scaleCore.min,
            Math.min(1, area.width / (right - left), area.height / (bottom - top)));
        this.provider.setViewport(scale, {
            x: area.x + area.width / 2 - (left + right) / 2 * scale,
            y: area.y + area.height / 2 - (top + bottom) / 2 * scale,
        });
    };

    /** Conservative usable rectangle, with space around visible floating controls. */
    getVisibleBounds = (): Bounds | null => {
        const viewport = this.viewport.getBoundingClientRect();
        if (viewport.width <= 0 || viewport.height <= 0) return null;
        const margin = 24;
        const shell = this.viewport.closest('.bp-workspace-shell');
        let left = margin, top = margin;
        let right = viewport.width - margin, bottom = viewport.height - margin;
        const visibleRect = (element: Element) => {
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' ||
                element.closest('[hidden], [aria-hidden="true"]')) return null;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.right > viewport.left &&
                rect.left < viewport.right && rect.bottom > viewport.top && rect.top < viewport.bottom ? rect : null;
        };
        shell?.querySelectorAll('.bp-node-sort-list, .bp-node-list').forEach(element => {
            const rect = visibleRect(element);
            if (rect) left = Math.max(left, rect.right - viewport.left + margin);
        });
        shell?.querySelectorAll('.bp-workspace-right').forEach(element => {
            const rect = visibleRect(element);
            if (rect) right = Math.min(right, rect.left - viewport.left - margin);
        });
        shell?.querySelectorAll('.bp-workspace-header').forEach(element => {
            const rect = visibleRect(element);
            if (rect) top = Math.max(top, rect.bottom - viewport.top + margin);
        });
        shell?.querySelectorAll('.bp-workspace-footer').forEach(element => {
            const rect = visibleRect(element);
            if (rect) bottom = Math.min(bottom, rect.top - viewport.top - margin);
        });
        if (right <= left || bottom <= top) return null;
        return {x: left, y: top, width: right - left, height: bottom - top};
    };
}
