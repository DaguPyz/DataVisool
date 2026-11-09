/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {lazy, memo, Suspense} from 'react';
import {observer} from "mobx-react";
import rightStore from "@/designer/right/RightStore";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {hotkeyConfigs} from "@/designer/operate-provider/hot-key/HotKeyConfig";
import LayerUtil from "@/designer/left/layer-list/util/LayerUtil";
import {Loading} from "@datavisool/ui";
import SearchLayer from "@/designer/left/layer-list/search-layer/SearchLayer.tsx";
import canvasRender from "@/designer/left/layer-list/CanvasRender.ts";
import managerStore from "@/designer/manager/ManagerStore.ts";
import DesignerInteractionEngine from "@/designer/operate-provider/interaction/DesignerInteractionEngine.tsx";
import AiLayerDraftCanvas from "@/designer/canvas/AiLayerDraftCanvas.tsx";
import ArtboardOverlay from "@/designer/workspace/artboard/ArtboardOverlay.tsx";

const DesignerRuler = lazy(() => import('@/designer/canvas/DesignerRuler'));
const ContextMenu = lazy(() => import('@/designer/operate-provider/canvas-context-menu/CanvasContextMenu.tsx'));
const HotKey = lazy(() => import('@/designer/operate-provider/hot-key/HotKey'));
const DesignerDragScaleContainer = lazy(() => import('@/designer/canvas/DesignerDragScaleContainer'));


const DesignerCanvas = memo(observer(() => {

    const updateActive = (e: React.MouseEvent) => {
        let {targetIds} = eventOperateStore;
        const {activeElem, activeConfig} = rightStore;
        if (targetIds.length === 0) {
            activeConfig(null, "");
            return;
        }
        // 如果没有按下shift键，则进行分组场景下的计算，反之则直接选中激活组件配置
        if (!e.shiftKey)
            targetIds = LayerUtil.findTopGroupLayer(targetIds, true);
        if (targetIds.length !== 1) return;
        const layerId = targetIds[0];
        const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager!;
        const layer = layerConfigs[layerId];
        if (!layer)
            return;
        if (layerId === activeElem.id) {
            if (!rightStore.panelOpen)
                rightStore.setContentVisible(true);
            return;
        }
        activeConfig(layerId, layer.type!);
    }

    return (
        <Suspense fallback={<Loading/>}>
            <div style={{outline: 'none'}} className={'datavisool-event-container'}>
                <DesignerRuler>
                    <DesignerDragScaleContainer onDoubleClick={updateActive}>
                        <DesignerInteractionEngine>
                            {canvasRender.buildCanvasComponents(managerStore.currentManager!)}
                            <AiLayerDraftCanvas/>
                        </DesignerInteractionEngine>
                    </DesignerDragScaleContainer>
                </DesignerRuler>
                <ArtboardOverlay/>
            </div>
            <ContextMenu/>
            <HotKey handlerMapping={hotkeyConfigs}/>
            <SearchLayer/>
        </Suspense>
    );
}))


export default DesignerCanvas;
