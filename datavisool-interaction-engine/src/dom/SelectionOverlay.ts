/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {BoxSelectionMode, Rect} from '../core/types';

const MODE_CLASS_PREFIX = 'datavisool-interaction-selection-box--';

export class SelectionOverlay {
    private readonly element: HTMLElement;

    private container: HTMLElement | null = null;

    constructor(element = document.createElement('div')) {
        this.element = element;
        this.element.className = 'datavisool-interaction-selection-box';
        this.element.style.position = 'absolute';
        this.element.style.pointerEvents = 'none';
        this.element.style.display = 'none';
        this.element.style.boxSizing = 'border-box';
    }

    attach(container: HTMLElement) {
        if (this.container === container && this.element.parentElement === container) {
            return;
        }

        this.detach();
        this.container = container;
        container.append(this.element);
    }

    setMode(mode: BoxSelectionMode) {
        this.element.dataset.selectionMode = mode;
        this.element.classList.toggle(`${MODE_CLASS_PREFIX}intersect`, mode === 'intersect');
        this.element.classList.toggle(`${MODE_CLASS_PREFIX}contain`, mode === 'contain');
    }

    render(rect: Rect, mode: BoxSelectionMode = 'intersect') {
        this.setMode(mode);
        this.element.style.display = 'block';
        this.element.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
        this.element.style.width = `${rect.width}px`;
        this.element.style.height = `${rect.height}px`;
    }

    hide() {
        this.element.style.display = 'none';
    }

    detach() {
        this.element.remove();
        this.container = null;
    }
}
