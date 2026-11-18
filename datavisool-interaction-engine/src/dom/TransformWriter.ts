/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {LayerBox, LayerGeometryPatch, Rect} from '../core/types';

export interface TransformEntry {
    element: HTMLElement;
    box: LayerBox;
}

export interface PreviewTransformEntry extends TransformEntry {
    previousTransform: string;
    previousTransformOrigin: string;
    previousWidth: string;
    previousHeight: string;
}

function formatNumber(value: number) {
    if (Number.isInteger(value)) {
        return String(value);
    }

    return String(Number(value.toFixed(3)));
}

function toTransform(x: number, y: number, rotate: number) {
    return `translate(${formatNumber(x)}px, ${formatNumber(y)}px) rotate(${formatNumber(rotate)}deg)`;
}

function toTransformWithScale(x: number, y: number, rotate: number, scaleX: number, scaleY: number) {
    return `${toTransform(x, y, rotate)} scale(${formatNumber(scaleX)}, ${formatNumber(scaleY)})`;
}

export class TransformWriter {
    preparePreviewElement(entry: TransformEntry): PreviewTransformEntry {
        const previewEntry: PreviewTransformEntry = {
            ...entry,
            previousTransform: entry.element.style.transform,
            previousTransformOrigin: entry.element.style.transformOrigin,
            previousWidth: entry.element.style.width,
            previousHeight: entry.element.style.height,
        };

        entry.element.style.transformOrigin = 'center center';

        return previewEntry;
    }

    restorePreviewElement(entry: PreviewTransformEntry | null | undefined) {
        if (!entry) {
            return 0;
        }

        let writeCount = 0;

        if (entry.element.style.transform !== entry.previousTransform) {
            entry.element.style.transform = entry.previousTransform;
            writeCount += 1;
        }

        if (entry.element.style.transformOrigin !== entry.previousTransformOrigin) {
            entry.element.style.transformOrigin = entry.previousTransformOrigin;
            writeCount += 1;
        }

        if (entry.element.style.width !== entry.previousWidth) {
            entry.element.style.width = entry.previousWidth;
            writeCount += 1;
        }

        if (entry.element.style.height !== entry.previousHeight) {
            entry.element.style.height = entry.previousHeight;
            writeCount += 1;
        }

        return writeCount;
    }

    writeBatchTranslate(entries: Iterable<TransformEntry>, dx: number, dy: number) {
        let writeCount = 0;

        for (const entry of entries) {
            entry.element.style.transform = toTransform(
                entry.box.x + dx,
                entry.box.y + dy,
                entry.box.rotate,
            );
            writeCount += 1;
        }

        return writeCount;
    }

    resetMany(entries: Iterable<TransformEntry>) {
        let writeCount = 0;

        for (const entry of entries) {
            entry.element.style.transform = toTransform(entry.box.x, entry.box.y, entry.box.rotate);
            writeCount += 1;
        }

        return writeCount;
    }

    writeResize(entry: TransformEntry, rect: Rect) {
        entry.element.style.transformOrigin = '';
        entry.element.style.transform = toTransform(rect.x, rect.y, entry.box.rotate);
        entry.element.style.width = `${formatNumber(rect.width)}px`;
        entry.element.style.height = `${formatNumber(rect.height)}px`;

        return 3;
    }

    writeResizePreviewGeometry(entry: TransformEntry, rect: Rect) {
        entry.element.style.transform = toTransform(rect.x, rect.y, entry.box.rotate);
        entry.element.style.width = `${formatNumber(rect.width)}px`;
        entry.element.style.height = `${formatNumber(rect.height)}px`;

        return 3;
    }

    writeResizeMany(entries: Iterable<{entry: TransformEntry; rect: Rect}>) {
        let writeCount = 0;

        for (const item of entries) {
            writeCount += this.writeResize(item.entry, item.rect);
        }

        return writeCount;
    }

    writeResizePreview(entry: TransformEntry, rect: Rect) {
        const scaleX = entry.box.width === 0 ? 1 : rect.width / entry.box.width;
        const scaleY = entry.box.height === 0 ? 1 : rect.height / entry.box.height;
        const x = rect.x + rect.width / 2 - entry.box.width / 2;
        const y = rect.y + rect.height / 2 - entry.box.height / 2;

        entry.element.style.transform = toTransformWithScale(x, y, entry.box.rotate, scaleX, scaleY);

        return 1;
    }

    writeResizePreviewMany(entries: Iterable<{entry: TransformEntry; rect: Rect}>) {
        let writeCount = 0;

        for (const item of entries) {
            writeCount += this.writeResizePreview(item.entry, item.rect);
        }

        return writeCount;
    }

    writeRotate(entry: TransformEntry, rotate: number) {
        entry.element.style.transform = toTransform(entry.box.x, entry.box.y, rotate);

        return 1;
    }

    writeTransform(entry: TransformEntry, box: Pick<LayerBox, 'x' | 'y' | 'rotate'>) {
        entry.element.style.transform = toTransform(box.x, box.y, box.rotate);

        return 1;
    }

    writeTransformMany(entries: Iterable<{entry: TransformEntry; box: Pick<LayerBox, 'x' | 'y' | 'rotate'>}>) {
        let writeCount = 0;

        for (const item of entries) {
            writeCount += this.writeTransform(item.entry, item.box);
        }

        return writeCount;
    }

    writeGeometry(entry: TransformEntry, box: LayerBox) {
        entry.element.style.transformOrigin = '';
        let writeCount = this.writeTransform(entry, box);

        entry.element.style.width = `${formatNumber(box.width)}px`;
        entry.element.style.height = `${formatNumber(box.height)}px`;
        writeCount += 2;

        return writeCount;
    }

    writeGeometryPatch(entry: TransformEntry, patch: LayerGeometryPatch) {
        return this.writeGeometry(entry, {
            ...entry.box,
            ...sanitizeGeometryPatch(patch),
        });
    }

    writeGeometryPatches(entries: Iterable<{entry: TransformEntry; patch: LayerGeometryPatch}>) {
        let writeCount = 0;

        for (const item of entries) {
            writeCount += this.writeGeometryPatch(item.entry, item.patch);
        }

        return writeCount;
    }
}

function sanitizeGeometryPatch(patch: LayerGeometryPatch) {
    const sanitized: LayerGeometryPatch = {
        id: patch.id,
    };

    if (patch.x !== undefined) {
        sanitized.x = patch.x;
    }

    if (patch.y !== undefined) {
        sanitized.y = patch.y;
    }

    if (patch.width !== undefined) {
        sanitized.width = patch.width;
    }

    if (patch.height !== undefined) {
        sanitized.height = patch.height;
    }

    if (patch.rotate !== undefined) {
        sanitized.rotate = patch.rotate;
    }

    return sanitized;
}
