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
} from '../dist/datavisool-interaction-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(packageDir, '..');
const args = parseArgs(process.argv.slice(2));
const durationMs = Number(args.durationMs ?? '600000');
const sampleMs = Number(args.sampleMs ?? '10000');
const progressMs = Number(args.progressMs ?? '30000');
const reservoirSize = Number(args.reservoirSize ?? '8192');
const forceGc = args.forceGc !== 'false';
const outputDir = path.resolve(repoDir, args.outputDir ?? 'performance-baselines');
const runId = args.runId ?? `datavisool-interaction-engine-sustained-${new Date().toISOString().replace(/[:.]/g, '-')}`;

class ReservoirMetric {
    count = 0;

    sum = 0;

    max = 0;

    overBudgetCount = 0;

    reservoir = [];

    constructor(size, budgetMs) {
        this.size = Number.isFinite(size) && size > 0 ? Math.floor(size) : 8192;
        this.budgetMs = budgetMs;
    }

    record(value) {
        this.count += 1;
        this.sum += value;
        this.max = Math.max(this.max, value);

        if (this.budgetMs !== undefined && value > this.budgetMs) {
            this.overBudgetCount += 1;
        }

        if (this.reservoir.length < this.size) {
            this.reservoir.push(value);
            return;
        }

        const sampleIndex = Math.floor(Math.random() * this.count);

        if (sampleIndex < this.size) {
            this.reservoir[sampleIndex] = value;
        }
    }

    summary() {
        if (this.count === 0) {
            return {
                count: 0,
                avgMs: 0,
                p50Ms: 0,
                p95Ms: 0,
                p99Ms: 0,
                maxMs: 0,
                reservoirSize: this.size,
                reservoirCount: 0,
            };
        }

        const sorted = [...this.reservoir].sort((a, b) => a - b);

        return {
            count: this.count,
            avgMs: round(this.sum / this.count),
            p50Ms: round(percentile(sorted, 0.5)),
            p95Ms: round(percentile(sorted, 0.95)),
            p99Ms: round(percentile(sorted, 0.99)),
            maxMs: round(this.max),
            reservoirSize: this.size,
            reservoirCount: this.reservoir.length,
        };
    }

    budgetSummary() {
        return {
            budgetMs: this.budgetMs ?? 0,
            overBudgetCount: this.overBudgetCount,
            overBudgetRatio: this.count === 0 ? 0 : round(this.overBudgetCount / this.count),
        };
    }
}

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

const layers10000 = createLayers(10000);
const active1000 = layers10000.slice(0, 1000);
const activeElements = createElements(active1000);
const previewElement = createPreviewElement(createBounds(active1000));
const snapEngine = new SnapEngine();
const snapSession = snapEngine.start({
    activeLayers: active1000.slice(0, 1),
    candidateLayers: layers10000,
    candidateLayersVersion: 1,
    options: {mode: 'all', threshold: 5},
});
const dragController = new DragController({
    requestFrame: () => 1,
    cancelFrame: () => undefined,
});
dragController.start({
    hitId: active1000[0].id,
    activeLayers: active1000,
    activeElements,
    previewElement,
    snapCandidates: layers10000,
    snapCandidatesVersion: 1,
    snapOptions: {mode: 'nearby', threshold: 5},
    pointer: {x: 0, y: 0},
});
const resizeController = new ResizeController({
    requestFrame: () => 1,
    cancelFrame: () => undefined,
});
resizeController.startMany({
    layers: active1000,
    elements: activeElements,
    previewElement,
    handle: 'se',
    pointer: {x: 0, y: 0},
});
const rotateController = new RotateController({
    requestFrame: () => 1,
    cancelFrame: () => undefined,
});
rotateController.startMany({
    layers: active1000,
    elements: activeElements,
    previewElement,
    pointer: {x: 2000, y: 2000},
});
const engineContainer = createContainer();
const engineElements = createElements(layers10000);
const interactionEngine = new InteractionEngine({
    container: engineContainer,
    getScale: () => 1,
    getLayers: () => layers10000,
    getLayerIndexVersion: () => 1,
    getSelectedIds: () => ['layer-0'],
    getElementById: (id) => engineElements.get(id) ?? null,
    transformPreviewThreshold: 2,
    getTransformPreviewElement: () => previewElement,
});
interactionEngine.mount();
dispatchPointerdownCycle(engineContainer, layers10000[0]);

const result = {
    runId,
    createdAt: new Date().toISOString(),
    environment: {
        platform: `${process.platform} ${os.release()}`,
        node: process.version,
        cpu: `${os.cpus()[0]?.model ?? 'unknown'} x ${os.cpus().length}`,
    },
    config: {
        durationMs,
        sampleMs,
        reservoirSize,
        forceGc,
        workload: '10000 layers cached pointerdown, 1000 active preview drag/resize/rotate, snap-all resolve',
    },
    counters: {
        frames: 0,
        pointerdownCycles: 0,
        snapResolves: 0,
    },
    samples: [],
    metrics: {},
};

const frameMetric = new ReservoirMetric(reservoirSize, 4);
const pointerdownMetric = new ReservoirMetric(reservoirSize, 8);
const snapMetric = new ReservoirMetric(reservoirSize, 1);
const startTime = performance.now();
let lastSampleAt = startTime;
let lastProgressAt = startTime;
let frameIndex = 0;

while (performance.now() - startTime < durationMs) {
    const frameStart = performance.now();
    runInteractionFrame(frameIndex);
    frameMetric.record(performance.now() - frameStart);
    result.counters.frames += 1;

    if (frameIndex % 30 === 0) {
        const pointerStart = performance.now();
        dispatchPointerdownCycle(engineContainer, layers10000[frameIndex % layers10000.length]);
        pointerdownMetric.record(performance.now() - pointerStart);
        result.counters.pointerdownCycles += 1;
    }

    const snapStart = performance.now();
    snapEngine.resolve(snapSession, 300 + (frameIndex % 40), frameIndex % 17);
    snapMetric.record(performance.now() - snapStart);
    result.counters.snapResolves += 1;

    frameIndex += 1;

    const now = performance.now();

    if (now - lastSampleAt >= sampleMs) {
        result.samples.push(createRuntimeSample(now - startTime, frameMetric, pointerdownMetric, snapMetric));
        lastSampleAt = now;
    }

    if (now - lastProgressAt >= progressMs) {
        const elapsedSeconds = Math.round((now - startTime) / 1000);
        const percent = Math.min(100, Math.round((now - startTime) / durationMs * 100));
        console.log(`[sustained] ${elapsedSeconds}s/${Math.round(durationMs / 1000)}s ${percent}% frames=${result.counters.frames}`);
        lastProgressAt = now;
    }

    await immediate();
}

result.samples.push(createRuntimeSample(performance.now() - startTime, frameMetric, pointerdownMetric, snapMetric));
result.metrics = {
    frameCost: frameMetric.summary(),
    pointerdownCycle: pointerdownMetric.summary(),
    snapResolve: snapMetric.summary(),
    heap: summarizeHeap(result.samples),
    frameBudget: frameMetric.budgetSummary(),
};

dragController.cancel();
resizeController.cancel();
rotateController.cancel();
interactionEngine.destroy();

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

    for (let index = 0; index < count; index += 1) {
        layers.push({
            id: `layer-${index}`,
            x: 16 + (index % columns) * 72,
            y: 16 + Math.floor(index / columns) * 52,
            width: 48,
            height: 32,
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
        id: '__sustained_preview_bounds__',
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
        right: 8000,
        bottom: 8000,
        width: 8000,
        height: 8000,
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

function dispatchPointerdownCycle(container, layer) {
    const x = layer.x + 8;
    const y = layer.y + 8;
    container.dispatchEvent(createPointerEvent('pointerdown', x, y));
    window.dispatchEvent(createPointerEvent('pointerup', x, y));
}

function runInteractionFrame(index) {
    dragController.move({x: index % 240, y: index % 19});
    dragController.flush();

    resizeController.move({x: index % 320, y: index % 180});
    resizeController.flush();

    rotateController.move({x: 2000 + index % 360, y: 1800 + index % 240});
    rotateController.flush();
}

function createRuntimeSample(elapsedMs, frameMetric, pointerdownMetric, snapMetric) {
    if (forceGc && typeof globalThis.gc === 'function') {
        globalThis.gc();
    }

    return {
        elapsedMs: round(elapsedMs),
        frameCount: frameMetric.count,
        pointerdownCount: pointerdownMetric.count,
        snapResolveCount: snapMetric.count,
        heapUsedMb: round(process.memoryUsage().heapUsed / 1024 / 1024),
        frameCostP95Ms: frameMetric.summary().p95Ms,
        pointerdownP95Ms: pointerdownMetric.summary().p95Ms,
        snapResolveP95Ms: snapMetric.summary().p95Ms,
    };
}

function summarizeHeap(samples) {
    if (samples.length === 0) {
        return {
            startMb: 0,
            endMb: 0,
            deltaMb: 0,
            maxMb: 0,
        };
    }

    const heapValues = samples.map((sample) => sample.heapUsedMb);
    const start = heapValues[0];
    const end = heapValues[heapValues.length - 1];

    return {
        startMb: start,
        endMb: end,
        deltaMb: round(end - start),
        maxMb: Math.max(...heapValues),
    };
}

function percentile(sorted, point) {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * point) - 1));
    return sorted[index];
}

function round(value) {
    return Number(value.toFixed(3));
}

function immediate() {
    return new Promise((resolve) => setImmediate(resolve));
}

function renderMarkdown(data, jsonPath) {
    const metrics = data.metrics;
    const rows = [
        ['interactionFrame', metrics.frameCost.count, metrics.frameCost.avgMs, metrics.frameCost.p95Ms, metrics.frameCost.p99Ms, metrics.frameCost.maxMs, '4', metrics.frameBudget.overBudgetRatio <= 0.01 ? 'PASS' : 'FAIL'],
        ['cachedPointerdown', metrics.pointerdownCycle.count, metrics.pointerdownCycle.avgMs, metrics.pointerdownCycle.p95Ms, metrics.pointerdownCycle.p99Ms, metrics.pointerdownCycle.maxMs, '8', metrics.pointerdownCycle.p95Ms <= 8 ? 'PASS' : 'FAIL'],
        ['snapResolve', metrics.snapResolve.count, metrics.snapResolve.avgMs, metrics.snapResolve.p95Ms, metrics.snapResolve.p99Ms, metrics.snapResolve.maxMs, '1', metrics.snapResolve.p95Ms <= 1 ? 'PASS' : 'FAIL'],
    ];

    return [
        `# datavisool-interaction-engine 10min 持续性能测试 ${data.runId}`,
        '',
        `- 时间：${data.createdAt}`,
        `- 环境：${data.environment.platform}，${data.environment.node}，CPU ${data.environment.cpu}`,
        `- 时长：${Math.round(data.config.durationMs / 1000)} 秒`,
        `- 口径：${data.config.workload}`,
        `- 原始 JSON：${path.relative(repoDir, jsonPath)}`,
        '',
        '| 指标 | 样本 | 平均(ms) | P95(ms) | P99(ms) | 最大(ms) | 目标(ms) | 结果 |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
        ...rows.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} | ${row[4]} | ${row[5]} | ${row[6]} | ${row[7]} |`),
        '',
        '## 内存',
        '',
        `- 起始 heap：${metrics.heap.startMb} MB`,
        `- 结束 heap：${metrics.heap.endMb} MB`,
        `- heap delta：${metrics.heap.deltaMb} MB`,
        `- 最高 heap：${metrics.heap.maxMb} MB`,
        `- 帧超 4ms 比例：${metrics.frameBudget.overBudgetRatio}`,
        '',
        '## 采样',
        '',
        '| 时间(s) | heap(MB) | frame P95(ms) | pointerdown P95(ms) | snap P95(ms) |',
        '| ---: | ---: | ---: | ---: | ---: |',
        ...data.samples.map((sample) => `| ${round(sample.elapsedMs / 1000)} | ${sample.heapUsedMb} | ${sample.frameCostP95Ms} | ${sample.pointerdownP95Ms} | ${sample.snapResolveP95Ms} |`),
        '',
    ].join('\n');
}

function renderSummary(data) {
    return [
        'Summary:',
        `frames=${data.counters.frames}, pointerdown=${data.counters.pointerdownCycles}, snap=${data.counters.snapResolves}`,
        `frame p95=${data.metrics.frameCost.p95Ms}ms p99=${data.metrics.frameCost.p99Ms}ms max=${data.metrics.frameCost.maxMs}ms over4ms=${data.metrics.frameBudget.overBudgetRatio}`,
        `pointerdown p95=${data.metrics.pointerdownCycle.p95Ms}ms max=${data.metrics.pointerdownCycle.maxMs}ms`,
        `snap p95=${data.metrics.snapResolve.p95Ms}ms max=${data.metrics.snapResolve.maxMs}ms`,
        `heap start=${data.metrics.heap.startMb}MB end=${data.metrics.heap.endMb}MB delta=${data.metrics.heap.deltaMb}MB max=${data.metrics.heap.maxMb}MB`,
    ].join('\n');
}
