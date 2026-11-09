/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {reaction, type IReactionDisposer} from 'mobx';
import ScaleAction from '@/framework/core/ScaleAction.ts';
import contextMenuStore from '@/designer/event/ContextMenuStore.ts';
import eventOperateStore from '@/designer/operate-provider/EventOperateStore.ts';
import shortcutStore from '@/designer/operate-provider/hot-key/ShortcutStore.ts';
import {SHORTCUT_ACTION_IDS} from '@/designer/operate-provider/hot-key/ShortcutTypes.ts';
import {isCanvasToolShortcutTarget, shouldFocusWorkspaceCanvas} from '@/designer/operate-provider/hot-key/CanvasToolContext.ts';
import viewportStore from './ViewportStore.ts';
import {
    fitArtboard,
    visibleWorldBounds,
    zoomAtPoint,
    type ArtboardBounds,
    type ViewportInsets,
    type ViewportPoint,
} from './ViewportMath.ts';

interface ViewportControllerOptions {
    viewport: HTMLDivElement;
    artboard: HTMLDivElement;
    getArtboardBounds: () => ArtboardBounds;
}

interface PanSession {
    pointerId: number;
    button: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [data-viewport-ui]'));
};

type WheelIntent = 'native' | 'suppress' | 'blocked' | 'zoom' | 'pan';

type ScrollChainIntent = 'scroll' | 'blocked' | 'boundary';

type WheelIntentEvent = Pick<WheelEvent, 'target' | 'deltaX' | 'deltaY' | 'ctrlKey' | 'metaKey' | 'altKey'>;

const hasRoomToScroll = (element: Element, deltaX: number, deltaY: number): boolean => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const canScrollX = ['auto', 'scroll', 'overlay'].includes(style.overflowX) && element.scrollWidth > element.clientWidth;
    const canScrollY = ['auto', 'scroll', 'overlay'].includes(style.overflowY) && element.scrollHeight > element.clientHeight;
    const maxScrollX = element.scrollWidth - element.clientWidth;
    const maxScrollY = element.scrollHeight - element.clientHeight;
    const rtl = style.direction === 'rtl';

    const hasHorizontalRoom = canScrollX && deltaX !== 0 && (rtl
        ? deltaX > 0 ? element.scrollLeft < -1 : element.scrollLeft > -maxScrollX + 1
        : deltaX > 0 ? element.scrollLeft < maxScrollX - 1 : element.scrollLeft > 1);
    const hasVerticalRoom = canScrollY && deltaY !== 0 && (deltaY > 0
        ? element.scrollTop < maxScrollY - 1
        : element.scrollTop > 1);
    return hasHorizontalRoom || hasVerticalRoom;
};

const isScrollChainingBlocked = (element: Element, deltaX: number, deltaY: number): boolean => {
    const style = window.getComputedStyle(element);
    const isScrollContainer = [style.overflowX, style.overflowY].some((value) => ['auto', 'scroll', 'overlay', 'hidden'].includes(value));
    if (!isScrollContainer) return false;
    const blocksX = deltaX !== 0 && ['contain', 'none'].includes(style.overscrollBehaviorX);
    const blocksY = deltaY !== 0 && ['contain', 'none'].includes(style.overscrollBehaviorY);
    return blocksX || blocksY;
};

const getNativeScrollAxisIntent = (target: EventTarget | null, viewport: HTMLElement, deltaX: number, deltaY: number): ScrollChainIntent => {
    if (!(target instanceof Element)) return 'boundary';
    let element: Element | null = target;
    while (element && element !== viewport) {
        if (hasRoomToScroll(element, deltaX, deltaY)) return 'scroll';
        if (isScrollChainingBlocked(element, deltaX, deltaY)) return 'blocked';
        element = element.parentElement;
    }
    return 'boundary';
};

const getNativeScrollIntent = (target: EventTarget | null, viewport: HTMLElement, deltaX: number, deltaY: number): 'native' | 'blocked' | 'boundary' => {
    const horizontal = deltaX !== 0 ? getNativeScrollAxisIntent(target, viewport, deltaX, 0) : 'boundary';
    const vertical = deltaY !== 0 ? getNativeScrollAxisIntent(target, viewport, 0, deltaY) : 'boundary';
    if (horizontal === 'scroll' || vertical === 'scroll') return 'native';
    if (horizontal === 'blocked' || vertical === 'blocked') return 'blocked';
    return 'boundary';
};

export const getWheelIntent = (event: WheelIntentEvent, viewport: HTMLElement): WheelIntent => {
    if (isEditableTarget(event.target)) return 'native';
    if (event.ctrlKey || event.metaKey) return 'suppress';
    if (event.altKey) return 'zoom';
    const scrollIntent = getNativeScrollIntent(event.target, viewport, event.deltaX, event.deltaY);
    if (scrollIntent === 'native') return 'native';
    return scrollIntent === 'blocked' ? 'blocked' : 'pan';
};

export const handleWorkspaceWheel = (
    event: WheelEvent,
    viewport: HTMLDivElement,
    zoom: (factor: number, anchor: ViewportPoint) => void,
    pan: (deltaX: number, deltaY: number) => void,
    pointerInteractionActive = false,
): WheelIntent => {
    if (event.defaultPrevented) return 'native';
    const intent = getWheelIntent(event, viewport);
    if (intent === 'native') return intent;
    event.preventDefault();
    if (intent === 'suppress' || intent === 'blocked') return intent;
    // Transform gestures use the camera captured at pointerdown until they finish.
    if (pointerInteractionActive || event.buttons > 0) return 'suppress';
    if (intent === 'zoom') {
        const rect = viewport.getBoundingClientRect();
        zoom(event.deltaY > 0 ? 1 / 1.2 : 1.2, {x: event.clientX - rect.left, y: event.clientY - rect.top});
        return intent;
    }

    const lineMode = event.deltaMode === WheelEvent.DOM_DELTA_LINE;
    const pageMode = event.deltaMode === WheelEvent.DOM_DELTA_PAGE;
    const multiplierX = lineMode ? 16 : pageMode ? viewport.clientWidth : 1;
    const multiplierY = lineMode ? 16 : pageMode ? viewport.clientHeight : 1;
    pan(-event.deltaX * multiplierX, -event.deltaY * multiplierY);
    return intent;
};

/** Input adapter for the main editor. The blueprint keeps using DragScaleProvider. */
export default class ViewportController {
    private readonly viewport: HTMLDivElement;
    private readonly artboard: HTMLDivElement;
    private readonly getArtboardBounds: () => ArtboardBounds;
    private disposeReaction: IReactionDisposer;
    private disposeCursorReaction: IReactionDisposer;
    private panSession: PanSession | null = null;
    private activePointerIds = new Set<number>();
    private lastScale = 1;
    private fitFrame = 0;
    private resizeObserver: ResizeObserver | null = null;

    constructor(options: ViewportControllerOptions) {
        this.viewport = options.viewport;
        this.artboard = options.artboard;
        this.getArtboardBounds = options.getArtboardBounds;
        this.artboard.style.transformOrigin = '0 0';
        this.viewport.addEventListener('pointerdown', this.pointerDown, true);
        this.viewport.addEventListener('pointermove', this.pointerMove);
        this.viewport.addEventListener('lostpointercapture', this.lostPointerCapture);
        this.viewport.addEventListener('wheel', this.wheel, {passive: false});
        this.viewport.addEventListener('contextmenu', this.contextMenu);
        window.addEventListener('pointerup', this.pointerUp, true);
        window.addEventListener('pointercancel', this.pointerCancel, true);
        window.addEventListener('blur', this.clearPointers);
        this.resizeObserver = new ResizeObserver(() => this.paint());
        this.resizeObserver.observe(this.viewport);
        this.disposeReaction = reaction(
            () => [viewportStore.translationX, viewportStore.translationY, viewportStore.scale] as const,
            () => this.paint(),
            {fireImmediately: true},
        );
        this.disposeCursorReaction = reaction(
            () => [
                viewportStore.toolMode,
                shortcutStore.pressedStateVersion,
                contextMenuStore.canvasMenuVisible,
                contextMenuStore.bpMenuVisible,
            ] as const,
            () => this.updateToolCursor(),
            {fireImmediately: true},
        );
        viewportStore.attachControl(this);
        this.reset();
    }

    destroy() {
        cancelAnimationFrame(this.fitFrame);
        this.disposeReaction();
        this.disposeCursorReaction();
        this.resizeObserver?.disconnect();
        this.viewport.removeEventListener('pointerdown', this.pointerDown, true);
        this.viewport.removeEventListener('pointermove', this.pointerMove);
        this.viewport.removeEventListener('lostpointercapture', this.lostPointerCapture);
        this.viewport.removeEventListener('wheel', this.wheel);
        this.viewport.removeEventListener('contextmenu', this.contextMenu);
        window.removeEventListener('pointerup', this.pointerUp, true);
        window.removeEventListener('pointercancel', this.pointerCancel, true);
        window.removeEventListener('blur', this.clearPointers);
        this.clearPointers();
        viewportStore.attachControl(null);
    }

    refresh() {
        this.paint();
    }

    private paint() {
        const {translationX, translationY, scale} = viewportStore;
        const artboard = this.getArtboardBounds();
        this.artboard.style.transform = `translate3d(${translationX + artboard.x * scale}px, ${translationY + artboard.y * scale}px, 0) scale(${scale})`;
        const gridSize = Math.max(8, 24 * scale);
        this.viewport.style.setProperty('--datavisool-workspace-grid-size', `${gridSize}px`);
        this.viewport.style.setProperty('--datavisool-workspace-grid-x', `${translationX % gridSize}px`);
        this.viewport.style.setProperty('--datavisool-workspace-grid-y', `${translationY % gridSize}px`);
        this.viewport.style.setProperty('--datavisool-workspace-grid-opacity', scale < 0.25 ? '0.035' : '0.08');
        if (scale !== this.lastScale) {
            eventOperateStore.setRatio(scale / this.lastScale);
            eventOperateStore.setScale(scale);
            ScaleAction.doScale(scale, scale);
            this.lastScale = scale;
        }
        eventOperateStore.interactionRef?.refreshOverlay?.();
    }

    private updateToolCursor() {
        const activeTarget = document.activeElement === document.body
            ? contextMenuStore.pointerTarget
            : document.activeElement;
        const temporaryHandActive = !contextMenuStore.canvasMenuVisible
            && !contextMenuStore.bpMenuVisible
            && isCanvasToolShortcutTarget(activeTarget)
            && activeTarget instanceof Node
            && this.viewport.contains(activeTarget)
            && shortcutStore.isActiveWithExactModifiers(SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND);
        this.viewport.classList.toggle('datavisool-workspace-hand', viewportStore.toolMode === 'hand' || temporaryHandActive);
    }

    private center(): ViewportPoint {
        return {x: this.viewport.clientWidth / 2, y: this.viewport.clientHeight / 2};
    }

    zoomBy(factor: number, anchor?: ViewportPoint) {
        if (!Number.isFinite(factor) || factor <= 0) return;
        this.setScale(viewportStore.scale * factor, anchor);
    }

    setScale(scale: number, anchor = this.center()) {
        viewportStore.setCamera(zoomAtPoint(viewportStore.camera, anchor, scale));
    }

    centerOn(point: ViewportPoint) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        const center = this.center();
        viewportStore.setCamera({
            translationX: center.x - point.x * viewportStore.scale,
            translationY: center.y - point.y * viewportStore.scale,
            scale: viewportStore.scale,
        });
    }

    private getInsets(): ViewportInsets {
        const viewportRect = this.viewport.getBoundingClientRect();
        const insets: ViewportInsets = {left: 0, top: 76, right: 0, bottom: 72};
        document.querySelectorAll<HTMLElement>('[data-workspace-occlusion]').forEach((panel) => {
            const rect = panel.getBoundingClientRect();
            if (!rect.width || !rect.height || rect.bottom <= viewportRect.top || rect.top >= viewportRect.bottom) return;
            if (panel.dataset.workspaceOcclusion === 'left') {
                insets.left = Math.max(insets.left, Math.max(0, rect.right - viewportRect.left + 16));
            } else if (panel.dataset.workspaceOcclusion === 'right') {
                insets.right = Math.max(insets.right, Math.max(0, viewportRect.right - rect.left + 16));
            }
        });
        return insets;
    }

    fitArtboard() {
        const bounds = this.getArtboardBounds();
        viewportStore.setCamera(fitArtboard(
            {width: this.viewport.clientWidth, height: this.viewport.clientHeight},
            bounds,
            this.getInsets(),
        ));
    }

    reset() {
        // Let React commit scene/panel updates between frames before measuring their final layout.
        cancelAnimationFrame(this.fitFrame);
        this.fitFrame = requestAnimationFrame(() => {
            this.fitFrame = requestAnimationFrame(() => {
                this.fitFrame = 0;
                this.fitArtboard();
            });
        });
    }

    getVisibleWorldBounds(): ArtboardBounds {
        return visibleWorldBounds(viewportStore.camera, {
            width: this.viewport.clientWidth,
            height: this.viewport.clientHeight,
        });
    }

    private pointerDown = (event: PointerEvent) => {
        this.activePointerIds.add(event.pointerId);
        const isCanvasToolTarget = isCanvasToolShortcutTarget(event.target)
            && event.target instanceof Node
            && this.viewport.contains(event.target);
        if (isCanvasToolTarget && event.target)
            contextMenuStore.setPointerTarget(event.target);
        if (isCanvasToolTarget && shouldFocusWorkspaceCanvas(event.target, this.viewport))
            this.viewport.focus({preventScroll: true});
        this.updateToolCursor();
        if (this.panSession || isEditableTarget(event.target)) return;
        const temporaryHandActive = isCanvasToolTarget
            && !contextMenuStore.canvasMenuVisible
            && !contextMenuStore.bpMenuVisible
            && shortcutStore.isActiveWithExactModifiers(SHORTCUT_ACTION_IDS.CANVAS_TOOL_TEMPORARY_HAND, event);
        const shouldPan = event.button === 1 || event.button === 2 ||
            (event.button === 0 && isCanvasToolTarget && (viewportStore.toolMode === 'hand' || temporaryHandActive));
        if (!shouldPan) return;
        if (event.button === 2) contextMenuStore.beginRightDrag();
        event.preventDefault();
        if (event.button !== 2) event.stopPropagation();
        this.panSession = {
            pointerId: event.pointerId,
            button: event.button,
            startX: event.clientX,
            startY: event.clientY,
            originX: viewportStore.translationX,
            originY: viewportStore.translationY,
            moved: false,
        };
        this.viewport.setPointerCapture(event.pointerId);
        this.viewport.classList.add('datavisool-workspace-panning');
    };

    private pointerMove = (event: PointerEvent) => {
        const session = this.panSession;
        if (!session || session.pointerId !== event.pointerId) return;
        const buttonMask = session.button === 0 ? 1 : session.button === 1 ? 4 : 2;
        if (event.type === 'pointermove' && (event.buttons & buttonMask) === 0) {
            this.finishPan(event, true);
            return;
        }
        const dx = event.clientX - session.startX;
        const dy = event.clientY - session.startY;
        if (!session.moved && dx * dx + dy * dy >= 16) {
            session.moved = true;
            if (session.button === 2) contextMenuStore.startRightDrag();
        }
        if (!session.moved) return;
        event.preventDefault();
        viewportStore.setCamera({
            translationX: session.originX + dx,
            translationY: session.originY + dy,
            scale: viewportStore.scale,
        });
    };

    private finishPan(event?: PointerEvent, cancelled = false) {
        const session = this.panSession;
        if (!session || (event && session.pointerId !== event.pointerId)) return;
        // Cancellation events can carry unrelated or zero coordinates; keep the last painted camera.
        if (event && !cancelled) this.pointerMove(event);
        this.panSession = null;
        this.activePointerIds.delete(session.pointerId);
        if (this.viewport.hasPointerCapture(session.pointerId)) this.viewport.releasePointerCapture(session.pointerId);
        this.viewport.classList.remove('datavisool-workspace-panning');
        if (session.button === 2) contextMenuStore.endRightDrag(cancelled || session.moved);
    }

    private pointerUp = (event: PointerEvent) => {
        this.activePointerIds.delete(event.pointerId);
        this.finishPan(event);
    };
    private pointerCancel = (event: PointerEvent) => {
        this.activePointerIds.delete(event.pointerId);
        this.finishPan(event, true);
    };
    private lostPointerCapture = (event: PointerEvent) => this.finishPan(event, true);
    private contextMenu = (event: MouseEvent) => event.preventDefault();
    private clearPointers = () => {
        this.activePointerIds.clear();
        this.finishPan(undefined, true);
    };

    private wheel = (event: WheelEvent) => {
        handleWorkspaceWheel(event, this.viewport, (factor, anchor) => this.zoomBy(factor, anchor),
            (deltaX, deltaY) => viewportStore.panBy(deltaX, deltaY), this.activePointerIds.size > 0);
    };

}
