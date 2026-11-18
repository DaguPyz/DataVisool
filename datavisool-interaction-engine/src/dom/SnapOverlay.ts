/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {SnapGuide} from '../core/SnapEngine';

export interface SnapOverlayOptions {
    guideColor?: string;
}

export class SnapOverlay {
    private readonly elements: HTMLElement[] = [];

    private container: HTMLElement | null = null;

    private guideColor: string;

    constructor(options: SnapOverlayOptions = {}) {
        this.guideColor = normalizeGuideColor(options.guideColor);
    }

    attach(container: HTMLElement) {
        if (this.container === container) {
            return;
        }

        this.detach();
        this.container = container;
    }

    setGuideColor(color: string | undefined) {
        this.guideColor = normalizeGuideColor(color);
    }

    render(guides: SnapGuide[]) {
        if (!this.container) {
            return;
        }

        for (let index = 0; index < guides.length; index += 1) {
            const guide = guides[index];
            const element = this.getElement(index);
            const label = this.getLabel(element);
            const segmentSize = Math.max(1, guide.segmentEnd - guide.segmentStart);
            const labelText = formatDistance(guide.segmentDistance);
            element.style.display = 'block';
            element.style.borderColor = this.guideColor;
            label.textContent = labelText;
            label.style.display = labelText ? 'block' : 'none';
            label.style.color = this.guideColor;

            if (guide.axis === 'x') {
                element.className = 'datavisool-interaction-snap-guide datavisool-interaction-snap-guide--x';
                element.style.transform = guide.fullSpan
                    ? `translate(${guide.value}px, 0px)`
                    : `translate(${guide.value}px, ${guide.segmentStart}px)`;
                element.style.width = '0';
                element.style.height = guide.fullSpan ? '100%' : `${segmentSize}px`;
                label.style.left = '0';
                label.style.top = '50%';
                label.style.transform = 'translate(6px, -50%)';
            } else {
                element.className = 'datavisool-interaction-snap-guide datavisool-interaction-snap-guide--y';
                element.style.transform = guide.fullSpan
                    ? `translate(0px, ${guide.value}px)`
                    : `translate(${guide.segmentStart}px, ${guide.value}px)`;
                element.style.width = guide.fullSpan ? '100%' : `${segmentSize}px`;
                element.style.height = '0';
                label.style.left = '50%';
                label.style.top = '0';
                label.style.transform = 'translate(-50%, calc(-100% - 6px))';
            }
        }

        for (let index = guides.length; index < this.elements.length; index += 1) {
            this.elements[index].style.display = 'none';
        }
    }

    hide() {
        for (const element of this.elements) {
            element.style.display = 'none';
        }
    }

    detach() {
        for (const element of this.elements) {
            element.remove();
        }

        this.elements.length = 0;
        this.container = null;
    }

    private getElement(index: number) {
        const current = this.elements[index];

        if (current) {
            return current;
        }

        const element = document.createElement('div');
        element.style.position = 'absolute';
        element.style.top = '0';
        element.style.left = '0';
        element.style.pointerEvents = 'none';
        element.style.display = 'none';
        element.style.boxSizing = 'border-box';
        element.style.zIndex = '10001';

        const label = document.createElement('span');
        label.className = 'datavisool-interaction-snap-guide__label';
        label.style.position = 'absolute';
        label.style.pointerEvents = 'none';
        element.append(label);

        this.elements[index] = element;
        this.container?.append(element);

        return element;
    }

    private getLabel(element: HTMLElement) {
        return element.firstElementChild as HTMLElement;
    }
}

function formatDistance(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
        return '';
    }

    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function normalizeGuideColor(color: string | undefined) {
    return color && color.trim() ? color : '#5087f6';
}
