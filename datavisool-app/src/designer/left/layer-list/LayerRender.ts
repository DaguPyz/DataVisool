/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {createElement, Fragment, ReactElement} from "react";
import LayerItem from "./item/LayerItem";
import LayerGroupItem from "./item/LayerGroupItem";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import layerListStore from "./LayerListStore";
import {ILayerItem} from "@datavisool/sdk/types";
import DesignerRender, {LayerOrder} from "./DesignerRender.ts";
import type {LayerDragHandleProps} from "./item/BaseLayer.tsx";


class LayerRender extends DesignerRender {
    private warnedMessages: Set<string> = new Set();

    private warnInvalidRender = (message: string) => {
        if (this.warnedMessages.has(message))
            return;
        this.warnedMessages.add(message);
        console.warn(`[LayerRender] ${message}`);
    }

    /**
     * 构建图层组件
     */
    public buildLayerList = (
        layerMap: Record<string, ILayerItem>,
        layerHeader: string,
        dragHandleProps?: LayerDragHandleProps
    ): ReactElement[] => {
        this.warnedMessages.clear();
        const res: ReactElement[] = [];
        this.parser(layerMap, layerHeader, LayerOrder.DESC).forEach((item: ILayerItem) => {
            res.push(this.buildLayer(item, dragHandleProps, new Set()));
        });
        return res;
    }


    private buildLayer = (layer: ILayerItem, dragHandleProps?: LayerDragHandleProps, renderPath: Set<string> = new Set()): ReactElement => {
        const {type, children} = layer;
        const layerId = layer.id;
        if (layerId && renderPath.has(layerId)) {
            this.warnInvalidRender(`Detected circular children tree while rendering layer list, layerId=${layerId}`);
            return createElement(Fragment, {key: `layer-cycle-${layerId}`});
        }

        const nextRenderPath = new Set(renderPath);
        layerId && nextRenderPath.add(layerId);
        const {directSelectedIds} = eventOperateStore;
        const {layerInstances} = layerListStore;
        const _props = {
            name: layer.name,
            lock: layer.lock,
            hide: layer.hide,
            compId: layer.id,
            type: layer.type,
            selected: directSelectedIds.includes(layer.id!)
        }
        if (type === 'group') {
            //先生成子元素再包裹groupItem
            const childDomArr: ReactElement[] = [];
            children?.forEach((item: ILayerItem) => {
                if (item?.id && nextRenderPath.has(item.id)) {
                    this.warnInvalidRender(`Skipped circular group child while rendering layer list, layerId=${item.id}`);
                    return;
                }
                childDomArr.push(this.buildLayer(item, dragHandleProps, nextRenderPath));
            });
            return createElement(LayerGroupItem, {
                ..._props,
                ...dragHandleProps,
                key: layer.id,
                ref: (ref) => layerInstances[layer.id!] = ref!
            }, ...childDomArr);

        } else {
            //直接生成layerItem
            return createElement(LayerItem, {..._props, ...dragHandleProps, key: layer.id, ref: (ref) => layerInstances[layer.id!] = ref!});
        }
    }
}

const layerRender = new LayerRender();
export default layerRender;
