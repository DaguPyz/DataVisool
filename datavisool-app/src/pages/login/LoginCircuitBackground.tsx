/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect, useRef} from 'react';
import './LoginCircuitBackground.less';
import {CircuitBackgroundOptions, createCircuitBackground} from '../../util/circuitBackground.ts';

type Props = {
    options?: Partial<CircuitBackgroundOptions>;
};

export default function LoginCircuitBackground({options}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const merged: CircuitBackgroundOptions = {
            showGrid: false,
            hexRadius: 60,
            lineHexRadius: 10,
            gridColor: 'rgba(20, 40, 60, 0.3)',
            lineColors: ['#00d4ff', '#4d9fff', '#1a5fb4', '#0077be', '#00ffcc', '#00ff9d', '#bc13fe', '#8a2be2', '#ff0055', '#ff00e6', '#ffffff'],
            spawnIntervalMs: 1000,
            spawnCountMin: 1,
            spawnCountMax: 3,
            speedMin: 0.3,
            speedMax: 1.8,
            maxAgeMin: 300,
            maxAgeMax: 780,
            targetLengthMin: 50,
            targetLengthMax: 400,
            boundsMargin: 100,
            centerHexScale: 3.5,
            centerHexStroke: '#00d4ff',
            lineWidth: 2,
            headHaloRadius: 10,
            headHaloAlpha: 0.3,
            headCoreRadius: 3,
            headCoreColor: '#00e5ff',
            gridBreathSpeed: 0.002,
            gridBreathAlphaBase: 0,
            gridBreathAlphaAmp: 0.1,
            gridBreathRgb: [79, 184, 255],
            ...options
        };

        const ctrl = createCircuitBackground(canvas, () => ({
            width: window.innerWidth,
            height: window.innerHeight
        }), merged);

        const handleResize = () => ctrl.resize();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            ctrl.stop();
        };
    }, [options]);

    return <canvas ref={canvasRef} className="datavisool-login-circuit-bg"/>;
}
