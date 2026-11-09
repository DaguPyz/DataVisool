/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import DesignerRender, {LayerOrder} from "./DesignerRender.ts";
import GroupLayer from "@/comps/group-layer/GroupLayer.tsx";
import ComponentContainer from "@/framework/core/ComponentContainer.tsx";
import {createElement, Fragment, ReactElement} from "react";
import {ILayerItem} from "@datavisool/sdk/types";
import DesignerManager from "@/designer/manager/DesignerManager.ts";

class CanvasRender extends DesignerRender {

    private order: number = 1;
    private warnedMessages: Set<string> = new Set();

    private warnInvalidRender = (message: string) => {
        if (this.warnedMessages.has(message))
            return;
        this.warnedMessages.add(message);
        console.warn(`[CanvasRender] ${message}`);
    }

    /**
     * 构建设计器主画布组件
     * @param designerManager
     * @param triggerSource 触发源，来源为编辑模式下触发、预览模式下触发，引用大屏组件触发。（通过大屏组件执行的渲染，渲染的组件不能被选中）
     * @param index 渲染组件索引，在循环渲染场景下使用
     */
    public buildCanvasComponents = (designerManager: DesignerManager, triggerSource?: string, index?: number): ReactElement[] => {
        this.warnedMessages.clear();
        const res: ReactElement[] = [];
        const {layerConfigs, layerHeader} = designerManager.layerManager;
        this.parser(layerConfigs, layerHeader!, LayerOrder.ASC).forEach((item: ILayerItem) => {
            res.push(this.buildComponents(item, designerManager, triggerSource, index, new Set()));
        });
        //重置排序编号
        this.order = 1;
        return res;
    }

    private buildComponents = (
        layer: ILayerItem,
        designerManager: DesignerManager,
        triggerSource?: string,
        index?: number,
        renderPath: Set<string> = new Set()
    ): ReactElement => {
        const {type, children} = layer;
        const layerId = layer.id;
        if (layerId && renderPath.has(layerId)) {
            this.warnInvalidRender(`Detected circular children tree while rendering canvas, layerId=${layerId}`);
            return createElement(Fragment, {key: `canvas-cycle-${layerId}`});
        }

        const nextRenderPath = new Set(renderPath);
        layerId && nextRenderPath.add(layerId);
        const targetLayer = designerManager.layerManager.layerConfigs[layer.id!];
        let component;
        if (type === 'group') {
            //先生成子元素再包裹groupItem
            const childDomArr: ReactElement[] = [];
            children?.forEach((item: ILayerItem) => {
                if (item?.id && nextRenderPath.has(item.id)) {
                    this.warnInvalidRender(`Skipped circular group child while rendering canvas, layerId=${item.id}`);
                    return;
                }
                childDomArr.push(this.buildComponents(item, designerManager, triggerSource, index, nextRenderPath));
            });
            component = createElement(GroupLayer, {layer, designerManager, key: layer.id, index}, ...childDomArr)
        } else {
            component = createElement(ComponentContainer, {
                index,
                layer,
                key: layer.id,
                designerManager,
                triggerSource: triggerSource
            });
        }
        //给每个图层重新设置排序编号,用于在图层移动的过程中提供更好的体验
        if (targetLayer)
            targetLayer.order = this.order++;
        return component;
    }
}

const canvasRender = new CanvasRender();
export default canvasRender;
