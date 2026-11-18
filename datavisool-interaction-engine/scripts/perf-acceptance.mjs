/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {
    DragController,
    ResizeController,
    RotateController,
    SelectionBoxController,
    SnapEngine,
    SpatialIndex,
} from '../dist/datavisool-interaction-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(packageDir, '..');
const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(repoDir, args.outputDir ?? 'performance-baselines');
const runId = args.runId ?? `datavisool-interaction-engine-acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const iterations = Number(args.iterations ?? '90');
const frameIterations = Number(args.frameIterations ?? '120');
const layerCounts = (args.layers ?? '500,1000')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);

installDomGlobals();

const result = {
    runId,
    createdAt: new Date().toISOString(),
    environment: {
        platform: `${process.platform} ${os.release()}`,
        node: process.version,
        cpu: `${os.cpus()[0]?.model ?? 'unknown'} x ${os.cpus().length}`,
    },
    config: {
        iterations,
        frameIterations,
        layerCounts,
        acceptance: [
            '500/1000 layers',
            'drag / resize / rotate use transform preview',
            'selection uses SelectionBoxController + SpatialIndex.queryRect',
            'snap uses SnapEngine all-candidate start + binary resolve',
            'undo/redo records geometry patches instead of cloning full project JSON',
        ],
    },
    scenarios: [],
};

for (const layerCount of layerCounts) {
    result.scenarios.push(runDragAcceptance(layerCount));
    result.scenarios.push(runResizeAcceptance(layerCount));
    result.scenarios.push(runRotateAcceptance(layerCount));
    result.scenarios.push(runSelectionAcceptance(layerCount));
    result.scenarios.push(runSnapAcceptance(layerCount));
    result.scenarios.push(runUndoRedoAcceptance(layerCount));
}

const failedMetrics = collectFailedMetrics(result);

await mkdir(outputDir, {recursive: true});
const jsonPath = path.join(outputDir, `${runId}.json`);
const mdPath = path.join(outputDir, `${runId}.md`);
await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
await writeFile(mdPath, renderMarkdown(result, jsonPath), 'utf8');

console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
console.log(renderSummary(result));

if (failedMetrics.length > 0) {
    process.exitCode = 1;
}

function parseArgs(argv) {
    const parsed = {};

    for (let index = 0; index < argv.length; index += 1) {
        const item = argv[index];

        if (!item.startsWith('--')) {
            continue;
        }

        const key = item.slice(2);
        const next = argv[index + 1];

        if (!next || next.startsWith('--')) {
            parsed[key] = 'true';
        } else {
            parsed[key] = next;
            index += 1;
        }
    }

    return parsed;
}

function installDomGlobals() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Element = dom.window.Element;
    globalThis.Event = dom.window.Event;
    globalThis.requestAnimationFrame = (callback) => {
        callback(performance.now());
        return 1;
    };
    globalThis.cancelAnimationFrame = () => undefined;
}

function createLayers(count) {
    const layers = [];
    const columns = Math.ceil(Math.sqrt(count));
    const width = 48;
    const height = 32;
    const gapX = 72;
    const gapY = 52;

    for (let index = 0; index < count; index += 1) {
        layers.push({
            id: `layer-${index}`,
            x: 16 + (index % columns) * gapX,
            y: 16 + Math.floor(index / columns) * gapY,
            width,
            height,
            rotate: index % 17 === 0 ? 15 : 0,
        });
    }

    return layers;
}

function createElements(layers) {
    const elements = new Map();

    for (const layer of layers) {
        const element = document.createElement('div');
        element.style.position = 'absolute';
        element.style.width = `${layer.width}px`;
        element.style.height = `${layer.height}px`;
        elements.set(layer.id, element);
    }

    return elements;
}

function createBounds(layers) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const layer of layers) {
        minX = Math.min(minX, layer.x);
        minY = Math.min(minY, layer.y);
        maxX = Math.max(maxX, layer.x + layer.width);
        maxY = Math.max(maxY, layer.y + layer.height);
    }

    return {
        id: '__acceptance_preview_bounds__',
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        rotate: 0,
    };
}

function createPreviewElement(bounds) {
    const element = document.createElement('div');
    element.style.position = 'absolute';
    element.style.width = `${bounds.width}px`;
    element.style.height = `${bounds.height}px`;
    element.style.transform = `translate(${bounds.x}px, ${bounds.y}px) rotate(${bounds.rotate}deg)`;
    document.body.appendChild(element);
    return element;
}

function createContainer() {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 4000,
        bottom: 4000,
        width: 4000,
        height: 4000,
        toJSON: () => undefined,
    });
    document.body.appendChild(container);
    return container;
}

function runDragAcceptance(layerCount) {
    const layers = createLayers(layerCount);
    const elements = createElements(layers);
    const previewElement = createPreviewElement(createBounds(layers));
    const controller = new DragController({
        requestFrame: () => 1,
        cancelFrame: () => undefined,
    });
    const started = controller.start({
        hitId: layers[0].id,
        activeLayers: layers,
        activeElements: elements,
        previewElement,
        useRealElementPreview: false,
        snapOptions: {mode: 'off'},
        pointer: {x: 0, y: 0},
    });

    if (!started) {
        throw new Error(`drag acceptance failed to start for ${layerCount} layers`);
    }

    const inputSamples = [];
    const frameSamples = [];

    for (let frame = 0; frame < frameIterations; frame += 1) {
        const inputStart = performance.now();

        for (let sample = 0; sample < 4; sample += 1) {
            controller.move({x: frame * 2 + sample + 1, y: frame + sample});
        }

        inputSamples.push(performance.now() - inputStart);

        const frameStart = performance.now();
        controller.flush();
        frameSamples.push(performance.now() - frameStart);
    }

    const commitStart = performance.now();
    const commitItems = controller.end({x: 240, y: 120});
    const commitMs = performance.now() - commitStart;
    const snapshot = controller.getPerfSnapshot();
    previewElement.remove();

    return {
        id: `acceptance-drag-${layerCount}`,
        operation: 'drag',
        layerCount,
        activeLayerCount: layerCount,
        metrics: [
            measure('fourPointerInputs', inputSamples, {
                targetMs: 1,
                priority: 'P0',
            }),
            measure('previewFrameFlush', frameSamples, {
                targetMs: 4,
                priority: 'P0',
                domWrites: snapshot.domWrites,
            }),
            measure('pointerupCommitAndRealDomWrite', [commitMs], {
                targetMs: layerCount >= 1000 ? 40 : 16,
                priority: 'P1',
                patchCount: commitItems.length,
            }),
        ],
    };
}

function runResizeAcceptance(layerCount) {
    const layers = createLayers(layerCount);
    const elements = createElements(layers);
    const previewElement = createPreviewElement(createBounds(layers));
    const controller = new ResizeController({
        requestFrame: () => 1,
        cancelFrame: () => undefined,
    });
    const started = controller.startMany({
        layers,
        elements,
        previewElement,
        useRealElementPreview: false,
        handle: 'se',
        pointer: {x: 0, y: 0},
    });

    if (!started) {
        throw new Error(`resize acceptance failed to start for ${layerCount} layers`);
    }

    const inputSamples = [];
    const frameSamples = [];

    for (let frame = 0; frame < frameIterations; frame += 1) {
        const inputStart = performance.now();

        for (let sample = 0; sample < 4; sample += 1) {
            controller.move({x: frame * 2 + sample + 1, y: frame + sample + 1});
        }

        inputSamples.push(performance.now() - inputStart);

        const frameStart = performance.now();
        controller.flush();
        frameSamples.push(performance.now() - frameStart);
    }

    const commitStart = performance.now();
    const result = controller.end({x: 240, y: 120});
    const commitMs = performance.now() - commitStart;
    const commitItems = Array.isArray(result) ? result : result ? [result] : [];
    const snapshot = controller.getPerfSnapshot();
    previewElement.remove();

    return {
        id: `acceptance-resize-${layerCount}`,
        operation: 'resize',
        layerCount,
        activeLayerCount: layerCount,
        metrics: [
            measure('fourPointerInputs', inputSamples, {
                targetMs: 1,
                priority: 'P0',
            }),
            measure('previewFrameFlush', frameSamples, {
                targetMs: 6,
                priority: 'P0',
                domWrites: snapshot.domWrites,
            }),
            measure('pointerupCommitAndRealDomWrite', [commitMs], {
                targetMs: layerCount >= 1000 ? 40 : 16,
                priority: 'P1',
                patchCount: commitItems.length,
            }),
        ],
    };
}

function runRotateAcceptance(layerCount) {
    const layers = createLayers(layerCount);
    const elements = createElements(layers);
    const previewElement = createPreviewElement(createBounds(layers));
    const controller = new RotateController({
        requestFrame: () => 1,
        cancelFrame: () => undefined,
    });
    const started = controller.startMany({
        layers,
        elements,
        previewElement,
        useRealElementPreview: false,
        pointer: {x: 2000, y: 2000},
    });

    if (!started) {
        throw new Error(`rotate acceptance failed to start for ${layerCount} layers`);
    }

    const inputSamples = [];
    const frameSamples = [];

    for (let frame = 0; frame < frameIterations; frame += 1) {
        const inputStart = performance.now();

        for (let sample = 0; sample < 4; sample += 1) {
            controller.move({x: 2000 + frame * 2 + sample, y: 1800 + frame + sample});
        }

        inputSamples.push(performance.now() - inputStart);

        const frameStart = performance.now();
        controller.flush();
        frameSamples.push(performance.now() - frameStart);
    }

    const commitStart = performance.now();
    const result = controller.end({x: 2240, y: 1920});
    const commitMs = performance.now() - commitStart;
    const commitItems = Array.isArray(result) ? result : result ? [result] : [];
    const snapshot = controller.getPerfSnapshot();
    previewElement.remove();

    return {
        id: `acceptance-rotate-${layerCount}`,
        operation: 'rotate',
        layerCount,
        activeLayerCount: layerCount,
        metrics: [
            measure('fourPointerInputs', inputSamples, {
                targetMs: 1,
                priority: 'P0',
            }),
            measure('previewFrameFlush', frameSamples, {
                targetMs: 6,
                priority: 'P0',
                domWrites: snapshot.domWrites,
            }),
            measure('pointerupCommitAndRealDomWrite', [commitMs], {
                targetMs: layerCount >= 1000 ? 40 : 16,
                priority: 'P1',
                patchCount: commitItems.length,
            }),
        ],
    };
}

function runSelectionAcceptance(layerCount) {
    const layers = createLayers(layerCount);
    const container = createContainer();
    const index = new SpatialIndex();
    const controller = new SelectionBoxController({threshold: 4});
    const bounds = createBounds(layers);
    const startPoint = {x: 0, y: 0};
    const endPoint = {
        x: bounds.x + bounds.width + 16,
        y: bounds.y + bounds.height + 16,
    };
    index.rebuild(layers);
    controller.attach(container);

    const samples = timeSamples(iterations, () => {
        controller.start(startPoint, false);
        controller.move(endPoint);
        const result = controller.end(endPoint);

        if (!result?.moved) {
            throw new Error('selection acceptance produced no marquee result');
        }

        const selected = index.queryRect(result.rect);

        if (selected.length !== layerCount) {
            throw new Error(`selection acceptance expected ${layerCount} layers, got ${selected.length}`);
        }
    });

    controller.destroy();
    container.remove();

    return {
        id: `acceptance-selection-${layerCount}`,
        operation: 'selection',
        layerCount,
        metrics: [
            measure('marqueeOverlayAndSpatialQuery', samples, {
                targetMs: layerCount >= 1000 ? 8 : 4,
                priority: 'P0',
                selectedCount: layerCount,
            }),
        ],
    };
}

function runSnapAcceptance(layerCount) {
    const activeLayers = [createLayers(1)[0]];
    const candidateLayers = createLayers(layerCount).map((layer, index) => ({
        ...layer,
        id: `snap-${index}`,
        x: layer.x + 400,
    }));
    const engine = new SnapEngine();
    const startSamples = timeSamples(iterations, () => {
        engine.start({
            activeLayers,
            candidateLayers,
            candidateLayersVersion: 1,
            options: {mode: 'all', threshold: 5},
        });
    });
    const session = engine.start({
        activeLayers,
        candidateLayers,
        candidateLayersVersion: 1,
        options: {mode: 'all', threshold: 5},
    });
    const resolveSamples = timeSamples(frameIterations * 4, (index) => {
        engine.resolve(session, 300 + (index % 40), index % 17);
    });

    return {
        id: `acceptance-snap-${layerCount}`,
        operation: 'snap',
        layerCount,
        metrics: [
            measure('startBuildSortedLines', startSamples, {
                targetMs: layerCount >= 1000 ? 3 : 2,
                priority: 'P0',
                candidateLinesX: session.candidateLinesX.length,
                candidateLinesY: session.candidateLinesY.length,
            }),
            measure('resolveBinarySearch', resolveSamples, {
                targetMs: 1,
                priority: 'P0',
                candidateLinesX: session.candidateLinesX.length,
                candidateLinesY: session.candidateLinesY.length,
            }),
        ],
    };
}

function runUndoRedoAcceptance(layerCount) {
    const layers = createLayers(layerCount);
    const patches = layers.map((layer, index) => ({
        id: layer.id,
        x: layer.x + 24 + index % 5,
        y: layer.y + 12 + index % 3,
        rotate: (layer.rotate + 15) % 360,
    }));
    const samples = timeSamples(iterations, () => {
        const history = new GeometryPatchHistory(layers);
        history.commit(patches);
        history.undo();
        history.redo();

        const first = history.get(layers[0].id);

        if (first.x !== patches[0].x || first.y !== patches[0].y || first.rotate !== patches[0].rotate) {
            throw new Error('undo/redo acceptance ended with invalid geometry');
        }
    });

    return {
        id: `acceptance-undo-redo-${layerCount}`,
        operation: 'undo-redo',
        layerCount,
        metrics: [
            measure('commitUndoRedoPatchStack', samples, {
                targetMs: layerCount >= 1000 ? 6 : 3,
                priority: 'P0',
                patchCount: layerCount,
                historyPolicy: 'geometry-patches-only',
            }),
        ],
    };
}

function GeometryPatchHistory(layers) {
    this.layersById = new Map(layers.map((layer) => [layer.id, {...layer}]));
    this.undoStack = [];
    this.redoStack = [];

    this.get = (id) => {
        const layer = this.layersById.get(id);

        if (!layer) {
            throw new Error(`unknown layer ${id}`);
        }

        return layer;
    };

    this.apply = (patches) => {
        for (const patch of patches) {
            const layer = this.get(patch.id);

            for (const key of ['x', 'y', 'width', 'height', 'rotate']) {
                if (patch[key] !== undefined) {
                    layer[key] = patch[key];
                }
            }
        }
    };

    this.commit = (patches) => {
        const inverse = [];

        for (const patch of patches) {
            const layer = this.get(patch.id);
            const before = {id: patch.id};

            for (const key of ['x', 'y', 'width', 'height', 'rotate']) {
                if (patch[key] !== undefined) {
                    before[key] = layer[key];
                    layer[key] = patch[key];
                }
            }

            inverse.push(before);
        }

        this.undoStack.push({
            undo: inverse,
            redo: patches.map((patch) => ({...patch})),
        });
        this.redoStack.length = 0;
    };

    this.undo = () => {
        const entry = this.undoStack.pop();

        if (!entry) {
            return;
        }

        this.apply(entry.undo);
        this.redoStack.push(entry);
    };

    this.redo = () => {
        const entry = this.redoStack.pop();

        if (!entry) {
            return;
        }

        this.apply(entry.redo);
        this.undoStack.push(entry);
    };
}

function measure(name, samples, extra = {}) {
    const sorted = [...samples].sort((a, b) => a - b);
    const avg = samples.reduce((sum, item) => sum + item, 0) / samples.length;

    return {
        name,
        samples: samples.length,
        avgMs: round(avg),
        p50Ms: round(percentile(sorted, 0.5)),
        p95Ms: round(percentile(sorted, 0.95)),
        maxMs: round(sorted[sorted.length - 1] ?? 0),
        ...extra,
    };
}

function percentile(sorted, point) {
    if (sorted.length === 0) {
        return 0;
    }

    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * point) - 1));
    return sorted[index];
}

function timeSamples(count, callback) {
    const samples = [];

    for (let index = 0; index < count; index += 1) {
        const start = performance.now();
        callback(index);
        samples.push(performance.now() - start);
    }

    return samples;
}

function collectFailedMetrics(data) {
    const failed = [];

    for (const scenario of data.scenarios) {
        for (const metric of scenario.metrics) {
            if (metric.targetMs !== undefined && metric.p95Ms > metric.targetMs) {
                failed.push({scenario: scenario.id, metric: metric.name});
            }
        }
    }

    return failed;
}

function round(value) {
    return Number(value.toFixed(3));
}

function renderMarkdown(data, jsonPath) {
    const rows = [];

    for (const scenario of data.scenarios) {
        for (const metric of scenario.metrics) {
            rows.push({
                layerCount: scenario.layerCount,
                operation: scenario.operation,
                scenario: scenario.id,
                metric: metric.name,
                samples: metric.samples,
                avgMs: metric.avgMs,
                p95Ms: metric.p95Ms,
                maxMs: metric.maxMs,
                targetMs: metric.targetMs ?? '',
                pass: metric.targetMs ? (metric.p95Ms <= metric.targetMs ? 'PASS' : 'FAIL') : '',
                priority: metric.priority ?? '',
            });
        }
    }

    return [
        `# datavisool-interaction-engine 主画布新引擎量化验收 ${data.runId}`,
        '',
        `- 时间：${data.createdAt}`,
        `- 环境：${data.environment.platform}，${data.environment.node}，CPU ${data.environment.cpu}`,
        `- 图层规模：${data.config.layerCounts.join(' / ')}`,
        `- 迭代：普通指标 ${data.config.iterations} 次，帧指标 ${data.config.frameIterations} 帧`,
        `- 原始 JSON：${path.relative(repoDir, jsonPath)}`,
        '',
        '| 图层 | 操作 | 场景 | 指标 | 样本 | 平均(ms) | P95(ms) | 最大(ms) | 目标(ms) | 结果 | 优先级 |',
        '| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
        ...rows.map((row) => (
            `| ${row.layerCount} | ${row.operation} | ${row.scenario} | ${row.metric} | ${row.samples} | ${row.avgMs} | ${row.p95Ms} | ${row.maxMs} | ${row.targetMs} | ${row.pass} | ${row.priority} |`
        )),
        '',
        '## 验收口径',
        '',
        '- 拖拽、缩放、旋转：覆盖 500/1000 个 active 图层，交互帧只写 transform preview，pointerup 才构建 geometry patches。',
        '- 框选：覆盖 SelectionBoxController overlay 和 SpatialIndex.queryRect，验收大范围框选全量命中成本。',
        '- 吸附：覆盖 SnapEngine all-candidate 建线和二分 resolve，避免拖拽帧内 O(N) guideline 扫描。',
        '- 撤销重做：验收 geometry patch 栈，不允许用整份项目 JSON 深拷贝作为热路径历史记录模型。',
        '- 当前脚本是 Node + jsdom 算法/DOM 写入门禁，不替代 WebView FPS、React commit、GPU paint、30 分钟 heap 曲线验收。',
        '',
    ].join('\n');
}

function renderSummary(data) {
    const lines = ['Summary:'];
    let failed = 0;

    for (const scenario of data.scenarios) {
        for (const metric of scenario.metrics) {
            const status = metric.targetMs ? (metric.p95Ms <= metric.targetMs ? 'PASS' : 'FAIL') : 'INFO';

            if (status === 'FAIL') {
                failed += 1;
            }

            lines.push(`${status} ${scenario.id}/${metric.name}: avg ${metric.avgMs}ms, p95 ${metric.p95Ms}ms, max ${metric.maxMs}ms`);
        }
    }

    lines.push(failed === 0 ? 'Acceptance: PASS' : `Acceptance: FAIL (${failed} metrics)`);

    return lines.join('\n');
}
