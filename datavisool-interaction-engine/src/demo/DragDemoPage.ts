/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import './DragDemoPage.css';
import {
    InteractionEngine,
    type DragCommitItem,
    type LayerBox,
    type ResizeCommitItem,
    type RotateCommitItem,
    type SnapMode,
} from '../main';

interface DemoLayer extends LayerBox {
    label: string;
    lock: boolean;
    hide: boolean;
    order: number;
}

function createDemoLayers(): DemoLayer[] {
    return Array.from({length: 80}, (_, index) => {
        const column = index % 10;
        const row = Math.floor(index / 10);
        const width = 96 + (index % 3) * 16;
        const height = 58 + (index % 2) * 14;

        return {
            id: `layer-${index + 1}`,
            label: String(index + 1),
            x: 48 + column * 160,
            y: 48 + row * 118,
            width,
            height,
            rotate: 0,
            lock: index === 79,
            hide: false,
            order: index,
        };
    });
}

function applyLayerStyle(element: HTMLElement, layer: DemoLayer) {
    element.style.width = `${layer.width}px`;
    element.style.height = `${layer.height}px`;
    element.style.transform = `translate(${layer.x}px, ${layer.y}px) rotate(${layer.rotate}deg)`;
    element.style.zIndex = String(layer.order ?? 0);
}

export function renderDragDemoPage(host: HTMLElement) {
    const layers = createDemoLayers();
    let selectedIds = layers.slice(0, 10).map((layer) => layer.id);
    let commitCount = 0;
    const snapState = {
        mode: 'nearby' as SnapMode,
        threshold: 5,
        candidateRange: 360,
        guideColor: '#5087f6',
    };
    const resizeState = {
        step: 1,
        minWidth: 24,
        minHeight: 18,
    };
    const dragState = {
        step: 1,
    };
    const outlineState = {
        color: '#67e8f9',
        width: 1,
        radius: 0,
    };

    const root = document.createElement('main');
    root.className = 'datavisool-drag-demo';

    const toolbar = document.createElement('div');
    toolbar.className = 'datavisool-drag-demo__toolbar';
    toolbar.innerHTML = '<strong>datavisool-interaction-engine</strong>';

    const hint = document.createElement('span');
    hint.className = 'datavisool-drag-demo__hint';
    hint.textContent = 'blank drag selects, Ctrl/Command adds, Shift constrains drag axis, Ctrl/Command resize keeps ratio, Shift rotates by 45deg';

    const stats = document.createElement('div');
    stats.className = 'datavisool-drag-demo__stats';

    const stage = document.createElement('section');
    stage.className = 'datavisool-drag-demo__stage';

    const canvas = document.createElement('div');
    canvas.className = 'datavisool-drag-demo__canvas';

    const elementsById = new Map<string, HTMLElement>();

    for (const layer of layers) {
        const element = document.createElement('div');
        element.className = 'datavisool-drag-demo__layer';
        element.textContent = layer.lock ? `${layer.label} locked` : layer.label;
        element.dataset.layerId = layer.id;
        applyLayerStyle(element, layer);
        elementsById.set(layer.id, element);
        canvas.append(element);
    }

    stage.append(canvas);
    root.append(toolbar, stage);
    host.replaceChildren(root);

    const updateStats = () => {
        const perf = engine.getPerfSnapshot();
        stats.textContent = `snap ${snapState.mode}/${snapState.threshold}px | drag step ${dragState.step}px | resize step ${resizeState.step}px | guide ${snapState.guideColor} | outline ${outlineState.color}/${outlineState.width}px/${outlineState.radius}px | selected ${selectedIds.length} | commits ${commitCount} | flushes ${perf.frameFlushes} | dom writes ${perf.domWrites}`;
    };

    const refreshSelection = () => {
        const selected = new Set(selectedIds);

        for (const layer of layers) {
            const element = elementsById.get(layer.id);

            if (!element) {
                continue;
            }

            element.classList.toggle('is-selected', selected.has(layer.id));
            element.classList.toggle('is-locked', layer.lock);
        }

        engine.refreshResizeOverlay();
        updateStats();
    };

    const selectFirst = (count: number) => {
        selectedIds = layers
            .filter((layer) => !layer.lock)
            .slice(0, count)
            .map((layer) => layer.id);
        refreshSelection();
    };

    const clearSelection = () => {
        selectedIds = [];
        refreshSelection();
    };

    const resetLayers = () => {
        const freshLayers = createDemoLayers();

        for (const freshLayer of freshLayers) {
            const layer = layers.find((item) => item.id === freshLayer.id);
            const element = elementsById.get(freshLayer.id);

            if (!layer || !element) {
                continue;
            }

            Object.assign(layer, freshLayer);
            applyLayerStyle(element, layer);
        }

        commitCount = 0;
        selectFirst(10);
    };

    const selectObbResizeCase = () => {
        const fixtures: Array<Pick<DemoLayer, 'id' | 'x' | 'y' | 'width' | 'height' | 'rotate'>> = [
            {id: 'layer-14', x: 360, y: 130, width: 140, height: 80, rotate: 35},
            {id: 'layer-15', x: 560, y: 120, width: 120, height: 70, rotate: 35},
            {id: 'layer-24', x: 450, y: 280, width: 160, height: 78, rotate: 35},
        ];

        for (const fixture of fixtures) {
            const layer = layers.find((item) => item.id === fixture.id);
            const element = elementsById.get(fixture.id);

            if (!layer || !element) {
                continue;
            }

            Object.assign(layer, fixture, {
                hide: false,
                lock: false,
            });
            applyLayerStyle(element, layer);
        }

        selectedIds = fixtures.map((fixture) => fixture.id);
        refreshSelection();
    };

    const createButton = (label: string, action: () => void) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', action);
        toolbar.append(button);
        return button;
    };

    const createNumberControl = (label: string, value: number, min: number, max: number, action: (value: number) => void) => {
        const shell = document.createElement('label');
        shell.className = 'datavisool-drag-demo__control';
        shell.textContent = label;

        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(min);
        input.max = String(max);
        input.value = String(value);
        input.addEventListener('change', () => {
            const nextValue = Number(input.value);
            action(Number.isFinite(nextValue) ? nextValue : value);
            updateStats();
        });
        shell.append(input);
        toolbar.append(shell);
    };

    const createColorControl = (label: string, value: string, action: (value: string) => void) => {
        const shell = document.createElement('label');
        shell.className = 'datavisool-drag-demo__control';
        shell.textContent = label;

        const input = document.createElement('input');
        input.type = 'color';
        input.value = value;
        input.addEventListener('input', () => {
            action(input.value);
            updateStats();
        });
        shell.append(input);
        toolbar.append(shell);
    };

    const applyCommit = (items: DragCommitItem[]) => {
        const layerById = new Map(layers.map((layer) => [layer.id, layer]));

        for (const item of items) {
            const layer = layerById.get(item.id);

            if (!layer) {
                continue;
            }

            layer.x = item.x;
            layer.y = item.y;
        }

        commitCount += 1;
        updateStats();
    };

    const applyResizeCommit = (item: ResizeCommitItem) => {
        const layer = layers.find((current) => current.id === item.id);
        const element = elementsById.get(item.id);

        if (!layer || !element) {
            return;
        }

        layer.x = item.x;
        layer.y = item.y;
        layer.width = item.width;
        layer.height = item.height;
        applyLayerStyle(element, layer);
        commitCount += 1;
        engine.refreshResizeOverlay();
        updateStats();
    };

    const applyResizeBatchCommit = (items: ResizeCommitItem[]) => {
        for (const item of items) {
            const layer = layers.find((current) => current.id === item.id);
            const element = elementsById.get(item.id);

            if (!layer || !element) {
                continue;
            }

            layer.x = item.x;
            layer.y = item.y;
            layer.width = item.width;
            layer.height = item.height;
            applyLayerStyle(element, layer);
        }

        commitCount += 1;
        engine.refreshResizeOverlay();
        updateStats();
    };

    const applyRotateCommit = (item: RotateCommitItem) => {
        const layer = layers.find((current) => current.id === item.id);
        const element = elementsById.get(item.id);

        if (!layer || !element) {
            return;
        }

        layer.x = item.x ?? layer.x;
        layer.y = item.y ?? layer.y;
        layer.rotate = item.rotate;
        applyLayerStyle(element, layer);
        commitCount += 1;
        engine.refreshResizeOverlay();
        updateStats();
    };

    const applyRotateBatchCommit = (items: RotateCommitItem[]) => {
        for (const item of items) {
            const layer = layers.find((current) => current.id === item.id);
            const element = elementsById.get(item.id);

            if (!layer || !element) {
                continue;
            }

            layer.x = item.x ?? layer.x;
            layer.y = item.y ?? layer.y;
            layer.rotate = item.rotate;
            applyLayerStyle(element, layer);
        }

        commitCount += 1;
        engine.refreshResizeOverlay();
        updateStats();
    };

    const engine = new InteractionEngine({
        container: canvas,
        getScale: () => 1,
        getLayers: () => layers,
        getSelectedIds: () => selectedIds,
        getElementById: (id) => elementsById.get(id) ?? null,
        resolveHitTarget: ({candidates}) => candidates
            .filter((candidate) => !layers.find((layer) => layer.id === candidate.id)?.hide)
            .sort((a, b) => {
                const layerA = layers.find((layer) => layer.id === a.id);
                const layerB = layers.find((layer) => layer.id === b.id);
                return (layerA?.order ?? 0) - (layerB?.order ?? 0);
            })
            .at(-1)?.id ?? null,
        resolveBoxSelectionIds: ({candidateIds, selectedIds: currentSelectedIds, additive}) => {
            const candidateSet = new Set(candidateIds);
            const hitIds = layers
                .filter((layer) => candidateSet.has(layer.id) && !layer.hide)
                .sort((a, b) => a.order - b.order)
                .map((layer) => layer.id);

            return additive ? Array.from(new Set([...currentSelectedIds, ...hitIds])) : hitIds;
        },
        resolveTransformTargetIds: ({hitId, selectedIds: currentSelectedIds}) => {
            const baseIds = hitId && !currentSelectedIds.includes(hitId) ? [hitId] : currentSelectedIds;
            return baseIds.filter((id) => {
                const layer = layers.find((item) => item.id === id);
                return Boolean(layer && !layer.lock && !layer.hide);
            });
        },
        resolveSnapCandidateIds: ({candidateIds}) => candidateIds.filter((id) => {
            const layer = layers.find((item) => item.id === id);
            return Boolean(layer && !layer.hide);
        }),
        getSnapOptions: () => snapState,
        getSnapGuideColor: () => snapState.guideColor,
        getSelectedOutlineStyle: () => outlineState,
        getDragStep: () => dragState.step,
        getResizeStep: () => resizeState.step,
        minResizeWidth: resizeState.minWidth,
        minResizeHeight: resizeState.minHeight,
        selectionThreshold: 4,
        spatialIndexBucketSize: 220,
        onSelect: (ids) => {
            selectedIds = ids;
            refreshSelection();
        },
        onDragEnd: applyCommit,
        onResizeCommit: applyResizeCommit,
        onResizeBatchCommit: applyResizeBatchCommit,
        onRotateCommit: applyRotateCommit,
        onRotateBatchCommit: applyRotateBatchCommit,
    });

    createButton('Select 1', () => selectFirst(1));
    createButton('Select 10', () => selectFirst(10));
    createButton('Select 50', () => selectFirst(50));
    createButton('OBB resize', selectObbResizeCase);
    createButton('Clear', clearSelection);
    createButton('Reset', resetLayers);
    const snapButton = createButton('Snap nearby', () => {
        snapState.mode = snapState.mode === 'off'
            ? 'nearby'
            : snapState.mode === 'nearby'
                ? 'all'
                : 'off';
        snapButton.textContent = `Snap ${snapState.mode}`;
        updateStats();
    });
    createNumberControl('Threshold', snapState.threshold, 0, 24, (value) => {
        snapState.threshold = Math.min(24, Math.max(0, value));
    });
    createNumberControl('Range', snapState.candidateRange, 0, 1000, (value) => {
        snapState.candidateRange = Math.min(1000, Math.max(0, value));
    });
    createColorControl('Guide', snapState.guideColor, (value) => {
        snapState.guideColor = value;
    });
    createColorControl('Outline', outlineState.color, (value) => {
        outlineState.color = value;
        engine.refreshResizeOverlay();
    });
    createNumberControl('Outline width', outlineState.width, 0, 12, (value) => {
        outlineState.width = Math.min(12, Math.max(0, value));
        engine.refreshResizeOverlay();
    });
    createNumberControl('Outline radius', outlineState.radius, 0, 48, (value) => {
        outlineState.radius = Math.min(48, Math.max(0, value));
        engine.refreshResizeOverlay();
    });
    createNumberControl('Drag step', dragState.step, 1, 80, (value) => {
        dragState.step = Math.min(80, Math.max(1, value));
    });
    createNumberControl('Resize step', resizeState.step, 1, 40, (value) => {
        resizeState.step = Math.min(40, Math.max(1, value));
    });
    toolbar.append(hint);
    toolbar.append(stats);

    engine.mount();
    refreshSelection();
}
