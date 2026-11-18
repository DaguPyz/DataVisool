/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {LayerBox, SelectedLayerOutlineStyle} from '../core/types';
import type {ResizeHandle} from '../core/ResizeController';

const HANDLES: ResizeHandle[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
const HANDLE_ATTR = 'data-datavisool-resize-handle';
const ROTATE_HANDLE_ATTR = 'data-datavisool-rotate-handle';

export interface ResizeOverlayRenderOptions {
    showResizeHandles?: boolean;
    showRotateHandle?: boolean;
    outlineStyle?: SelectedLayerOutlineStyle;
}

export class ResizeOverlay {
    private readonly element: HTMLElement;

    private container: HTMLElement | null = null;

    private outlineStyleKey = '';

    constructor(element = document.createElement('div')) {
        this.element = element;
        this.element.className = 'datavisool-interaction-resize-box';
        this.element.style.position = 'absolute';
        this.element.style.pointerEvents = 'none';
        this.element.style.display = 'none';
        this.element.style.boxSizing = 'border-box';
        this.element.style.zIndex = '10002';

        for (const handle of HANDLES) {
            const handleElement = document.createElement('div');
            handleElement.className = `datavisool-interaction-resize-handle datavisool-interaction-resize-handle--${handle}`;
            handleElement.setAttribute(HANDLE_ATTR, handle);
            handleElement.style.position = 'absolute';
            handleElement.style.pointerEvents = 'auto';
            this.element.append(handleElement);
        }

        const rotateHandle = document.createElement('div');
        rotateHandle.className = 'datavisool-interaction-rotate-handle';
        rotateHandle.setAttribute(ROTATE_HANDLE_ATTR, 'true');
        rotateHandle.style.position = 'absolute';
        rotateHandle.style.pointerEvents = 'auto';
        this.element.append(rotateHandle);
    }

    attach(container: HTMLElement) {
        if (this.container === container && this.element.parentElement === container) {
            return;
        }

        this.detach();
        this.container = container;
        container.append(this.element);
    }

    getElement() {
        return this.element;
    }

    render(layer: LayerBox, options: ResizeOverlayRenderOptions = {}) {
        const showResizeHandles = options.showResizeHandles ?? true;
        const showRotateHandle = options.showRotateHandle ?? true;
        this.element.style.display = 'block';
        this.element.style.transform = `translate(${formatNumber(layer.x)}px, ${formatNumber(layer.y)}px) rotate(${formatNumber(layer.rotate)}deg)`;
        this.element.style.width = `${formatNumber(layer.width)}px`;
        this.element.style.height = `${formatNumber(layer.height)}px`;
        this.applyOutlineStyle(options.outlineStyle);

        for (const handle of this.element.querySelectorAll<HTMLElement>(`[${HANDLE_ATTR}]`)) {
            handle.style.display = showResizeHandles ? 'block' : 'none';
        }

        const rotateHandle = this.element.querySelector<HTMLElement>(`[${ROTATE_HANDLE_ATTR}]`);

        if (rotateHandle) {
            rotateHandle.style.display = showRotateHandle ? 'block' : 'none';
        }
    }

    hide() {
        this.element.style.display = 'none';
    }

    detach() {
        this.element.remove();
        this.container = null;
    }

    private applyOutlineStyle(style: SelectedLayerOutlineStyle | undefined) {
        const color = style?.color ?? '';
        const width = formatCssLength(style?.width);
        const radius = formatCssLength(style?.radius);
        const nextKey = `${color}\n${width}\n${radius}`;

        if (nextKey === this.outlineStyleKey) {
            return;
        }

        this.outlineStyleKey = nextKey;
        this.element.style.borderColor = color;
        this.element.style.borderWidth = width;
        this.element.style.borderRadius = radius;
        this.element.style.borderStyle = color || width ? 'solid' : '';
    }
}

export function getResizeHandleFromEventTarget(target: EventTarget | null): ResizeHandle | null {
    if (!(target instanceof Element)) {
        return null;
    }

    const element = target.closest(`[${HANDLE_ATTR}]`);
    const handle = element?.getAttribute(HANDLE_ATTR);

    return isResizeHandle(handle) ? handle : null;
}

export function isRotateHandleEventTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return false;
    }

    return Boolean(target.closest(`[${ROTATE_HANDLE_ATTR}]`));
}

function isResizeHandle(value: string | null | undefined): value is ResizeHandle {
    return value === 'n'
        || value === 'e'
        || value === 's'
        || value === 'w'
        || value === 'ne'
        || value === 'nw'
        || value === 'se'
        || value === 'sw';
}

function formatNumber(value: number) {
    if (Number.isInteger(value)) {
        return String(value);
    }

    return String(Number(value.toFixed(3)));
}

function formatCssLength(value: SelectedLayerOutlineStyle['width']) {
    if (value === undefined) {
        return '';
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? `${Math.max(0, value)}px` : '';
    }

    return value.trim();
}
