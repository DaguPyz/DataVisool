/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect, useMemo, useRef} from 'react';
import {CircuitBackgroundOptions, createCircuitBackground} from "@/util/circuitBackground";

type Props = {
    className?: string;
    options?: Partial<CircuitBackgroundOptions>;
};

export default function CircuitBackground({className, options}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const merged = useMemo<CircuitBackgroundOptions>(() => ({
        hexRadius: 42,
        lineHexRadius: 8,
        gridColor: 'rgba(20, 40, 60, 0.22)',
        lineColors: ['#00d4ff', '#4d9fff', '#1a5fb4', '#0077be', '#00ffcc', '#00ff9d', '#bc13fe', '#8a2be2', '#ff0055', '#ff00e6', '#ffffff'],
        spawnIntervalMs: 900,
        spawnCountMin: 2,
        spawnCountMax: 5,
        speedMin: 0.25,
        speedMax: 1.35,
        maxAgeMin: 220,
        maxAgeMax: 580,
        targetLengthMin: 40,
        targetLengthMax: 260,
        boundsMargin: 60,
        centerHexScale: 0.6,
        centerHexStroke: '#1d8cf8',
        lineWidth: 1.6,
        headHaloRadius: 8,
        headHaloAlpha: 0.25,
        headCoreRadius: 2.4,
        headCoreColor: '#00e5ff',
        gridBreathSpeed: 0.002,
        gridBreathAlphaBase: 0.02,
        gridBreathAlphaAmp: 0.06,
        gridBreathRgb: [79, 184, 255],
        ...options
    }), [options]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctrl = createCircuitBackground(canvas, () => {
            const rect = container.getBoundingClientRect();
            return {width: rect.width, height: rect.height};
        }, merged);

        const ro = new ResizeObserver(() => ctrl.resize());
        ro.observe(container);
        return () => {
            ro.disconnect();
            ctrl.stop();
        };
    }, [merged]);

    return (
        <div ref={containerRef} style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
            <canvas ref={canvasRef} className={className}/>
        </div>
    );
}
