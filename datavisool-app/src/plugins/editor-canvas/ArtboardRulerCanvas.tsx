/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useLayoutEffect, useRef} from 'react';
import {RULER_SIZE} from './DesignerRulerMath.ts';
import {drawArtboardRuler, type RulerSide} from './ArtboardRulerDraw.ts';

interface ArtboardRulerCanvasProps {
    side: RulerSide;
    length: number;
    scale: number;
    worldStart: number;
    worldEnd: number;
    left: number;
    top: number;
}

const isHorizontal = (side: RulerSide) => side === 'top' || side === 'bottom';

export default function ArtboardRulerCanvas({side, length, scale, worldStart, worldEnd, left, top}: ArtboardRulerCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const redraw = () => drawArtboardRuler(canvas, side, length, scale, worldStart, worldEnd);
        redraw();
        window.addEventListener('resize', redraw);
        return () => window.removeEventListener('resize', redraw);
    }, [side, length, scale, worldStart, worldEnd]);

    return <canvas ref={canvasRef} className={`datavisool-artboard-ruler datavisool-artboard-ruler-${side}`}
                   data-ruler-side={side}
                   style={{left, top, width: isHorizontal(side) ? length : RULER_SIZE,
                       height: isHorizontal(side) ? RULER_SIZE : length}}/>;
}
