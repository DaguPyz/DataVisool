/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {
    CommandTargetResolveOptions,
    EffectiveLayerState,
    LayerConfigMap,
    SelectionResolveOptions,
} from "./SelectionTypes.ts";
import type {ILayerItem} from "@datavisool/sdk/types";

interface AncestorChain {
    ids: string[];
    cyclic: boolean;
}

const isValidLayerId = (id: unknown, layers: LayerConfigMap): id is string => {
    return typeof id === "string" && id.trim().length > 0 && Boolean(layers[id]);
};

const getGroupAncestorChain = (id: string, layers: LayerConfigMap): AncestorChain => {
    if (!isValidLayerId(id, layers))
        return {ids: [], cyclic: false};

    const ancestors: string[] = [];
    const visited = new Set<string>([id]);
    let currentId: string | undefined = id;

    while (currentId) {
        const parentId: string | undefined = layers[currentId]?.pid;
        if (!parentId)
            return {ids: ancestors, cyclic: false};

        const parent = layers[parentId];
        if (!parent || parent.type !== "group")
            return {ids: ancestors, cyclic: false};
        if (visited.has(parentId))
            return {ids: [], cyclic: true};

        ancestors.push(parentId);
        visited.add(parentId);
        currentId = parentId;
    }

    return {ids: ancestors, cyclic: false};
};

const areSelectionIdsRelated = (leftId: string, rightId: string, layers: LayerConfigMap): boolean => {
    if (leftId === rightId)
        return true;

    const leftAncestors = getGroupAncestorChain(leftId, layers);
    const rightAncestors = getGroupAncestorChain(rightId, layers);
    if (leftAncestors.cyclic || rightAncestors.cyclic)
        return false;

    return leftAncestors.ids.includes(rightId) || rightAncestors.ids.includes(leftId);
};

const getOrderedLayerIds = (layers: LayerConfigMap): string[] => {
    return Object.keys(layers)
        .filter((id) => isValidLayerId(id, layers))
        .map((id, index) => ({id, index, order: layers[id]?.order}))
        .sort((left, right) => {
            const leftOrder = typeof left.order === "number" && Number.isFinite(left.order) ? left.order : Number.MAX_SAFE_INTEGER;
            const rightOrder = typeof right.order === "number" && Number.isFinite(right.order) ? right.order : Number.MAX_SAFE_INTEGER;
            return leftOrder - rightOrder || left.index - right.index;
        })
        .map((item) => item.id);
};

const buildChildIdsByParent = (layers: LayerConfigMap): Map<string, string[]> => {
    const childIdsByParent = new Map<string, string[]>();

    getOrderedLayerIds(layers).forEach((id) => {
        const parentId = layers[id]?.pid;
        if (!parentId || layers[parentId]?.type !== "group")
            return;
        const childIds = childIdsByParent.get(parentId) ?? [];
        childIds.push(id);
        childIdsByParent.set(parentId, childIds);
    });

    return childIdsByParent;
};

export const getEffectiveLayerState = (id: string, layers: LayerConfigMap): EffectiveLayerState => {
    let hidden = false;
    let locked = false;
    const visited = new Set<string>();
    let currentId: string | undefined = id;

    while (currentId && !visited.has(currentId)) {
        const layer: ILayerItem | undefined = layers[currentId];
        if (!layer)
            break;
        visited.add(currentId);
        hidden ||= Boolean(layer.hide);
        locked ||= Boolean(layer.lock);
        currentId = layer.pid;
    }

    return {hidden, locked};
};

export const isEffectivelyHidden = (id: string, layers: LayerConfigMap): boolean => {
    return getEffectiveLayerState(id, layers).hidden;
};

export const isEffectivelyLocked = (id: string, layers: LayerConfigMap): boolean => {
    return getEffectiveLayerState(id, layers).locked;
};

export const isCanvasSelectable = (id: string, layers: LayerConfigMap): boolean => {
    if (!isValidLayerId(id, layers))
        return false;
    const state = getEffectiveLayerState(id, layers);
    return !state.hidden && !state.locked;
};

export const isManagementSelectable = (id: string, layers: LayerConfigMap): boolean => {
    return isValidLayerId(id, layers);
};

export const filterCanvasSelectableIds = (ids: readonly string[], layers: LayerConfigMap): string[] => {
    return Array.from(new Set(ids.filter((id) => isCanvasSelectable(id, layers))));
};

export const filterManagementSelectableIds = (ids: readonly string[], layers: LayerConfigMap): string[] => {
    return Array.from(new Set(ids.filter((id) => isManagementSelectable(id, layers))));
};

export const normalizeSelectionIds = (ids: readonly string[], layers: LayerConfigMap): string[] => {
    const validIds = filterManagementSelectableIds(ids, layers);
    const selectedIdSet = new Set(validIds);

    return validIds.filter((id) => {
        const ancestors = getGroupAncestorChain(id, layers);
        return ancestors.cyclic || !ancestors.ids.some((ancestorId) => selectedIdSet.has(ancestorId));
    });
};

export const resolveOuterGroupSelectionId = (id: string, layers: LayerConfigMap): string | null => {
    if (!isValidLayerId(id, layers))
        return null;

    const ancestors = getGroupAncestorChain(id, layers);
    if (ancestors.cyclic)
        return id;
    return ancestors.ids[ancestors.ids.length - 1] ?? id;
};

export const resolveCanvasSelectionIds = (
    candidateIds: readonly string[],
    layers: LayerConfigMap,
    options: SelectionResolveOptions = {},
): string[] => {
    const selectableIds = filterCanvasSelectableIds(candidateIds, layers);
    const resolvedIds = options.deep
        ? selectableIds
        : selectableIds
            .map((id) => resolveOuterGroupSelectionId(id, layers))
            .filter((id): id is string => Boolean(id));

    return normalizeSelectionIds(resolvedIds, layers);
};

export const resolvePointSelectionIds = (
    hitId: string | null,
    layers: LayerConfigMap,
    options: SelectionResolveOptions = {},
): string[] => {
    return resolveCanvasSelectionIds(hitId ? [hitId] : [], layers, options);
};

export const resolveBoxSelectionIds = (
    candidateIds: readonly string[],
    layers: LayerConfigMap,
    options: SelectionResolveOptions = {},
): string[] => {
    return resolveCanvasSelectionIds(candidateIds, layers, options);
};

/** `null`表示右键命中了当前选择，调用方应原样保留选择和来源。 */
export const resolveContextMenuSelectionIds = (
    hitIds: readonly string[],
    selectedIds: readonly string[],
    layers: LayerConfigMap,
): string[] | null => {
    const canonicalSelectedIds = normalizeSelectionIds(selectedIds, layers);
    const selectedTreeIds = new Set(expandSelectionTreeIds(canonicalSelectedIds, layers));
    const primaryHitId = hitIds.find((id) => {
        return !isEffectivelyHidden(id, layers)
            && (selectedTreeIds.has(id) || isCanvasSelectable(id, layers));
    });
    if (primaryHitId && selectedTreeIds.has(primaryHitId))
        return null;
    return primaryHitId ? resolvePointSelectionIds(primaryHitId, layers) : [];
};

export const toggleSelectionIds = (
    currentIds: readonly string[],
    hitIds: readonly string[],
    layers: LayerConfigMap,
): string[] => {
    let nextIds = normalizeSelectionIds(currentIds, layers);

    normalizeSelectionIds(hitIds, layers).forEach((hitId) => {
        if (nextIds.includes(hitId)) {
            nextIds = nextIds.filter((id) => id !== hitId);
            return;
        }

        nextIds = nextIds.filter((id) => !areSelectionIdsRelated(id, hitId, layers));
        nextIds.push(hitId);
    });

    return normalizeSelectionIds(nextIds, layers);
};

export const expandSelectionTreeIds = (ids: readonly string[], layers: LayerConfigMap): string[] => {
    const childIdsByParent = buildChildIdsByParent(layers);
    const result: string[] = [];
    const visited = new Set<string>();

    const visit = (id: string) => {
        if (!isValidLayerId(id, layers) || visited.has(id))
            return;
        visited.add(id);
        result.push(id);

        if (layers[id]?.type !== "group")
            return;
        (childIdsByParent.get(id) ?? []).forEach(visit);
    };

    normalizeSelectionIds(ids, layers).forEach(visit);
    return result;
};

export const getSelectionLockState = (ids: readonly string[], layers: LayerConfigMap) => {
    const treeIds = expandSelectionTreeIds(ids, layers);
    return {
        hasLocked: treeIds.some((id) => isEffectivelyLocked(id, layers)),
        hasUnlocked: treeIds.some((id) => !isEffectivelyLocked(id, layers)),
    };
};

export const resolveTransformLeafIds = (ids: readonly string[], layers: LayerConfigMap): string[] => {
    return expandSelectionTreeIds(ids, layers).filter((id) => {
        return layers[id]?.type !== "group" && isCanvasSelectable(id, layers);
    });
};

export const resolveTopLevelSelectionIds = (layers: LayerConfigMap): string[] => {
    const topLevelIds = getOrderedLayerIds(layers).filter((id) => {
        const ancestors = getGroupAncestorChain(id, layers);
        if (ancestors.cyclic || ancestors.ids.length > 0 || !isCanvasSelectable(id, layers))
            return false;
        if (layers[id]?.type !== "group")
            return true;
        return expandSelectionTreeIds([id], layers).some((treeId) => {
            return layers[treeId]?.type !== "group" && isCanvasSelectable(treeId, layers);
        });
    });

    return normalizeSelectionIds(topLevelIds, layers);
};

export const resolveCommandTargetIds = (
    ids: readonly string[],
    layers: LayerConfigMap,
    options: CommandTargetResolveOptions = {},
): string[] => {
    const result: string[] = [];
    const resultSet = new Set<string>();

    normalizeSelectionIds(ids, layers).forEach((id) => {
        const treeIds = expandSelectionTreeIds([id], layers);
        if (!options.allowLockedManagement && treeIds.some((treeId) => isEffectivelyLocked(treeId, layers)))
            return;

        treeIds.forEach((treeId) => {
            if (!resultSet.has(treeId)) {
                resultSet.add(treeId);
                result.push(treeId);
            }
        });
    });

    return result;
};
