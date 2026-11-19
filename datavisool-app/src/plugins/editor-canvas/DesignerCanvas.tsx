/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {lazy, memo, Suspense} from 'react';
import {observer} from "mobx-react";
import LayerUtil from "@/plugins/editor-canvas/layers/LayerUtil";
import {Loading} from "@datavisool/ui";
import type {EditorCanvasProps} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorShortcutInputQuery} from '@datavisool/sdk/plugin/contracts/editorShortcuts';
import {useEditorCanvasActivation} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';
import DesignerInteractionEngine from "@/plugins/editor-canvas/interaction/DesignerInteractionEngine.tsx";
import ArtboardOverlay from './ArtboardOverlay.tsx';
import './DesignerCanvas.less';

const DesignerRuler = lazy(() => import('./DesignerRuler.tsx'));
const ContextMenu = lazy(() => import('./context-menu/CanvasContextMenu.tsx'));
const DesignerDragScaleContainer = lazy(() => import('./DesignerDragScaleContainer.tsx'));


interface CanvasProps extends EditorCanvasProps {
    input: EditorShortcutInputQuery;
    canvas: Pick<EditorCanvasService, 'readSelection' | 'renameLayer' | 'updateBaseTextContent'>;
    onLayerDoubleClick(id: string | null): void;
}

const DesignerCanvas = memo(observer(({project, overlay, canvas, input, onLayerDoubleClick}: CanvasProps) => {
    const activation = useEditorCanvasActivation();
    activation.sceneStore.revision;
    const layerConfigs = {...activation.sceneStore.readLayerConfigs()};
    const workspace = activation.readWorkspace();
    const projectCanvas = project.renderCanvas({
        renameLayer: canvas.renameLayer,
        updateBaseTextContent: canvas.updateBaseTextContent,
        auxiliaryBorder: activation.readAuxiliaryBorder(),
    });

    const updateActive = (e: React.MouseEvent) => {
        if (!activation.canEdit()) return;
        let targetIds = [...canvas.readSelection().ids];
        if (targetIds.length === 0) {
            onLayerDoubleClick(null);
            return;
        }
        // 如果没有按下shift键，则进行分组场景下的计算，反之则直接选中激活组件配置
        if (!e.shiftKey)
            targetIds = LayerUtil.findTopGroupLayer(targetIds, true, layerConfigs);
        if (targetIds.length === 1) onLayerDoubleClick(targetIds[0]);
    }

    return (
        <Suspense fallback={<Loading/>}>
            <div style={{outline: 'none', pointerEvents: activation.canEdit() ? undefined : 'none'}} className={'datavisool-event-container'}>
                <DesignerRuler canvasSize={{width: projectCanvas.width, height: projectCanvas.height}}>
                    <DesignerDragScaleContainer
                        onDoubleClick={updateActive}
                        input={input}
                        canvasSize={{width: projectCanvas.width, height: projectCanvas.height}}
                        filterStyle={projectCanvas.filterStyle}
                        loopScene={Boolean(workspace?.loopPath?.length)}>
                        <DesignerInteractionEngine input={input}>
                            {projectCanvas.content}
                            {overlay}
                        </DesignerInteractionEngine>
                    </DesignerDragScaleContainer>
                </DesignerRuler>
                <ArtboardOverlay canvasSize={{width: projectCanvas.width, height: projectCanvas.height}} nested={Boolean(workspace?.nested)}/>
            </div>
            <ContextMenu/>
        </Suspense>
    );
}))


export default DesignerCanvas;
