/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it, vi} from 'vitest';
import {GeometryCoordinator} from '../../src/core/GeometryCoordinator';
import {LayerIndexManager} from '../../src/core/LayerIndexManager';
import {PointerSession} from '../../src/core/PointerSession';
import {SelectionResolver} from '../../src/core/SelectionResolver';
import {SnapCoordinator} from '../../src/core/SnapCoordinator';
import {SpatialIndex} from '../../src/core/SpatialIndex';
import {TransformSelectionCoordinator} from '../../src/core/TransformSelectionCoordinator';
import type {LayerBox} from '../../src/core/types';

function createLayer(id: string, x = 0, y = 0): LayerBox {
    return {
        id,
        x,
        y,
        width: 50,
        height: 40,
        rotate: 0,
    };
}

describe('LayerIndexManager', () => {
    it('keeps committed geometry in the index without requiring caller version churn', () => {
        const layers = [createLayer('a', 10, 10)];
        const manager = new LayerIndexManager({getLayers: () => layers});

        manager.ensure(layers);
        manager.applyCommittedGeometry([{id: 'a', x: 120}]);

        const index = manager.ensure(layers).spatialIndex;
        expect(index.queryPoint({x: 20, y: 20})).toEqual([]);
        expect(index.queryPoint({x: 130, y: 20}).map((layer) => layer.id)).toEqual(['a']);
    });

    it('rebuilds cached geometry when the caller version changes', () => {
        let version = 1;
        let layers = [createLayer('a', 10, 10)];
        const manager = new LayerIndexManager({
            getLayers: () => layers,
            getVersion: () => version,
        });

        manager.ensure(layers);
        layers = [createLayer('a', 150, 10)];
        expect(manager.ensure(layers).spatialIndex.queryPoint({x: 160, y: 20})).toEqual([]);

        version = 2;
        expect(manager.ensure(layers).spatialIndex.queryPoint({x: 160, y: 20}).map((layer) => layer.id))
            .toEqual(['a']);
    });
});

describe('SelectionResolver', () => {
    it('preserves default hit order and point selection behavior', () => {
        const layers = [createLayer('a'), createLayer('b')];
        const resolver = new SelectionResolver({getSelectedIds: () => ['a']});

        expect(resolver.resolveHitLayer({x: 10, y: 10}, layers)?.id).toBe('b');
        expect(resolver.resolvePointSelection(layers[1], false)).toEqual(['b']);
        expect(resolver.resolvePointSelection(layers[1], true)).toEqual(['a', 'b']);
    });

    it('forwards modifiers to caller selection strategies', () => {
        const resolveSelectionIds = vi.fn(() => ['custom']);
        const resolver = new SelectionResolver({
            getSelectedIds: () => ['a'],
            resolveSelectionIds,
        });
        const event = {
            clientX: 0,
            clientY: 0,
            shiftKey: true,
            ctrlKey: true,
        };

        expect(resolver.resolvePointSelection(createLayer('b'), true, event)).toEqual(['custom']);
        expect(resolveSelectionIds).toHaveBeenCalledWith({
            hitId: 'b',
            selectedIds: ['a'],
            additive: true,
            shiftKey: true,
            ctrlKey: true,
            metaKey: undefined,
            event,
        });
    });
});

describe('PointerSession', () => {
    it('manages deferred capture, window listeners, and cleanup for drag sessions', () => {
        const container = document.createElement('div');
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        const onPointerMove = vi.fn();
        const session = new PointerSession({
            getEventContainer: () => container,
            onPointerMove,
            onPointerUp: vi.fn(),
            onPointerCancel: vi.fn(),
        });
        const pointer = {clientX: 0, clientY: 0, pointerId: 1};

        session.start('drag', {scale: 1, containerLeft: 0, containerTop: 0}, 1);
        window.dispatchEvent(new Event('pointermove'));
        session.captureAfterMove(pointer, false);
        session.captureAfterMove(pointer, true);
        session.captureAfterMove(pointer, true);

        expect(onPointerMove).toHaveBeenCalledTimes(1);
        expect(container.setPointerCapture).toHaveBeenCalledTimes(1);
        expect(session.isTransformActive()).toBe(true);

        session.cleanup(pointer);
        window.dispatchEvent(new Event('pointermove'));

        expect(container.releasePointerCapture).toHaveBeenCalledWith(1);
        expect(onPointerMove).toHaveBeenCalledTimes(1);
        expect(session.getMode()).toBeNull();
    });

    it('captures selection immediately and keeps its spatial index for pointerup', () => {
        const container = document.createElement('div');
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        const index = new SpatialIndex();
        const session = new PointerSession({
            getEventContainer: () => container,
            onPointerMove: vi.fn(),
            onPointerUp: vi.fn(),
            onPointerCancel: vi.fn(),
        });

        session.start('select', {scale: 1, containerLeft: 0, containerTop: 0}, 7, {
            capture: true,
            selectionSpatialIndex: index,
        });

        expect(container.setPointerCapture).toHaveBeenCalledWith(7);
        expect(session.getSelectionSpatialIndex()).toBe(index);
        expect(session.isActivePointer({clientX: 0, clientY: 0, pointerId: 8})).toBe(false);

        session.cleanup({clientX: 0, clientY: 0, pointerId: 7});
    });
});

describe('SnapCoordinator', () => {
    it('preserves scaled defaults and caller candidate filtering', () => {
        const layers = [
            createLayer('active', 0, 0),
            createLayer('nearby', 80, 0),
            createLayer('far', 1000, 0),
        ];
        const spatialIndex = new SpatialIndex();
        const resolveSnapCandidateIds = vi.fn(() => ['nearby', 'missing']);
        const coordinator = new SnapCoordinator({
            getScale: () => 2,
            snapMode: 'nearby',
            resolveSnapCandidateIds,
        });

        spatialIndex.rebuild(layers);
        const options = coordinator.resolveOptions();
        const candidates = coordinator.resolveCandidates([layers[0]], layers, spatialIndex, options);

        expect(options).toMatchObject({
            mode: 'nearby',
            threshold: 2.5,
            candidateRange: 180,
        });
        expect(candidates.map((layer) => layer.id)).toEqual(['nearby']);
        expect(resolveSnapCandidateIds).toHaveBeenCalledWith({
            activeIds: ['active'],
            candidateIds: ['active', 'nearby'],
        });
    });
});

describe('GeometryCoordinator', () => {
    it('preserves geometry sanitizing, DOM writes, overlay patches, and index updates', () => {
        const layers = [createLayer('a', 10, 20)];
        const element = document.createElement('div');
        const manager = new LayerIndexManager({getLayers: () => layers});
        const renderOverlay = vi.fn();
        const coordinator = new GeometryCoordinator({
            getLayers: () => layers,
            getElementById: () => element,
        }, manager, renderOverlay);

        manager.ensure(layers);
        const writeCount = coordinator.applyLayerGeometry([{id: 'a', x: undefined, y: 35}]);
        const overlayPatches = renderOverlay.mock.calls[0][0] as Map<string, {id: string; x?: number; y?: number}>;

        expect(writeCount).toBe(3);
        expect(element.style.transform).toBe('translate(10px, 35px) rotate(0deg)');
        expect(overlayPatches.get('a')).toEqual({id: 'a', y: 35});
        expect(manager.ensure(layers).spatialIndex.queryPoint({x: 20, y: 40}).map((layer) => layer.id))
            .toEqual(['a']);
    });
});

describe('TransformSelectionCoordinator', () => {
    it('resolves group bounds and filters stale transform targets', () => {
        const layers = [createLayer('a', 10, 10), createLayer('b', 100, 20)];
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const elements = new Map([
            ['a', elementA],
            ['b', elementB],
        ]);
        const manager = new LayerIndexManager({getLayers: () => layers});
        const coordinator = new TransformSelectionCoordinator({
            getLayers: () => layers,
            getSelectedIds: () => ['a', 'b'],
            getElementById: (id) => elements.get(id) ?? null,
        }, manager);

        const selection = coordinator.resolveSelection();

        expect(selection?.type).toBe('group');
        expect(selection?.overlayLayer).toMatchObject({x: 10, y: 10, width: 140, height: 50});
        expect(coordinator.filterActiveTargets([
            {id: 'a', element: elementA},
            {id: 'b', element: document.createElement('div')},
            {id: 'missing', element: elementB},
        ])).toEqual(new Set(['a']));
    });
});
