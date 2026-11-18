/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {SelectionManager} from './SelectionManager';
import type {
    BoxSelectionMode,
    BoxSelectionModeShortcut,
    BoxSelectionModifier,
    BoxSelectionStartShortcut,
    BoxSelectionModeResolver,
    InteractionShortcutEvent,
    InteractionShortcutPredicate,
    LayerBox,
    Point,
    PointerLike,
} from './types';

const modifierEventKey: Record<BoxSelectionModifier, keyof InteractionShortcutEvent> = {
    alt: 'altKey',
    shift: 'shiftKey',
    control: 'ctrlKey',
    meta: 'metaKey',
};

export interface SelectionResolverOptions {
    getSelectedIds: () => string[];
    boxSelectionMode?: BoxSelectionMode;
    getBoxSelectionMode?: () => BoxSelectionMode;
    resolveBoxSelectionMode?: BoxSelectionModeResolver;
    boxSelectionModeShortcut?: BoxSelectionModeShortcut;
    boxSelectionStartShortcut?: BoxSelectionStartShortcut;
    isAdditiveSelectionActive?: InteractionShortcutPredicate;
    isBoxSelectionStartActive?: InteractionShortcutPredicate;
    resolveHitTarget?: (input: {
        point: Point;
        candidates: LayerBox[];
        selectedIds: string[];
    }) => string | null;
    resolveSelectionIds?: (input: {
        hitId: string | null;
        selectedIds: string[];
        additive: boolean;
        shiftKey?: boolean;
        ctrlKey?: boolean;
        metaKey?: boolean;
        event?: PointerLike;
    }) => string[];
    resolveBoxSelectionIds?: (input: {
        candidateIds: string[];
        selectedIds: string[];
        additive: boolean;
        boxSelectionMode: BoxSelectionMode;
        shiftKey?: boolean;
        ctrlKey?: boolean;
        metaKey?: boolean;
        event?: PointerLike;
    }) => string[];
}

export class SelectionResolver {
    private readonly options: SelectionResolverOptions;

    private readonly selectionManager: SelectionManager;

    constructor(options: SelectionResolverOptions, selectionManager = new SelectionManager()) {
        this.options = options;
        this.selectionManager = selectionManager;
    }

    resolveHitLayer(point: Point, candidates: LayerBox[]) {
        if (candidates.length === 0) {
            return null;
        }

        const hitId = this.options.resolveHitTarget
            ? this.options.resolveHitTarget({
                point,
                candidates,
                selectedIds: this.options.getSelectedIds(),
            })
            : candidates[candidates.length - 1].id;

        return candidates.find((candidate) => candidate.id === hitId) ?? null;
    }

    resolvePointSelection(hitLayer: LayerBox | null, additive: boolean, event?: PointerLike) {
        const selectedIds = this.options.getSelectedIds();
        const resolved = this.options.resolveSelectionIds?.({
            hitId: hitLayer?.id ?? null,
            selectedIds,
            additive,
            shiftKey: event?.shiftKey,
            ctrlKey: event?.ctrlKey,
            metaKey: event?.metaKey,
            event,
        });

        if (resolved) {
            return resolved;
        }

        return this.selectionManager.resolvePointSelection({
            hitLayer,
            selectedIds,
            additive,
        });
    }

    resolveBoxSelection(
        candidateLayers: LayerBox[],
        additive: boolean,
        boxSelectionMode: BoxSelectionMode,
        event?: PointerLike,
    ) {
        const selectedIds = this.options.getSelectedIds();
        const resolved = this.options.resolveBoxSelectionIds?.({
            candidateIds: candidateLayers.map((layer) => layer.id),
            selectedIds,
            additive,
            boxSelectionMode,
            shiftKey: event?.shiftKey,
            ctrlKey: event?.ctrlKey,
            metaKey: event?.metaKey,
            event,
        });

        if (resolved) {
            return resolved;
        }

        return this.selectionManager.resolveBoxSelection({
            hitLayers: candidateLayers,
            selectedIds,
            additive,
        });
    }

    resolveBoxSelectionMode(event: InteractionShortcutEvent): BoxSelectionMode {
        const resolved = this.options.resolveBoxSelectionMode?.(event);

        if (resolved) {
            return resolved;
        }

        const shortcut = this.options.boxSelectionModeShortcut;

        if (shortcut && this.isShortcutActive(shortcut, event)) {
            return shortcut.mode;
        }

        return this.options.getBoxSelectionMode?.()
            ?? this.options.boxSelectionMode
            ?? 'intersect';
    }

    isAdditiveSelectionActive(event: InteractionShortcutEvent) {
        return this.options.isAdditiveSelectionActive?.(event)
            ?? Boolean(event.ctrlKey || event.metaKey);
    }

    isBoxSelectionStartShortcutActive(event: InteractionShortcutEvent) {
        const resolved = this.options.isBoxSelectionStartActive?.(event);

        if (resolved !== undefined) {
            return resolved;
        }

        return this.isShortcutActive(this.options.boxSelectionStartShortcut, event);
    }

    private isShortcutActive(
        shortcut: BoxSelectionStartShortcut | undefined,
        event: InteractionShortcutEvent,
    ) {
        return Boolean(shortcut && event[modifierEventKey[shortcut.modifier]]);
    }
}
