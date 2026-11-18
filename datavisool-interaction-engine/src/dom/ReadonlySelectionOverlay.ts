/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {LayerBox} from '../core/types';

export class ReadonlySelectionOverlay {
    private readonly elements = new Map<string, HTMLElement>();

    private container: HTMLElement | null = null;

    attach(container: HTMLElement) {
        if (this.container === container) {
            return;
        }

        this.detach();
        this.container = container;

        for (const element of this.elements.values()) {
            container.append(element);
        }
    }

    render(layers: readonly LayerBox[]) {
        const activeIds = new Set<string>();

        for (const layer of layers) {
            activeIds.add(layer.id);
            const element = this.resolveElement(layer.id);
            element.style.display = 'block';
            element.style.transform = `translate(${formatNumber(layer.x)}px, ${formatNumber(layer.y)}px) rotate(${formatNumber(layer.rotate)}deg)`;
            element.style.width = `${formatNumber(layer.width)}px`;
            element.style.height = `${formatNumber(layer.height)}px`;
        }

        for (const [id, element] of this.elements) {
            if (activeIds.has(id)) {
                continue;
            }

            element.remove();
            this.elements.delete(id);
        }
    }

    hide() {
        for (const element of this.elements.values()) {
            element.style.display = 'none';
        }
    }

    detach() {
        for (const element of this.elements.values()) {
            element.remove();
        }

        this.container = null;
    }

    private resolveElement(id: string) {
        const existing = this.elements.get(id);

        if (existing) {
            return existing;
        }

        const element = document.createElement('div');
        element.className = 'datavisool-interaction-readonly-box';
        element.dataset.layerId = id;
        element.style.position = 'absolute';
        element.style.pointerEvents = 'none';
        element.style.boxSizing = 'border-box';
        element.style.zIndex = '10001';
        this.elements.set(id, element);
        this.container?.append(element);
        return element;
    }
}

function formatNumber(value: number) {
    if (Number.isInteger(value)) {
        return String(value);
    }

    return String(Number(value.toFixed(3)));
}
