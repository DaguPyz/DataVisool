/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ILayerItem} from "@datavisool/sdk/types";
import {buildLayerTree} from '@/shared/designer/buildLayerTree.ts';

export enum LayerOrder {
    ASC,
    DESC,
}


export default class DesignerRender {
    /**
     * 解析函数
     */
    public parser = (layerMap: Record<string, ILayerItem>, layerHeader: string, order: LayerOrder = LayerOrder.DESC): ILayerItem[] => {
        return buildLayerTree(layerMap, layerHeader, order === LayerOrder.ASC ? 'asc' : 'desc', message => {
            console.warn(`[DesignerRender] ${message}`);
        });
    };

}
