/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ILayerItem} from "@datavisool/sdk/types";
import LayerUtil from "../designer/left/layer-list/util/LayerUtil.ts";

export interface IBoxInfo {
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    width: number,
    height: number
}

/**
 * 坐标计算工具类。专门用于提供设计器中各种复杂的坐标计算方法
 */
export default class CoordinateUtil {
    /**
     * 计算多个组件的包维盒坐标
     */
    public static calculateGroupRect(layerIds: string[], layers: Record<string, ILayerItem>): IBoxInfo {
        const coordinates = {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity,
            width: 0,
            height: 0
        }
        layerIds.forEach((id) => {
            const {x, y, width = 0, height = 0, type} = layers[id];
            if (type === 'group')
                return;
            coordinates.minX = Math.min(coordinates.minX, x ?? Infinity);
            coordinates.minY = Math.min(coordinates.minY, y ?? Infinity);
            coordinates.maxX = Math.max(coordinates.maxX, (x ?? -Infinity) + width);
            coordinates.maxY = Math.max(coordinates.maxY, (y ?? -Infinity) + height);
        });
        coordinates.width = coordinates.maxX - coordinates.minX;
        coordinates.height = coordinates.maxY - coordinates.minY;
        return coordinates;
    }

    /**
     * 计算多个组件左上角坐标形成的包围盒, 适用于做组内下、右对齐的操作
     */
    public static calculateGroupRectLT(layerIds: string[], layers: Record<string, ILayerItem>): IBoxInfo {
        const coordinates = {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity,
            width: 0,
            height: 0
        }
        layerIds.forEach((id) => {
            const {x, y, type} = layers[id];
            if (type === 'group')
                return;
            coordinates.minX = Math.min(coordinates.minX, x ?? Infinity);
            coordinates.minY = Math.min(coordinates.minY, y ?? Infinity);
            coordinates.maxX = Math.max(coordinates.maxX, x ?? -Infinity);
            coordinates.maxY = Math.max(coordinates.maxY, y ?? -Infinity);
        })
        coordinates.width = coordinates.maxX - coordinates.minX;
        coordinates.height = coordinates.maxY - coordinates.minY;
        return coordinates;
    }

    /**
     * 计算分组图层的包围盒尺寸、坐标信息
     * @param groupId 分组图层id
     * @param layers 图层数据
     */
    public static calculateGroupLayerRect(groupId: string, layers: Record<string, ILayerItem>): IBoxInfo {
        const layerIds = LayerUtil.findAllChildLayer([groupId], true);
        return CoordinateUtil.calculateGroupRect(layerIds, layers);
    }

    /**
     * 计算多个图层的左上角坐标
     * @param layers
     */
    public static calculateLayersLeftTopRect(layers: ILayerItem[]): { x: number, y: number } {
        const coordinates = {x: 0, y: 0}
        layers.forEach((layer) => {
            const {x, y, type} = layer;
            if (type === 'group')
                return;
            coordinates.x = Math.min(coordinates.x, x ?? Infinity);
            coordinates.y = Math.min(coordinates.y, y ?? Infinity);
        });
        return coordinates;
    }
}