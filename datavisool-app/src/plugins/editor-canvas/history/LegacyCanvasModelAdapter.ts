/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {cloneDeep} from 'lodash';
import {ObjectUtil} from '@datavisool/sdk';
import type {ILayerItem, ICanvasManager} from '@datavisool/sdk/types';
import type {DesignerSceneLayerSnapshot} from '@datavisool/sdk/plugin/contracts/designerRuntime';

export interface LegacyCanvasControllerFacade {
    config: Record<string, any>;
    getConfig(): Record<string, any>;
    getData(): unknown;
    update(patch: Record<string, any>, options?: unknown): void;
    updateFilter(filter: unknown): void;
    changeData?(data: unknown): void;
}

export interface LegacyCanvasLayerManagerFacade {
    layerConfigs: Record<string, ILayerItem>;
    elemConfigs: Record<string, Record<string, any>>;
    controllers: Record<string, LegacyCanvasControllerFacade>;
    layerHeader?: string;
    layerTail?: string;
    updateLayer(items: any[], reRender?: boolean): void;
    addItem(layer: ILayerItem): void;
    delItem(ids: readonly string[]): void;
    getData(): DesignerSceneLayerSnapshot;
    init(snapshot: DesignerSceneLayerSnapshot): void;
    reRenderLayer(): void;
}

export interface LegacyCanvasManagerFacade {
    readonly layerManager: LegacyCanvasLayerManagerFacade;
    readonly canvasManager: {canvasConfig: ICanvasManager};
}

const createController = (id: string, configs: Record<string, Record<string, any>>): LegacyCanvasControllerFacade => {
    const controller: LegacyCanvasControllerFacade = {
        get config() { return configs[id]; },
        set config(value) { configs[id] = value; },
        getConfig: () => configs[id],
        getData: () => configs[id]?.data,
        update(patch) {
            configs[id] ??= {};
            ObjectUtil.merge(configs[id], patch);
        },
        updateFilter(filter) {
            configs[id] ??= {};
            if (filter === undefined) delete configs[id].filter;
            else configs[id].filter = cloneDeep(filter);
        },
        changeData(data) {
            configs[id] ??= {};
            configs[id].data ??= {};
            configs[id].data.value = cloneDeep(data);
        },
    };
    return controller;
};

/**
 * Adapts the legacy canvas algorithms to one detached runtime scene snapshot.
 * Nothing returned here is a DesignerManager or aliases runtime state.
 */
export function createLegacyCanvasModelAdapter(source: DesignerSceneLayerSnapshot): {
    readonly manager: LegacyCanvasManagerFacade;
    readSnapshot(): DesignerSceneLayerSnapshot;
} {
    let canvas = cloneDeep(source.canvas) as ICanvasManager;
    let layerHeader = source.layerHeader;
    let layerTail = source.layerTail;
    const layerConfigs = cloneDeep(source.layers) as Record<string, ILayerItem>;
    const rawElemConfigs = cloneDeep(source.configs) as Record<string, Record<string, any>>;
    let elemConfigs: Record<string, Record<string, any>>;
    const controllers: Record<string, LegacyCanvasControllerFacade> = {};
    elemConfigs = new Proxy(rawElemConfigs, {
        set(target, property, value) {
            const id = String(property);
            Reflect.set(target, property, value);
            controllers[id] = createController(id, elemConfigs);
            return true;
        },
        deleteProperty(target, property) {
            const id = String(property);
            const deleted = Reflect.deleteProperty(target, property);
            delete controllers[id];
            return deleted;
        },
    });
    Object.keys(elemConfigs).forEach(id => { controllers[id] = createController(id, elemConfigs); });

    const layerManager: LegacyCanvasLayerManagerFacade = {
        layerConfigs,
        elemConfigs,
        controllers,
        get layerHeader() { return layerHeader; },
        set layerHeader(value) { layerHeader = value; },
        get layerTail() { return layerTail; },
        set layerTail(value) { layerTail = value; },
        updateLayer(items, _reRender) {
            items.forEach(item => {
                if (!item || typeof item !== 'object') return;
                if (Object.prototype.hasOwnProperty.call(item, 'layerHeader')) layerHeader = item.layerHeader;
                if (Object.prototype.hasOwnProperty.call(item, 'layerTail')) layerTail = item.layerTail;
                const id = item.id;
                if (!id || !layerConfigs[id]) return;
                Object.assign(layerConfigs[id], cloneDeep(item));
            });
        },
        addItem(layer) {
            if (layer?.id) layerConfigs[layer.id] = cloneDeep(layer);
        },
        delItem(ids) {
            ids.forEach(id => {
                delete layerConfigs[id];
                delete elemConfigs[id];
                delete controllers[id];
            });
        },
        getData() { return readSnapshot(); },
        init(next) {
            if (next.sceneIdentity !== source.sceneIdentity || next.sceneVersion !== source.sceneVersion) return;
            canvas = cloneDeep(next.canvas) as ICanvasManager;
            layerHeader = next.layerHeader;
            layerTail = next.layerTail;
            Object.keys(layerConfigs).forEach(id => delete layerConfigs[id]);
            Object.assign(layerConfigs, cloneDeep(next.layers));
            Object.keys(elemConfigs).forEach(id => delete elemConfigs[id]);
            Object.assign(elemConfigs, cloneDeep(next.configs));
            Object.keys(controllers).forEach(id => delete controllers[id]);
            Object.keys(elemConfigs).forEach(id => { controllers[id] = createController(id, elemConfigs); });
        },
        reRenderLayer() {},
    };
    const readSnapshot = (): DesignerSceneLayerSnapshot => ({
        sceneIdentity: source.sceneIdentity,
        sceneVersion: source.sceneVersion,
        canvas: cloneDeep(canvas),
        layerHeader,
        layerTail,
        layers: cloneDeep(layerConfigs),
        configs: cloneDeep(elemConfigs),
    });
    return {manager: {layerManager, canvasManager: {get canvasConfig() { return canvas; }}}, readSnapshot};
}
