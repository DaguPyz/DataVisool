/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {getRulerStep, RULER_FONT, RULER_SIZE} from './DesignerRulerMath.ts';

export type RulerSide = 'top' | 'bottom' | 'left' | 'right';

export const drawArtboardRuler = (
    canvas: HTMLCanvasElement,
    side: RulerSide,
    length: number,
    scale: number,
    worldStart: number,
    worldEnd: number,
) => {
    const context = canvas.getContext('2d');
    if (!context || length <= 0 || scale <= 0) return;

    const horizontal = side === 'top' || side === 'bottom';
    const width = horizontal ? length : RULER_SIZE;
    const height = horizontal ? RULER_SIZE : length;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.ceil(width * pixelRatio));
    canvas.height = Math.max(1, Math.ceil(height * pixelRatio));
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    context.fillStyle = '#081025';
    context.fillRect(0, 0, width, height);
    context.font = RULER_FONT;
    context.textBaseline = 'middle';
    context.fillStyle = '#8794b8';
    context.strokeStyle = 'rgba(113,139,210,.5)';
    context.lineWidth = 1;

    const step = getRulerStep(scale);
    const minorStep = step / 2;
    const firstTick = Math.max(0, Math.ceil(worldStart / minorStep - 1e-9));
    const lastTick = Math.floor(worldEnd / minorStep + 1e-9);
    let lastLabelEnd = -Infinity;
    for (let index = firstTick; index <= lastTick; index++) {
        const value = index * minorStep;
        const position = (value - worldStart) * scale;
        if (position > length + 0.5) break;
        const major = index % 2 === 0;
        const tickLength = major ? 8 : 4;
        const edge = side === 'top' || side === 'left' ? RULER_SIZE : 0;
        const start = edge + (edge ? -tickLength : tickLength);
        context.beginPath();
        if (horizontal) {
            context.moveTo(position + 0.5, edge);
            context.lineTo(position + 0.5, start);
        } else {
            context.moveTo(edge, position + 0.5);
            context.lineTo(start, position + 0.5);
        }
        context.stroke();
        if (!major) continue;

        const label = String(value);
        const labelWidth = context.measureText(label).width;
        const labelStart = position + 3;
        if (labelStart < lastLabelEnd + 4 || labelStart + labelWidth > length) continue;
        if (horizontal) {
            context.fillText(label, labelStart, side === 'top' ? 7 : 13);
        } else {
            context.save();
            context.translate(side === 'left' ? 8 : 12, labelStart);
            context.rotate(Math.PI / 2);
            context.fillText(label, 0, 0);
            context.restore();
        }
        lastLabelEnd = labelStart + labelWidth;
    }
};
