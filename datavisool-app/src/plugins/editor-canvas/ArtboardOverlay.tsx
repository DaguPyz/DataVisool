/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {observer} from 'mobx-react';
import {useEditorCanvasActivation} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';
import {worldToScreen} from '@/plugins/editor-canvas/viewport/ViewportMath.ts';
import {RULER_SIZE} from './DesignerRulerMath.ts';
import './ArtboardOverlay.less';

/** The sole project canvas remains at the workspace origin. */
const ArtboardOverlay = observer(({canvasSize, nested}: {canvasSize: {width?: number; height?: number}; nested: boolean}) => {
    const {viewportStore, sceneStore} = useEditorCanvasActivation();
    sceneStore.revision;
    if (nested) return null;
    const {width, height} = canvasSize;
    if (!width || !height) return null;

    const camera = viewportStore.camera;
    const topLeft = worldToScreen({x: 0, y: 0}, camera);
    const scaledWidth = width * camera.scale;
    const scaledHeight = height * camera.scale;

    return <div className="datavisool-artboard-overlay" aria-label="工作区画板">
        <div className="datavisool-active-artboard-frame"
             style={{left: topLeft.x, top: topLeft.y, width: scaledWidth, height: scaledHeight}}/>
        <div className="datavisool-artboard-label"
             style={{left: topLeft.x, top: topLeft.y - 27 - (viewportStore.showRulers ? RULER_SIZE : 0)}}>
            <span>画板</span>
            <small>{width} × {height}</small>
        </div>
    </div>;
});

export default ArtboardOverlay;
