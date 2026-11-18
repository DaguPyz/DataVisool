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
    InteractionEngine,
    ResizeController,
    RotateController,
    SnapEngine,
    SpatialIndex,
} from '../dist/datavisool-interaction-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(packageDir, '..');
const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(repoDir, args.outputDir ?? 'performance-baselines');
const runId = args.runId ?? `datavisool-interaction-engine-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const iterations = Number(args.iterations ?? '120');
const frameIterations = Number(args.frameIterations ?? '180');
const layerCounts = (args.layers ?? '1000,10000')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);

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
        baseline: 'Node + jsdom microbenchmark for datavisool-interaction-engine hot paths',
    },
    scenarios: [],
};

for (const layerCount of layerCounts) {
    result.scenarios.push(runSpatialIndexScenario(layerCount));
    result.scenarios.push(runPointerdownScenario(layerCount));
}

result.scenarios.push(runDragScenario(1000, 10000, false));
result.scenarios.push(runDragScenario(1000, 10000, true));
result.scenarios.push(runResizeScenario(1000, false));
result.scenarios.push(runResizeScenario(1000, true));
result.scenarios.push(runRotateScenario(1000, false));
result.scenarios.push(runRotateScenario(1000, true));
result.scenarios.push(runSnapScenario(10000));

await mkdir(outputDir, {recursive: true});
const jsonPath = path.join(outputDir, `${runId}.json`);
const mdPath = path.join(outputDir, `${runId}.md`);
await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
await writeFile(mdPath, renderMarkdown(result, jsonPath), 'utf8');

console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
console.log(renderSummary(result));

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
        id: '__baseline_preview_bounds__',
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
    container.setPointerCapture = () => undefined;
    container.releasePointerCapture = () => undefined;
    document.body.appendChild(container);
    return container;
}

function createPointerEvent(type, clientX, clientY) {
    const event = new Event(type, {bubbles: true, cancelable: true});

    Object.defineProperties(event, {
        button: {value: 0},
        clientX: {value: clientX},
        clientY: {value: clientY},
        pointerId: {value: 1},
        shiftKey: {value: false},
        ctrlKey: {value: false},
        metaKey: {value: false},
    });

    return event;
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

function runSpatialIndexScenario(layerCount) {
    const layers = createLayers(layerCount);
    const rebuildSamples = timeSamples(iterations, () => {
        const index = new SpatialIndex();
        index.rebuild(layers);
    });
    const index = new SpatialIndex();
    index.rebuild(layers);
    const querySamples = timeSamples(iterations, (sampleIndex) => {
        const layer = layers[sampleIndex % layers.length];
        index.queryPoint({x: layer.x + 8, y: layer.y + 8});
    });

    return {
        id: `spatial-index-${layerCount}`,
        layerCount,
        metrics: [
            measure('rebuild', rebuildSamples, {
                targetMs: layerCount >= 10000 ? 8 : 3,
                priority: 'P1',
            }),
            measure('queryPoint', querySamples, {
                targetMs: 1,
                priority: 'P1',
            }),
        ],
    };
}

function runPointerdownScenario(layerCount) {
    const layers = createLayers(layerCount);
    const elements = createElements(layers);
    const container = createContainer();
    let businessVersion = 1;
    let layerIndexVersion = 1;
    const engine = new InteractionEngine({
        container,
        getScale: () => 1,
        getLayers: () => layers,
        getLayersVersion: () => businessVersion,
        getLayerIndexVersion: () => layerIndexVersion,
        getSelectedIds: () => ['layer-0'],
        getElementById: (id) => elements.get(id) ?? null,
    });
    const hit = layers[0];
    engine.mount();

    dispatchPointerdownCycle(container, hit);

    const cachedSamples = timeSamples(iterations, () => {
        businessVersion += 1;
        dispatchPointerdownCycle(container, hit);
    });
    const rebuildSamples = timeSamples(iterations, () => {
        businessVersion += 1;
        layerIndexVersion += 1;
        dispatchPointerdownCycle(container, hit);
    });

    engine.destroy();
    container.remove();

    return {
        id: `pointerdown-${layerCount}`,
        layerCount,
        metrics: [
            measure('businessVersionChurnPointerdownCycle', cachedSamples, {
                targetMs: layerCount >= 10000 ? 8 : 3,
                priority: 'P1',
            }),
            measure('indexVersionRebuildPointerdownCycle', rebuildSamples, {
                targetMs: layerCount >= 10000 ? 8 : 3,
                priority: 'P1',
            }),
        ],
    };
}

function dispatchPointerdownCycle(container, layer) {
    const x = layer.x + 8;
    const y = layer.y + 8;
    container.dispatchEvent(createPointerEvent('pointerdown', x, y));
    window.dispatchEvent(createPointerEvent('pointerup', x, y));
}

function runDragScenario(activeCount, candidateCount, usePreview) {
    const activeLayers = createLayers(activeCount);
    const candidateLayers = createLayers(candidateCount).map((layer) => ({
        ...layer,
        id: `candidate-${layer.id}`,
        x: layer.x + 10000,
    }));
    const activeElements = createElements(activeLayers);
    const previewElement = usePreview ? createPreviewElement(createBounds(activeLayers)) : null;
    const controller = new DragController({
        requestFrame: () => 1,
        cancelFrame: () => undefined,
    });
    controller.start({
        hitId: activeLayers[0].id,
        activeLayers,
        activeElements,
        previewElement,
        snapCandidates: candidateLayers,
        snapOptions: {mode: 'nearby', threshold: 5},
        pointer: {x: 0, y: 0},
    });

    const frameSamples = timeSamples(frameIterations, (index) => {
        controller.move({x: index + 1, y: index % 7});
        controller.flush();
    });
    const snapshot = controller.getPerfSnapshot();
    controller.cancel();

    return {
        id: usePreview ? 'drag-preview-1000-active-10000-candidates' : 'drag-layers-1000-active-10000-candidates',
        layerCount: activeCount,
        metrics: [
            measure('moveAndFlushFrame', frameSamples, {
                targetMs: usePreview ? 4 : undefined,
                priority: 'P1',
                domWrites: snapshot.domWrites,
                activeLayerCount: snapshot.activeLayerCount,
                snapCandidateCount: snapshot.snapCandidateCount,
            }),
        ],
    };
}

function runResizeScenario(activeCount, usePreview) {
    const layers = createLayers(activeCount);
    const elements = createElements(layers);
    const previewElement = usePreview ? createPreviewElement(createBounds(layers)) : null;
    const controller = new ResizeController({
        requestFrame: () => 1,
        cancelFrame: () => undefined,
    });
    controller.startMany({
        layers,
        elements,
        previewElement,
        handle: 'se',
        pointer: {x: 0, y: 0},
    });

    const inputSamples = [];
    const frameSamples = [];

    for (let frame = 0; frame < frameIterations; frame += 1) {
        const inputStart = performance.now();

        for (let sample = 0; sample < 4; sample += 1) {
            controller.move({x: frame * 2 + sample, y: frame + sample});
        }

        inputSamples.push(performance.now() - inputStart);

        const frameStart = performance.now();
        controller.flush();
        frameSamples.push(performance.now() - frameStart);
    }

    const snapshot = controller.getPerfSnapshot();
    controller.cancel();

    return {
        id: usePreview ? 'resize-preview-1000-active' : 'resize-layers-1000-active',
        layerCount: activeCount,
        metrics: [
            measure('fourPointerInputs', inputSamples, {
                targetMs: 1,
                priority: 'P1',
            }),
            measure('computeAndPreviewFlush', frameSamples, {
                targetMs: usePreview ? 6 : undefined,
                priority: 'P1',
                domWrites: snapshot.domWrites,
            }),
        ],
    };
}

function runRotateScenario(activeCount, usePreview) {
    const layers = createLayers(activeCount);
    const elements = createElements(layers);
    const previewElement = usePreview ? createPreviewElement(createBounds(layers)) : null;
    const controller = new RotateController({
        requestFrame: () => 1,
        cancelFrame: () => undefined,
    });
    controller.startMany({
        layers,
        elements,
        previewElement,
        pointer: {x: 2000, y: 2000},
    });

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

    const snapshot = controller.getPerfSnapshot();
    controller.cancel();

    return {
        id: usePreview ? 'rotate-preview-1000-active' : 'rotate-layers-1000-active',
        layerCount: activeCount,
        metrics: [
            measure('fourPointerInputs', inputSamples, {
                targetMs: 1,
                priority: 'P1',
            }),
            measure('computeAndFlush', frameSamples, {
                targetMs: usePreview ? 6 : undefined,
                priority: 'P1',
                domWrites: snapshot.domWrites,
            }),
        ],
    };
}

function runSnapScenario(candidateCount) {
    const activeLayers = [createLayers(1)[0]];
    const candidateLayers = createLayers(candidateCount).map((layer, index) => ({
        ...layer,
        id: `snap-${index}`,
        x: layer.x + 400,
    }));
    const engine = new SnapEngine();
    const startSamples = timeSamples(Math.max(10, Math.floor(iterations / 4)), () => {
        engine.start({
            activeLayers,
            candidateLayers,
            options: {mode: 'all', threshold: 5},
        });
    });
    const session = engine.start({
        activeLayers,
        candidateLayers,
        options: {mode: 'all', threshold: 5},
    });
    const resolveSamples = timeSamples(frameIterations * 4, (index) => {
        engine.resolve(session, 300 + (index % 40), index % 17);
    });

    return {
        id: 'snap-all-10000',
        layerCount: candidateCount,
        metrics: [
            measure('startBuildSortedLines', startSamples, {
                targetMs: 12,
                priority: 'P2',
                candidateLinesX: session.candidateLinesX.length,
                candidateLinesY: session.candidateLinesY.length,
            }),
            measure('resolveBinarySearch', resolveSamples, {
                targetMs: 1,
                priority: 'P2',
                candidateLinesX: session.candidateLinesX.length,
                candidateLinesY: session.candidateLinesY.length,
            }),
        ],
    };
}

function round(value) {
    return Number(value.toFixed(3));
}

function renderMarkdown(data, jsonPath) {
    const rows = [];

    for (const scenario of data.scenarios) {
        for (const metric of scenario.metrics) {
            rows.push({
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
        `# datavisool-interaction-engine 性能基线 ${data.runId}`,
        '',
        `- 时间：${data.createdAt}`,
        `- 环境：${data.environment.platform}，${data.environment.node}，CPU ${data.environment.cpu}`,
        `- 口径：${data.config.baseline}`,
        `- 原始 JSON：${path.relative(repoDir, jsonPath)}`,
        '',
        '| 场景 | 指标 | 样本 | 平均(ms) | P95(ms) | 最大(ms) | 目标(ms) | 结果 | 优先级 |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
        ...rows.map((row) => (
            `| ${row.scenario} | ${row.metric} | ${row.samples} | ${row.avgMs} | ${row.p95Ms} | ${row.maxMs} | ${row.targetMs} | ${row.pass} | ${row.priority} |`
        )),
        '',
        '## 说明',
        '',
        '- `businessVersionChurnPointerdownCycle` 表示普通业务版本持续变化、图层索引版本不变时的 pointerdown + pointerup 热路径。',
        '- `indexVersionRebuildPointerdownCycle` 表示图层几何索引版本变化导致索引重建的起手成本。',
        '- `fourPointerInputs` 模拟 240Hz 输入合并到 60FPS，每帧 4 次 pointermove，仅最后一次进入 rAF 计算。',
        '- `computeAndPreviewFlush` 的 resize 路径使用 transform preview，不在交互帧写 `width/height`。',
        '- Node + jsdom 不能代表真实 WebView GPU/paint 成本，适合作为核心算法和 DOM 写入回归基线。',
        '',
    ].join('\n');
}

function renderSummary(data) {
    const lines = ['Summary:'];

    for (const scenario of data.scenarios) {
        for (const metric of scenario.metrics) {
            const status = metric.targetMs ? (metric.p95Ms <= metric.targetMs ? 'PASS' : 'FAIL') : 'INFO';
            lines.push(`${status} ${scenario.id}/${metric.name}: avg ${metric.avgMs}ms, p95 ${metric.p95Ms}ms, max ${metric.maxMs}ms`);
        }
    }

    return lines.join('\n');
}
