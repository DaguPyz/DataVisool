/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {observer} from 'mobx-react';
import managerStore from '@/designer/manager/ManagerStore.ts';
import viewportStore from '@/designer/workspace/viewport/ViewportStore.ts';
import {worldToScreen} from '@/designer/workspace/viewport/ViewportMath.ts';
import ArtboardRulerCanvas from './ArtboardRulerCanvas.tsx';
import {getVisibleRulerSpan, RULER_SIZE} from './DesignerRulerMath.ts';
import './DesignerRuler.less';

const DesignerRuler = observer(({children}: {children?: ReactNode}) => {
    const overlayRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({width: 0, height: 0});
    const {camera, showRulers} = viewportStore;
    const config = managerStore.currentManager?.canvasManager?.canvasConfig;
    const worldWidth = config?.width ?? 0;
    const worldHeight = config?.height ?? 0;
    const origin = worldToScreen({x: 0, y: 0}, camera);
    const width = worldWidth * camera.scale;
    const height = worldHeight * camera.scale;
    const hasRulers = showRulers && width > 0 && height > 0;
    const visibleWidth = viewport.width || window.innerWidth;
    const visibleHeight = viewport.height || window.innerHeight;
    const horizontal = getVisibleRulerSpan(origin.x, width, visibleWidth);
    const vertical = getVisibleRulerSpan(origin.y, height, visibleHeight);

    useLayoutEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;
        const update = () => {
            const width = overlay.clientWidth;
            const height = overlay.clientHeight;
            setViewport(previous => previous.width === width && previous.height === height
                ? previous : {width, height});
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(overlay);
        return () => observer.disconnect();
    }, [hasRulers]);

    return <div className="datavisool-ruler">
        <div className="datavisool-ruler-content">{children}</div>
        {hasRulers && <div ref={overlayRef} className="datavisool-ruler-overlay" aria-hidden="true">
            {horizontal.length > 0 && <>
                <ArtboardRulerCanvas side="top" length={horizontal.length} scale={camera.scale}
                                     worldStart={horizontal.offset / camera.scale} worldEnd={worldWidth}
                                     left={horizontal.position} top={origin.y - RULER_SIZE}/>
                <ArtboardRulerCanvas side="bottom" length={horizontal.length} scale={camera.scale}
                                     worldStart={horizontal.offset / camera.scale} worldEnd={worldWidth}
                                     left={horizontal.position} top={origin.y + height}/>
            </>}
            {vertical.length > 0 && <>
                <ArtboardRulerCanvas side="left" length={vertical.length} scale={camera.scale}
                                     worldStart={vertical.offset / camera.scale} worldEnd={worldHeight}
                                     left={origin.x - RULER_SIZE} top={vertical.position}/>
                <ArtboardRulerCanvas side="right" length={vertical.length} scale={camera.scale}
                                     worldStart={vertical.offset / camera.scale} worldEnd={worldHeight}
                                     left={origin.x + width} top={vertical.position}/>
            </>}
        </div>}
    </div>;
});

export default DesignerRuler;
