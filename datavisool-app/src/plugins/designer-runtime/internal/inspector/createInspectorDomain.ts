/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {IdGenerate, ObjectUtil} from '@datavisool/sdk';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type {
    EditorInspectorChange,
    EditorInspectorChangeDetail,
    EditorInspectorController,
    EditorInspectorDataSourceTestKind,
    EditorInspectorDomain,
    EditorInspectorLayerEdit,
    EditorInspectorStatusChange,
    EditorInspectorTarget,
} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {
    DesignerEditingScene,
    DesignerSceneLayerSnapshot,
} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {ILayerItem, IThemeItem, IFilterConfigType, UpdateOptions, DataConfigType} from '@datavisool/sdk/types';
import {DesignerScene} from '@datavisool/sdk/types';
import type {MenuInfo} from '@datavisool/sdk/core';
import type {ComponentDataUpdater, HostDataUpdaterOptions} from '@datavisool/sdk/core';
import {cloneDeep, isEqual} from 'lodash';
import type DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {convergenceToInterval} from '@/util/BoundsValidatorUtil.ts';
import {normalizeLayerTransform} from '@/util/LayerTransformUtil.ts';

interface InspectorDomainOptions {
    readonly sceneVersion: number;
    /** Runtime-private manager injection; it never crosses the plugin or SDK boundary. */
    readonly manager: DesignerManager;
    readonly scene: DesignerEditingScene;
    readonly catalog: DesignerCatalog;
    readonly signal?: AbortSignal;
    recordChange(change: SceneModelChange): boolean;
    isActive(): boolean;
    canWrite(): boolean;
    emit(change: EditorInspectorChange): void;
    select(ids: readonly string[]): void;
}

type RuntimeController = {
    config: Record<string, any> | null;
    getConfig(): Record<string, any> | null;
    update(config: Record<string, any>, options?: UpdateOptions): void;
    changeData?(value: unknown): void;
    updateTheme?(theme: IThemeItem): void;
    updateFilter?(filter: IFilterConfigType | undefined): void;
    readEditSampleData?<T = unknown>(): T | undefined;
    manager?: DesignerManager;
    abort?(): unknown;
    applyLayers?(...args: any[]): unknown;
    getMap?(...args: any[]): unknown;
    readCurrentProjection?(...args: any[]): unknown;
    refreshMap?(...args: any[]): unknown;
    createHostDataUpdater?(
        success: (data?: any) => void,
        fail: () => void,
        options?: HostDataUpdaterOptions,
    ): ComponentDataUpdater | null;
};

const hasOwn = (value: Record<string, any> | null | undefined, key: string) =>
    !!value && Object.prototype.hasOwnProperty.call(value, key);

const deepFreeze = <T>(value: T, seen = new WeakSet<object>()): T => {
    if (!value || typeof value !== 'object' || seen.has(value as object)) return value;
    seen.add(value as object);
    Object.values(value as Record<string, unknown>).forEach(item => deepFreeze(item, seen));
    return Object.freeze(value);
};

const snapshot = <T>(value: T): T => deepFreeze(cloneDeep(value));

const DEFAULT_FILTER_CONFIG: IFilterConfigType = {
    enable: false,
    blur: 0,
    brightness: 1,
    contrast: 1,
    opacity: 1,
    saturate: 1,
    hueRotate: 0,
};
const PRESERVED_RESET_CONFIG_KEYS = new Set(['base', 'status']);
const COMMON_RESET_CONFIG_KEYS = ['style', 'data', 'filter'];
const FORWARDED_CONTROLLER_METHODS = new Set([
    'abort', 'applyLayers', 'changeData', 'createHostDataUpdater', 'getMap', 'readCurrentProjection', 'refreshMap', 'update',
]);
const GLOBAL_VARIABLE_EXPRESSION = /#\{[-_0-9a-zA-Z]+}/g;

function getResetKeys(current: Record<string, any>, defaults: Record<string, any>): string[] {
    const keys = new Set<string>();
    Object.keys(defaults).forEach(key => { if (!PRESERVED_RESET_CONFIG_KEYS.has(key)) keys.add(key); });
    COMMON_RESET_CONFIG_KEYS.forEach(key => { if (hasOwn(current, key)) keys.add(key); });
    return [...keys];
}

function defaultResetFragment(defaults: Record<string, any>, keys: readonly string[]): Record<string, any> {
    return keys.reduce((result, key) => {
        if (hasOwn(defaults, key)) result[key] = cloneDeep(defaults[key]);
        else if (key === 'filter') result[key] = cloneDeep(DEFAULT_FILTER_CONFIG);
        return result;
    }, {} as Record<string, any>);
}

function replaceKeys(target: Record<string, any>, next: Record<string, any>, keys: readonly string[]): void {
    keys.forEach(key => {
        if (hasOwn(next, key)) target[key] = cloneDeep(next[key]);
        else delete target[key];
    });
}

function replaceInput(snapshotValue: DesignerSceneLayerSnapshot): Omit<DesignerSceneLayerSnapshot, 'sceneIdentity' | 'sceneVersion'> {
    const {sceneIdentity: _identity, sceneVersion: _version, ...input} = snapshotValue;
    return input;
}

function collectSubtreeIds(layers: Readonly<Record<string, Readonly<ILayerItem>>>, roots: readonly string[]): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visitNode = (id: string) => {
        const layer = layers[id];
        if (!layer || visited.has(id)) return;
        visited.add(id);
        result.push(id);
        if (layer.type === 'group') visitSiblings(layer.childHeader, id);
    };
    const visitSiblings = (firstId: string | undefined, parentId: string) => {
        const fallback = Object.values(layers)
            .filter(layer => layer.pid === parentId && layer.id)
            .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
        const siblingIds: string[] = [];
        const siblingVisited = new Set<string>();
        let id = firstId;
        while (id && layers[id] && !siblingVisited.has(id) && layers[id].pid === parentId) {
            siblingVisited.add(id);
            siblingIds.push(id);
            id = layers[id].next;
        }
        fallback.forEach(layer => {
            if (layer.id && !siblingVisited.has(layer.id)) siblingIds.push(layer.id);
        });
        siblingIds.forEach(visitNode);
    };
    roots.forEach(visitNode);
    return result;
}

function leafIds(snapshotValue: DesignerSceneLayerSnapshot, id: string): string[] {
    const layer = snapshotValue.layers[id];
    if (!layer) return [];
    if (layer.type !== 'group') return [id];
    return collectSubtreeIds(snapshotValue.layers, [id])
        .filter(childId => childId !== id && snapshotValue.layers[childId]?.type !== 'group');
}

function displayLayer(snapshotValue: DesignerSceneLayerSnapshot, id: string): ILayerItem | undefined {
    const layer = snapshotValue.layers[id];
    if (!layer) return;
    const result = cloneDeep(layer) as ILayerItem;
    if (layer.type !== 'group') return result;
    const descendants = leafIds(snapshotValue, id)
        .map(childId => snapshotValue.layers[childId])
        .filter((child): child is Readonly<ILayerItem> => Boolean(child));
    if (!descendants.length) return result;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    descendants.forEach(child => {
        const x = Number(child.x ?? 0), y = Number(child.y ?? 0);
        const width = Number(child.width ?? 0), height = Number(child.height ?? 0);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width); maxY = Math.max(maxY, y + height);
    });
    Object.assign(result, {x: minX, y: minY, width: maxX - minX, height: maxY - minY});
    return result;
}

/** Runtime-owned adapter for the inspector's legacy component-controller facade. */
export function createInspectorDomain({
    sceneVersion,
    manager,
    scene,
    catalog,
    signal,
    recordChange,
    isActive: ownerIsActive,
    canWrite: ownerCanWrite,
    emit,
    select,
}: InspectorDomainOptions): EditorInspectorDomain {
    const managerStore = manager.runtimeContext?.managerStore;
    const managerGeneration = manager.getRuntimeGeneration();
    const sceneIdentity = scene.identity;
    const active = () => Boolean(
        ownerIsActive()
        && !signal?.aborted
        && manager.isRuntimeActive(managerGeneration)
        && managerStore?.currentManager === manager
        && managerStore.sceneVersion === sceneVersion
        && scene.identity === sceneIdentity
        && scene.version === sceneVersion
        && scene.isActive(),
    );
    const writable = () => active() && ownerCanWrite();

    const controllerFor = (id: string): RuntimeController | undefined => {
        if (!active() || !id) return;
        return manager.layerManager.controllers[id] as RuntimeController | undefined;
    };

    const commit = (change: SceneModelChange | undefined): boolean => {
        if (!change) return false;
        if (change.sceneIdentity !== sceneIdentity || change.sceneVersion !== sceneVersion || !writable()) {
            change.rollback();
            return false;
        }
        try {
            if (recordChange(change)) return true;
        } catch (error) {
            try { change.rollback(); } catch (rollbackError) {
                throw new AggregateError([error, rollbackError], '记录 Inspector 场景修改失败，且回滚失败。');
            }
            throw error;
        }
        change.rollback();
        return false;
    };

    const notify = (detail: EditorInspectorChangeDetail) => {
        if (!writable()) return;
        emit(Object.freeze({...snapshot(detail), sceneIdentity, sceneVersion} as EditorInspectorChange));
    };

    const readLayer = (id: string): ILayerItem | undefined => {
        const current = scene.layers.read();
        const layer = current?.layers[id];
        return current && layer ? displayLayer(current, id) : undefined;
    };

    const emitLayerUpdate = (id: string) => {
        const layer = readLayer(id);
        if (layer) notify({kind: 'layers-updated', layers: [layer]});
    };

    const replaceScene = (
        before: DesignerSceneLayerSnapshot,
        next: DesignerSceneLayerSnapshot,
        options?: UpdateOptions,
    ): boolean => commit(scene.layers.replace(before, replaceInput(next), options));

    const updateControllerConfig = (
        id: string,
        boundController: RuntimeController,
        patch: Record<string, any>,
        options?: UpdateOptions,
        statusId?: string | null,
    ): boolean => {
        if (!writable() || controllerFor(id) !== boundController || !patch || typeof patch !== 'object') return false;
        const before = scene.layers.read();
        const current = before?.configs[id] as Record<string, any> | undefined;
        if (!before || !current) return false;
        const nextConfig = ObjectUtil.merge(cloneDeep(current), cloneDeep(patch));
        if (!hasOwn(patch, 'base') && statusId) {
            const currentStatus = current.status?.[statusId] as Record<string, any> | undefined;
            if (currentStatus?.config) {
                const nextStatus = cloneDeep(currentStatus);
                nextStatus.config = ObjectUtil.merge(cloneDeep(currentStatus.config), cloneDeep(patch));
                nextConfig.status = ObjectUtil.merge(cloneDeep(current.status ?? {}), {[statusId]: nextStatus});
            }
        }
        const next = cloneDeep(before) as any;
        next.configs[id] = nextConfig;
        const committed = replaceScene(before, next, options);
        if (committed) notify({kind: 'configs-restored', ids: [id]});
        return committed;
    };

    const createFacade = (id: string, statusId?: string | null): EditorInspectorController | undefined => {
        const boundController = controllerFor(id);
        if (!boundController) return;
        const currentController = () => controllerFor(id) === boundController ? boundController : undefined;
        const boundMethods = new Map<PropertyKey, (...args: any[]) => unknown>();
        const facade = new Proxy(Object.create(null) as EditorInspectorController, {
            get(_target, property) {
                if (property === 'isCurrent') return () => Boolean(currentController());
                if (property === 'getConfig') return () => {
                    const controller = currentController();
                    const current = scene.layers.read();
                    return controller && current ? cloneDeep(current.configs[id]) : undefined;
                };
                if (property === 'config') {
                    const controller = currentController();
                    const current = scene.layers.read();
                    return controller && current ? cloneDeep(current.configs[id]) : undefined;
                }
                if (property === 'update') return (patch: Record<string, any>, options?: UpdateOptions) => {
                    const controller = currentController();
                    if (controller) updateControllerConfig(id, controller, patch, options, statusId);
                };
                if (property === 'changeData') return (data: unknown) => {
                    const controller = currentController();
                    const current = scene.layers.read();
                    const config = current?.configs[id] as Record<string, any> | undefined;
                    if (controller && current && config) {
                        updateControllerConfig(id, controller, {data: {...cloneDeep(config.data ?? {}), value: cloneDeep(data)}}, undefined, statusId);
                    }
                };
                if (property === 'renameLayer') return (name: string) => {
                    if (!writable() || !currentController()) return false;
                    const changed = commit(scene.layers.rename(id, name));
                    if (changed) emitLayerUpdate(id);
                    return changed;
                };
                if (property === 'createHostDataUpdater') return (
                    success: (data?: any) => void,
                    fail: () => void,
                    options?: HostDataUpdaterOptions,
                ) => {
                    const current = currentController();
                    const createUpdater = current?.createHostDataUpdater;
                    return writable() && typeof createUpdater === 'function'
                        ? createUpdater.call(current, success, fail, options)
                        : null;
                };
                if (typeof property !== 'string' || !FORWARDED_CONTROLLER_METHODS.has(property)) return undefined;
                const controller = currentController();
                if (!controller) return undefined;
                const member = Reflect.get(controller, property, controller);
                if (typeof member !== 'function') return undefined;
                let bound = boundMethods.get(property);
                if (!bound) {
                    bound = (...args: any[]) => {
                        const current = currentController();
                        if (!current) return undefined;
                        if ((property === 'applyLayers' || property === 'refreshMap') && !writable()) return undefined;
                        if (property === 'update') return updateControllerConfig(id, current, args[0], args[1], statusId);
                        if (property === 'changeData') {
                            const config = current.getConfig();
                            return updateControllerConfig(id, current, {data: {...cloneDeep(config?.data ?? {}), value: cloneDeep(args[0])}}, undefined, statusId);
                        }
                        const currentMember = Reflect.get(current, property, current);
                        return typeof currentMember === 'function' ? currentMember.apply(current, args) : undefined;
                    };
                    boundMethods.set(property, bound);
                }
                return bound;
            },
            set() { return false; },
        });
        return facade;
    };

    const readTarget = (id: string): EditorInspectorTarget | undefined => {
        const current = scene.layers.read();
        const layer = current?.layers[id];
        const controller = controllerFor(id);
        if (!active() || !current || !layer || !controller || !layer.type) return;
        const definition = manager.runtimeContext?.registry.definitions[layer.type];
        const component = catalog.getComponent(layer.type);
        if (!definition) return;
        const config = current.configs[id] as Record<string, any> | undefined;
        const componentInfo = {
            ...(component?.baseInfo ?? definition.getBaseInfo()),
            ...(config?.base ?? {}),
        };
        const menus: MenuInfo[] = definition.getMenuList().filter((item: MenuInfo) => !['base', 'filter', 'theme'].includes(item.key));
        const configPanels = definition.getMenuToConfigContentMap() ?? {};
        return Object.freeze({
            id,
            type: layer.type,
            layer: snapshot(displayLayer(current, id) ?? layer),
            componentInfo: snapshot(componentInfo),
            menus: Object.freeze(menus.map(menu => Object.freeze({...menu}))),
            configPanels: Object.freeze({...configPanels}),
            initialConfig: snapshot(catalog.createInitialConfig(layer.type) ?? {}),
        });
    };

    const readStatuses = (id: string) => {
        const current = scene.layers.read();
        const controller = controllerFor(id);
        if (!current || !controller) return;
        const statuses = (current.configs[id] as Record<string, any> | undefined)?.status ?? {};
        const items = Object.entries(statuses).map(([statusId, status]: [string, any]) => Object.freeze({id: statusId, name: status?.name ?? ''}));
        return Object.freeze({items: Object.freeze(items)});
    };

    const applyStatusChange = (id: string, change: EditorInspectorStatusChange): boolean => {
        if (!writable()) return false;
        const before = scene.layers.read();
        const controller = controllerFor(id);
        const config = before?.configs[id] as Record<string, any> | undefined;
        if (!before || !controller || !config) return false;
        const next = cloneDeep(before) as any;
        const nextConfig = next.configs[id] as Record<string, any>;
        nextConfig.status ??= {};
        switch (change.kind) {
            case 'add': {
                const statusId = IdGenerate.generateId();
                nextConfig.status[statusId] = {name: `状态${Object.keys(nextConfig.status).length + 1}`, config: {}};
                break;
            }
            case 'delete':
                if (!nextConfig.status[change.id]) return false;
                delete nextConfig.status[change.id];
                break;
            case 'rename':
                if (!nextConfig.status[change.id]) return false;
                nextConfig.status[change.id].name = change.name;
                break;
            case 'activate': {
                const activeConfig = nextConfig.status[change.id]?.config;
                if (!activeConfig) return false;
                next.configs[id] = ObjectUtil.merge(cloneDeep(nextConfig), cloneDeep(activeConfig));
                break;
            }
        }
        if (change.kind === 'activate' && isEqual(config, next.configs[id])) return true;
        const changed = replaceScene(before, next);
        if (changed) notify({kind: 'configs-restored', ids: [id]});
        return changed;
    };

    const applyLayerEdit = (id: string, edit: EditorInspectorLayerEdit): boolean => {
        const before = scene.layers.read();
        const layer = before?.layers[id];
        if (!before || !layer || !writable()) return false;
        if (edit.kind === 'rename') {
            const changed = commit(scene.layers.rename(id, edit.name));
            if (changed) emitLayerUpdate(id);
            return changed;
        }
        if (edit.kind === 'transform') {
            const transform = normalizeLayerTransform({...layer.transform, ...edit.transform});
            const changed = commit(scene.layers.patch(before, [{id, layer: {transform}}]));
            if (changed) emitLayerUpdate(id);
            return changed;
        }

        const selection = leafIds(before, id);
        if (!selection.length) return false;
        const display = displayLayer(before, id);
        if (!display) return false;
        select(selection);
        const patches: Array<{id: string; layer: Partial<ILayerItem>}> = [];
        if (edit.kind === 'move' || edit.kind === 'align') {
            let targetX = display.x ?? 0;
            let targetY = display.y ?? 0;
            if (edit.kind === 'move') {
                if (edit.x !== undefined) targetX = convergenceToInterval(edit.x);
                if (edit.y !== undefined) targetY = convergenceToInterval(edit.y);
            } else {
                const width = display.width ?? 0, height = display.height ?? 0;
                const canvas = before.canvas;
                if (edit.alignment === 'left') targetX = 0;
                if (edit.alignment === 'center-x' && canvas.width !== undefined) targetX = (canvas.width - width) / 2;
                if (edit.alignment === 'right' && canvas.width !== undefined) targetX = canvas.width - width;
                if (edit.alignment === 'top') targetY = 0;
                if (edit.alignment === 'center-y' && canvas.height !== undefined) targetY = (canvas.height - height) / 2;
                if (edit.alignment === 'bottom' && canvas.height !== undefined) targetY = canvas.height - height;
                targetX = convergenceToInterval(targetX);
                targetY = convergenceToInterval(targetY);
            }
            const deltaX = targetX - (display.x ?? 0), deltaY = targetY - (display.y ?? 0);
            selection.forEach(childId => {
                const child = before.layers[childId];
                patches.push({id: childId, layer: {
                    ...(deltaX !== 0 ? {x: convergenceToInterval((child.x ?? 0) + deltaX)} : {}),
                    ...(deltaY !== 0 ? {y: convergenceToInterval((child.y ?? 0) + deltaY)} : {}),
                }});
            });
        } else {
            const currentWidth = display.width ?? 0, currentHeight = display.height ?? 0;
            const nextWidth = edit.width === undefined ? currentWidth : Math.max(1, convergenceToInterval(edit.width));
            const nextHeight = edit.height === undefined ? currentHeight : Math.max(1, convergenceToInterval(edit.height));
            if (layer.type !== 'group') {
                patches.push({id, layer: {
                    ...(edit.width === undefined ? {} : {width: nextWidth}),
                    ...(edit.height === undefined ? {} : {height: nextHeight}),
                }});
            } else {
                const scaleX = currentWidth === 0 ? 1 : nextWidth / currentWidth;
                const scaleY = currentHeight === 0 ? 1 : nextHeight / currentHeight;
                selection.forEach(childId => {
                    const child = before.layers[childId];
                    patches.push({id: childId, layer: {
                        ...(edit.width === undefined ? {} : {
                            x: convergenceToInterval((display.x ?? 0) + ((child.x ?? 0) - (display.x ?? 0)) * scaleX),
                            width: Math.max(1, convergenceToInterval((child.width ?? 1) * scaleX)),
                        }),
                        ...(edit.height === undefined ? {} : {
                            y: convergenceToInterval((display.y ?? 0) + ((child.y ?? 0) - (display.y ?? 0)) * scaleY),
                            height: Math.max(1, convergenceToInterval((child.height ?? 1) * scaleY)),
                        }),
                    }});
                });
            }
        }
        const changed = commit(scene.layers.patch(before, patches));
        if (changed) emitLayerUpdate(id);
        return changed;
    };

    const resetConfig = (id: string, statusId?: string | null): boolean => {
        if (!writable()) return false;
        const before = scene.layers.read();
        const controller = controllerFor(id);
        const target = readTarget(id);
        const current = before?.configs[id] as Record<string, any> | undefined;
        const defaults = target?.initialConfig as Record<string, any> | undefined;
        if (!before || !controller || !current || !defaults) return false;
        const keys = getResetKeys(current, defaults);
        const reset = defaultResetFragment(defaults, keys);
        const differs = (source: Record<string, any>) => keys.some(key =>
            hasOwn(source, key) !== hasOwn(reset, key) || !isEqual(source[key], reset[key]),
        );
        const status = statusId ? current.status?.[statusId]?.config as Record<string, any> | undefined : undefined;
        if (!differs(current) && (!status || !differs(status))) return false;
        const next = cloneDeep(before) as any;
        replaceKeys(next.configs[id], reset, keys);
        if (statusId && next.configs[id].status?.[statusId]?.config)
            replaceKeys(next.configs[id].status[statusId].config, reset, keys);
        const changed = replaceScene(before, next);
        if (changed) notify({kind: 'configs-restored', ids: [id]});
        return changed;
    };

    const findLoopSample = (): unknown => {
        const stack = managerStore?.managerStack ?? [];
        const currentIndex = stack.lastIndexOf(manager);
        for (let index = currentIndex - 1; index >= 0; index--) {
            const childManager = stack[index + 1];
            const parent = stack[index];
            const controller = Object.values(parent.layerManager.controllers).find(candidate => {
                const loop = candidate as RuntimeController;
                return loop.manager === childManager && typeof loop.readEditSampleData === 'function';
            }) as RuntimeController | undefined;
            const value = controller?.readEditSampleData?.();
            if (value !== undefined) return cloneDeep(value);
        }
        return undefined;
    };

    const readDataSourceContext = (id: string) => {
        if (!active() || !scene.layers.read()?.layers[id]) return;
        const isLoopContainer = manager.scene === DesignerScene.LOOP_CONTAINER;
        const managerId = isLoopContainer ? String(manager.id ?? '') : '';
        return Object.freeze({
            sourceTypes: isLoopContainer ? Object.freeze(['static' as DataConfigType['sourceType']]) : undefined,
            staticDataDraftValue: isLoopContainer ? findLoopSample() : undefined,
            staticDataSeedKey: isLoopContainer ? `${managerId}:${id}` : id,
        });
    };

    const variableValues = () => {
        const values = new Map<string, unknown>();
        scene.variables.list().forEach(item => {
            const variable = scene.variables.read(item.id);
            if (variable?.key) values.set(variable.key, variable.value);
        });
        return values;
    };

    const prepareDataSourceTest = (id: string, kind: EditorInspectorDataSourceTestKind, config: unknown) => {
        if (!writable() || !controllerFor(id) || !config || typeof config !== 'object' || Array.isArray(config)) return;
        const values = variableValues();
        const replaceExpression = (value: unknown): unknown => typeof value === 'string'
            ? value.replace(GLOBAL_VARIABLE_EXPRESSION, expression => {
                const key = expression.slice(2, -1);
                return values.has(key) ? String(values.get(key) ?? '') : expression;
            })
            : value;
        const replaceJson = (value: unknown) => {
            const serialized = typeof value === 'object' && value !== null ? JSON.stringify(value) ?? '' : String(value || '');
            const expressions = serialized.match(GLOBAL_VARIABLE_EXPRESSION) ?? [];
            if (!expressions.some(expression => values.has(expression.slice(2, -1)))) return cloneDeep(value);
            return JSON.parse(replaceExpression(serialized) as string);
        };
        const result = cloneDeep(config) as Record<string, any>;
        switch (kind) {
            case 'api':
                result.url = replaceExpression(result.url);
                if (hasOwn(result, 'params')) result.params = replaceJson(result.params);
                if (hasOwn(result, 'headers')) result.headers = replaceJson(result.headers);
                result.filter = replaceExpression(result.filter);
                break;
            case 'commonApi':
                result.filter = replaceExpression(result.filter);
                break;
            case 'database':
                result.sql = replaceExpression(result.sql);
                result.filter = replaceExpression(result.filter);
                break;
            case 'webSocket':
                result.url = replaceExpression(result.url);
                result.filter = replaceExpression(result.filter);
                break;
            case 'mqtt':
                result.host = replaceExpression(result.host);
                result.topics = replaceExpression(result.topics);
                result.filter = replaceExpression(result.filter);
                break;
        }
        return result;
    };

    const applyTheme = (id: string, theme: IThemeItem): boolean => {
        if (!writable()) return false;
        const before = scene.layers.read();
        const controller = controllerFor(id);
        const config = before?.configs[id] as Record<string, any> | undefined;
        if (!before || !controller || !config || !theme || typeof controller.updateTheme !== 'function') return false;
        const hadStyle = hasOwn(config, 'style');
        let nextConfig: Record<string, any>;
        try {
            controller.updateTheme(cloneDeep(theme));
            const themedConfig = controller.getConfig();
            if (!themedConfig) return false;
            nextConfig = cloneDeep(config);
            if (hasOwn(themedConfig, 'style')) nextConfig.style = cloneDeep(themedConfig.style);
            else delete nextConfig.style;
        } finally {
            // The hook is used only to derive its legacy style result; the scene model applies it below.
            if (controller.config) {
                controller.config = cloneDeep(config);
                controller.update(cloneDeep(config), {reRender: true});
            }
        }
        const hasStyle = hasOwn(nextConfig, 'style');
        if (hadStyle === hasStyle && isEqual(config.style, nextConfig.style)) return false;
        const next = cloneDeep(before) as any;
        next.configs[id] = nextConfig;
        const changed = replaceScene(before, next);
        if (changed) notify({kind: 'configs-restored', ids: [id]});
        return changed;
    };

    const applyFilter = (id: string, filter: IFilterConfigType): boolean => {
        if (!writable()) return false;
        const before = scene.layers.read();
        const controller = controllerFor(id);
        const config = before?.configs[id] as Record<string, any> | undefined;
        if (!before || !controller || !config || !filter || typeof controller.updateFilter !== 'function') return false;
        const next = cloneDeep(before) as any;
        next.configs[id].filter = cloneDeep(filter);
        if (hasOwn(config, 'filter') && isEqual(config.filter, filter)) return false;
        const changed = replaceScene(before, next);
        if (changed) notify({kind: 'configs-restored', ids: [id]});
        return changed;
    };

    return Object.freeze({
        sceneIdentity,
        sceneVersion,
        isActive: active,
        readTarget,
        createControllerFacade: createFacade,
        readStatuses,
        applyStatusChange,
        applyLayerEdit,
        resetConfig,
        readDataSourceContext,
        prepareDataSourceTest,
        applyTheme,
        applyFilter,
    });
}
