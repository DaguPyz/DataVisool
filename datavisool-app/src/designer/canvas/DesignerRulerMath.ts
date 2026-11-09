/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
export const RULER_SIZE = 20;
export const RULER_FONT = '10px sans-serif';

/** Choose readable world-unit intervals while the spacing stays in screen pixels. */
export const getRulerStep = (scale: number): number => {
    const minimum = 50 / scale;
    const magnitude = 10 ** Math.floor(Math.log10(minimum));
    return [1, 2, 5, 10].map(multiplier => multiplier * magnitude)
        .find(step => step >= minimum)!;
};

/** Restrict the backing canvas to the visible editor area. */
export const getVisibleRulerSpan = (position: number, length: number, viewportLength: number) => {
    const offset = Math.max(0, -position);
    const end = Math.min(length, viewportLength - position);
    return {position: position + offset, offset, length: Math.max(0, end - offset)};
};
