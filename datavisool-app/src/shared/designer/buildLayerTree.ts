/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {cloneDeep} from 'lodash';
import type {ILayerItem} from '@datavisool/sdk/types';

export type LayerTreeOrder = 'asc' | 'desc';

/** Builds a detached tree from the persisted doubly-linked layer DTO. */
export function buildLayerTree(
    source: Readonly<Record<string, ILayerItem>>,
    header: string | undefined,
    order: LayerTreeOrder = 'desc',
    onWarning?: (message: string) => void,
): ILayerItem[] {
    const layerMap = cloneDeep(source) as Record<string, ILayerItem>;
    let orderedLayers: ILayerItem[] = [];
    const warnings = new Set<string>();
    const walkedLayerIds = new Set<string>();

    Object.values(layerMap).forEach(layer => { if (layer) layer.children = undefined; });
    const warn = (message: string) => {
        if (warnings.has(message)) return;
        warnings.add(message);
        onWarning?.(message);
    };
    const walk = (startId: string | undefined, output: ILayerItem[], path: Set<string> = new Set()) => {
        if (!startId) return;
        const siblingIds = new Set<string>();
        let currentId: string | undefined = startId;
        while (currentId) {
            if (path.has(currentId)) {
                warn(`Detected circular layer reference in render path, layerId=${currentId}`);
                break;
            }
            if (siblingIds.has(currentId)) {
                warn(`Detected circular next-chain while rendering layers, layerId=${currentId}`);
                break;
            }
            if (walkedLayerIds.has(currentId)) {
                warn(`Detected duplicate layer reference while rendering layers, layerId=${currentId}`);
                break;
            }
            const current: ILayerItem | undefined = layerMap[currentId];
            if (!current) {
                warn(`Layer reference missing while rendering layers, layerId=${currentId}`);
                break;
            }
            siblingIds.add(currentId);
            walkedLayerIds.add(currentId);
            output.push(current);
            const nextPath = new Set(path);
            nextPath.add(currentId);
            if (current.childHeader) walk(current.childHeader, output, nextPath);
            currentId = current.next;
        }
    };

    if (!header || !layerMap[header]) {
        warn(`Layer header missing while rendering layers, layerHeader=${header}`);
        return [];
    }
    walk(header, orderedLayers);
    if (order === 'asc') orderedLayers = orderedLayers.reverse();

    const roots: ILayerItem[] = [];
    const rootIds = new Set<string>();
    const shouldTreatAsRoot = (layer: ILayerItem) => {
        const {id, pid} = layer;
        if (!id || !pid) return true;
        if (!layerMap[pid]) {
            warn(`Layer parent missing while building render tree, layerId=${id}, parentId=${pid}`);
            return true;
        }
        const parentPath = new Set<string>([id]);
        let parentId: string | undefined = pid;
        while (parentId) {
            if (parentPath.has(parentId)) {
                warn(`Detected circular parent chain while building render tree, layerId=${id}, parentId=${pid}`);
                return true;
            }
            parentPath.add(parentId);
            parentId = layerMap[parentId]?.pid;
        }
        return false;
    };

    orderedLayers.forEach(layer => {
        if (shouldTreatAsRoot(layer)) {
            if (layer.id && !rootIds.has(layer.id)) {
                roots.push(layer);
                rootIds.add(layer.id);
            }
            return;
        }
        const parent = layer.pid ? layerMap[layer.pid] : undefined;
        if (!parent) {
            if (layer.id && !rootIds.has(layer.id)) {
                roots.push(layer);
                rootIds.add(layer.id);
            }
            return;
        }
        parent.children ??= [];
        if (!parent.children.some(child => child.id === layer.id)) parent.children.push(layer);
    });
    return roots;
}
