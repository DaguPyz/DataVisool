# datavisool-interaction-engine 性能与安全优化落地方案

## 目标

本方案面向大型可视化编辑器场景，目标不是微调，而是把交互引擎改造成可承载万级图层、高频拖拽、批量缩放/旋转、吸附辅助线和长时间运行的高性能底座。

核心指标：

- 拖拽起手延迟：1000 图层低于 3ms，10000 图层低于 8ms。
- 高频拖拽：60FPS 稳定，单帧交互计算低于 4ms，DOM 写入低于 4ms。
- 批量缩放/旋转：选中 1000 个图层时不出现明显 GC 抖动。
- 吸附计算：nearby 模式单帧候选数控制在 200 以内，all 模式通过排序索引避免全量扫描。
- 内存：连续拖拽/缩放 60 秒后堆内存无持续线性增长。
- 安全：开发链路不暴露已知 Vite dev-server 文件读取与跨站访问风险。

## 当前结论

该引擎已经具备基础性能意识：拖拽 DOM 写入使用 `requestAnimationFrame` 合并，拖拽阶段主要写 `transform`，事件生命周期也有 `destroy()` 清理。

但它还不满足工业级高性能要求，主要瓶颈集中在：

- `pointerdown` 每次全量重建 `SpatialIndex`。
- `resize/rotate` 在每个 `pointermove` 直接全量计算并分配 `Map`。
- 交互式 `resize` 每帧写 `width/height`，可能触发布局和重绘风暴。
- `SnapEngine` 在大候选集下线性扫描吸附线。
- 高频路径对象分配偏多，长期运行存在 GC 抖动风险。
- Vite 开发依赖版本位于多个已公开 advisory 的历史影响范围。

## P0/P1/P2 实施顺序

| 优先级 | 任务 | 核心收益 | 风险 |
| --- | --- | --- | --- |
| P0 | 升级 Vite 并锁定开发服务器安全配置 | 消除已知开发链路漏洞 | 低 |
| P1 | `SpatialIndex` 常驻化与版本化 rebuild | 降低拖拽起手延迟 | 中 |
| P1 | `resize/rotate` 几何计算迁移到 rAF | 降低 CPU 与 GC 压力 | 中 |
| P1 | resize 交互期使用 transform preview | 降低 layout/paint 风暴 | 中 |
| P2 | `SnapEngine` 排序索引与二分查找 | 万级图层吸附可扩展 | 中 |
| P2 | 高频路径结构复用 | 降低长期 GC 抖动 | 中 |
| P2 | 性能监控与 benchmark 基线 | 防止伪优化与回归 | 低 |

## 1. P0：升级 Vite 与开发服务器安全配置

### 问题定位

文件：`package.json`

当前依赖：

```json
"vite": "^5.0.7"
```

Vite 5.0.x 历史版本命中过多个 dev-server 相关漏洞范围，包括：

- 跨站读取 dev-server 响应。
- `server.fs.deny` 绕过导致敏感文件读取。
- 特定构建格式下的 DOM Clobbering XSS 条件风险。

### 根因分析

这些风险不来自业务代码，而来自开发工具链历史版本的默认 CORS、WebSocket Origin 校验和文件访问边界缺陷。桌面项目通常会在本机启动 dev server，如果开发者同时访问恶意网页，本机源码或文件有被读取的风险。

### 性能影响

无直接运行时性能影响，但会影响开发机安全和私有部署交付可信度。

### 优化方案

1. 将 Vite 升级到当前可用安全版本，至少升级到 Vite 5 安全线的较新版本。
2. dev server 继续只绑定 `127.0.0.1`。
3. 避免在局域网中使用 `--host 0.0.0.0`。
4. 若必须局域网调试，需要显式配置可信 host/origin。

### 代码级建议

`package.json`：

```json
"vite": "^5.4.20"
```

`vite.config.ts`：

```ts
server: {
    host: '127.0.0.1',
    strictPort: false,
    cors: false,
},
preview: {
    host: '127.0.0.1',
},
```

### 架构级建议

把开发服务器安全配置纳入 workspace 统一规范，禁止项目私自开启公网 host。

### 是否值得优化

值得，P0。

### 预估收益

消除已知开发链路漏洞，降低源码、本机文件和私有部署资产泄露风险。

### 副作用

Vite 升级可能触发插件兼容问题，需要执行 `pnpm -F @datavisool/interaction-engine check/test/build`。

## 2. P1：SpatialIndex 常驻化，禁止 pointerdown 全量 rebuild

### 问题定位

文件：`src/core/InteractionEngine.ts`

当前 `pointerdown` 热路径会执行：

```ts
const layers = this.options.getLayers();
const layersById = new Map(layers.map((layer) => [layer.id, layer]));
const spatialIndex = new SpatialIndex({bucketSize: this.options.spatialIndexBucketSize});
spatialIndex.rebuild(layers);
```

### 根因分析

拖拽起手是交互链路最敏感路径。每次点击都全量 rebuild 会产生：

- O(N) 图层扫描。
- 大量 `LayerBox` clone。
- 旋转图层 bounds 计算。
- bucket key 字符串生成。
- `Map`/`Set` 分配。

当图层达到 5000-10000 时，用户会感知到拖拽起手卡顿。

### 性能影响

- CPU：`pointerdown` 单次 O(N)。
- 内存：每次点击分配新的索引结构。
- GC：高频点击和框选时产生短生命周期对象。
- FPS：拖拽第一帧可能错过 16.67ms 帧预算。

### 优化方案

将 `SpatialIndex` 作为 `InteractionEngine` 常驻成员，只在图层数据版本变化时 rebuild。

### 代码级实现建议

`InteractionEngineOptions` 增加版本接口：

```ts
getLayersVersion?: () => number;
```

`InteractionEngine` 增加成员：

```ts
private readonly spatialIndex = new SpatialIndex({
    bucketSize: this.options.spatialIndexBucketSize,
});

private indexedLayersVersion: number | null = null;
private indexedLayersRef: LayerBox[] | null = null;
```

新增方法：

```ts
private ensureSpatialIndex(layers: LayerBox[]) {
    const version = this.options.getLayersVersion?.();

    if (
        version !== undefined
        && this.indexedLayersVersion === version
    ) {
        return this.spatialIndex;
    }

    if (
        version === undefined
        && this.indexedLayersRef === layers
    ) {
        return this.spatialIndex;
    }

    this.spatialIndex.rebuild(layers);
    this.indexedLayersVersion = version ?? null;
    this.indexedLayersRef = layers;

    return this.spatialIndex;
}
```

`pointerdown` 改为：

```ts
const layers = this.options.getLayers();
const layersById = this.resolveLayersById(layers);
const spatialIndex = this.ensureSpatialIndex(layers);
```

### 架构级优化建议

更彻底的方案是暴露增量索引 API：

```ts
engine.updateLayerIndex(layer);
engine.removeLayerIndex(id);
engine.rebuildLayerIndex(layers);
```

业务层在图层增删改时同步索引，而不是交互时临时 rebuild。

### 是否值得优化

值得，P1。

### 预估收益

- 10000 图层点击命中从 O(N) 降到 O(bucket candidates)。
- 拖拽起手延迟可下降一个数量级。
- 减少点击/框选过程中的短生命周期内存分配。

### 副作用

需要保证索引与业务图层一致。必须补充测试：

- 图层新增后可命中。
- 图层移动后旧位置不可命中。
- 图层删除后不可命中。
- 版本不变时不会 rebuild。

## 3. P1：resize/rotate 几何计算迁移到 rAF

### 问题定位

文件：

- `src/core/ResizeController.ts`
- `src/core/RotateController.ts`

当前 `move()` 在每个 `pointermove` 中直接计算：

```ts
session.latestRects = resolveResizeRects(session, pointer, Boolean(options.keepRatio));
```

```ts
session.latestRotate = resolveRotate(session, pointer, Boolean(options.snapAngle));
session.latestBoxes = resolveRotateBoxes(session, session.latestRotate);
```

### 根因分析

DOM 写入虽然进入了 rAF，但几何计算没有被 rAF 合并。高刷新率输入设备可能产生 120-240Hz pointer event，而屏幕只有 60Hz。多出来的计算不会显示，只会消耗 CPU 和制造 GC。

### 性能影响

- CPU：无效几何计算次数可达到实际渲染帧数的 2-4 倍。
- 内存：每个 move 都创建 `Map` 和大量 rect/box 对象。
- GC：批量 resize/rotate 长时间操作时会产生明显抖动。

### 优化方案

`move()` 只缓存最新输入，`flush()` 中统一计算并写 DOM。

### 代码级实现建议

`ResizeSession` 增加：

```ts
pendingPointer: Point | null;
pendingKeepRatio: boolean;
```

`move()`：

```ts
move(pointer: Point, options: ResizeMoveOptions = {}) {
    const session = this.session;

    if (!session) {
        return false;
    }

    session.pendingPointer = pointer;
    session.pendingKeepRatio = Boolean(options.keepRatio);
    this.scheduleFlush();

    return true;
}
```

`flush()`：

```ts
flush() {
    const session = this.session;

    if (!session) {
        return 0;
    }

    if (session.pendingPointer) {
        session.latestRects = resolveResizeRects(
            session,
            session.pendingPointer,
            session.pendingKeepRatio,
        );
        session.moved = session.moved || hasMoved(session);
    }

    const writeCount = this.transformWriter.writeResizeMany(...);
    this.perfMonitor.recordFrameFlush();
    this.perfMonitor.recordDomWrites(writeCount);

    return writeCount;
}
```

`end()` 必须同步处理最后一次 pointer：

```ts
if (pointer) {
    session.pendingPointer = pointer;
    session.pendingKeepRatio = Boolean(options.keepRatio);
}

this.flush();
```

`RotateController` 使用同样模式：

```ts
pendingPointer: Point | null;
pendingSnapAngle: boolean;
```

### 架构级优化建议

交互控制器统一为三阶段：

1. Input：事件只记录输入。
2. Compute：rAF 内计算最终几何。
3. Commit：pointerup 输出业务 patch。

### 是否值得优化

非常值得，P1。

### 预估收益

在 240Hz pointer 输入下，几何计算次数最多减少 75%。选中 1000 个图层时 GC 压力显著下降。

### 副作用

代码状态机会更复杂。必须测试：

- `pointerup` 前没有 rAF flush 时仍提交最终几何。
- 快速 move + up 不丢最后一帧。
- cancel 能恢复初始 DOM。

## 4. P1：resize 交互期改为 transform preview

### 问题定位

文件：`src/dom/TransformWriter.ts`

当前 resize 每帧写：

```ts
entry.element.style.transform = ...
entry.element.style.width = ...
entry.element.style.height = ...
```

### 根因分析

`width/height` 会触发布局和重绘。对于数据可视化组件，内部可能包含 DOM、Canvas、SVG、图表库实例。交互过程中每帧改真实宽高，会把组件内部 layout/paint 成本全部拉进拖拽帧。

### 性能影响

- CPU：布局计算增加。
- GPU：重绘面积增加。
- 内存：复杂组件可能触发内部缓存重建。
- FPS：批量 resize 或复杂图表 resize 容易掉帧。

### 优化方案

交互期只写 `transform` 进行视觉预览，pointerup 后再提交真实 `width/height`。

### 代码级实现建议

新增预览写入：

```ts
writeResizePreview(entry: TransformEntry, rect: Rect) {
    const scaleX = entry.box.width === 0 ? 1 : rect.width / entry.box.width;
    const scaleY = entry.box.height === 0 ? 1 : rect.height / entry.box.height;

    entry.element.style.transform = toTransformWithScale(
        rect.x,
        rect.y,
        entry.box.rotate,
        scaleX,
        scaleY,
    );

    return 1;
}
```

新增 transform helper：

```ts
function toTransformWithScale(
    x: number,
    y: number,
    rotate: number,
    scaleX: number,
    scaleY: number,
) {
    return `translate(${formatNumber(x)}px, ${formatNumber(y)}px) rotate(${formatNumber(rotate)}deg) scale(${formatNumber(scaleX)}, ${formatNumber(scaleY)})`;
}
```

`ResizeController.flush()` 使用 preview：

```ts
this.transformWriter.writeResizePreviewMany(...)
```

`ResizeController.end()` 返回 patch 后，由业务层更新真实状态，再调用：

```ts
engine.applyLayerGeometry(patches, {writeDom: true});
```

### 架构级优化建议

按组件类型决定交互策略：

| 组件类型 | 交互期策略 | 提交策略 |
| --- | --- | --- |
| 普通 DOM | transform preview | pointerup 写真实宽高 |
| Canvas/WebGL | 容器 transform preview | idle/rAF 后重建内部尺寸 |
| 文本/表格 | transform preview | pointerup reflow |
| 需要实时像素准确组件 | opt-in 实时 resize | 限制选中数量 |

### 是否值得优化

值得，P1。

### 预估收益

批量缩放复杂组件时，layout/paint 成本显著下降，FPS 更稳定。

### 副作用

缩放过程中内容会被视觉拉伸，和最终布局可能有差异。需要产品侧接受或按组件类型启用。

## 5. P2：SnapEngine 排序索引与二分查找

### 问题定位

文件：`src/core/SnapEngine.ts`

当前吸附查找：

```ts
for (const moving of movingLines) {
    for (const target of candidateLines) {
        ...
    }
}
```

### 根因分析

每个图层会产生 6 条吸附线。`snapMode: all` 下，10000 图层约 60000 条吸附线。移动过程中每帧全量扫描会占用大量 CPU。

### 性能影响

- CPU：O(movingLines * candidateLines)。
- 内存：guide 收集阶段创建对象。
- FPS：开启 all snap 时大画布拖拽容易掉帧。

### 优化方案

`SnapSession.start()` 时将候选线按 value 排序，resolve 时通过二分查找阈值范围。

### 代码级实现建议

扩展 `SnapSession`：

```ts
candidateLinesXByValue: SnapLine[];
candidateLinesYByValue: SnapLine[];
```

构建：

```ts
candidateLinesXByValue: candidateLines
    .filter((line) => line.axis === 'x')
    .sort((a, b) => a.value - b.value),
```

查找：

```ts
function findBestSnapSorted(
    movingLines: SnapLine[],
    sortedCandidateLines: SnapLine[],
    offset: number,
    crossOffset: number,
    threshold: number,
) {
    let best: BestSnap | null = null;

    for (const moving of movingLines) {
        const movingValue = moving.value + offset;
        const start = lowerBound(sortedCandidateLines, movingValue - threshold);
        const end = upperBound(sortedCandidateLines, movingValue + threshold);

        for (let index = start; index < end; index += 1) {
            const target = sortedCandidateLines[index];
            ...
        }
    }

    return best;
}
```

### 架构级优化建议

默认策略：

- 大画布默认 `snapMode: nearby`。
- `snapMode: all` 仅在图层数较小或用户显式开启时使用。
- candidateRange 随 scale 自适应，避免缩小时候选爆炸。

### 是否值得优化

P2。若业务要求万级图层开启全局吸附，则升级为 P1。

### 预估收益

吸附查找从 O(N) 降到 O(logN + k)，大候选集场景 CPU 明显下降。

### 副作用

实现复杂度提升，需要补齐排序稳定性、同 value 多线、阈值边界测试。

## 6. P2：高频路径结构复用，降低 GC 抖动

### 问题定位

文件：

- `src/core/DragController.ts`
- `src/core/ResizeController.ts`
- `src/core/RotateController.ts`
- `src/dom/TransformWriter.ts`

高频路径存在：

- `new Map(...)`
- `entries.map(...)`
- `{...pointer}`
- `{...layer}`
- 每帧生成 transform 字符串

### 根因分析

这些分配单次不大，但高频交互持续几十秒时，会形成短生命周期对象洪峰，触发 GC pause。

### 性能影响

- 内存：短生命周期对象数量高。
- GC：minor GC 频繁。
- FPS：GC pause 导致帧间隔抖动。

### 优化方案

将 session 内部结构改为可复用容器。

### 代码级实现建议

`ResizeSession`：

```ts
latestRects: Map<string, Rect>;
flushItems: Array<{entry: TransformEntry; rect: Rect}>;
```

每帧只更新已有 rect：

```ts
const rect = session.latestRects.get(layer.id);

if (rect) {
    rect.x = nextX;
    rect.y = nextY;
    rect.width = nextWidth;
    rect.height = nextHeight;
}
```

`TransformWriter` 增加跳过无变化写入：

```ts
if (entry.element.style.transform !== nextTransform) {
    entry.element.style.transform = nextTransform;
    writeCount += 1;
}
```

### 架构级优化建议

高频路径禁止无意义对象扩散，采用“session 初始化分配，交互中复用，结束释放”的内存模型。

### 是否值得优化

P2。大批量选中和长时间操作场景值得。

### 预估收益

降低 GC 抖动，提高帧时间稳定性。

### 副作用

可读性下降，容易出现旧数据残留，需要单测覆盖 cancel/end/restart。

## 7. P2：性能监控与基准测试

### 问题定位

文件：`src/core/InteractionPerfMonitor.ts`

当前只统计：

- frameFlushes
- domWrites
- dragCommits
- dragCancels

这不足以判断真实瓶颈。

### 根因分析

工业级性能优化必须量化 CPU、DOM 写入、计算成本、候选数量和帧预算，不能只看调用次数。

### 性能影响

缺乏指标会导致伪优化，无法防止回归。

### 优化方案

扩展 perf snapshot：

```ts
export interface InteractionPerfSnapshot {
    frameFlushes: number;
    domWrites: number;
    dragCommits: number;
    dragCancels: number;
    maxFrameCostMs: number;
    lastFrameCostMs: number;
    maxComputeCostMs: number;
    lastComputeCostMs: number;
    maxDomWriteCostMs: number;
    lastDomWriteCostMs: number;
    droppedFrameCount: number;
    activeLayerCount: number;
    snapCandidateCount: number;
}
```

### 架构级优化建议

新增 benchmark：

- 100 图层拖拽 5 秒。
- 1000 图层拖拽 5 秒。
- 10000 图层点击命中和框选。
- 1000 图层批量 resize。
- 1000 图层批量 rotate。
- 10000 图层 nearby snap。
- 10000 图层 all snap。

### 验收阈值

| 场景 | 指标 |
| --- | --- |
| 1000 图层拖拽 | 平均帧成本低于 8ms |
| 10000 图层 pointerdown | 命中计算低于 8ms |
| 1000 图层 resize | 单帧 JS 计算低于 6ms |
| 10000 图层 nearby snap | 候选数低于 200 |
| 连续交互 60 秒 | 堆内存无持续线性增长 |

### 是否值得优化

值得，P2。

### 预估收益

能持续发现性能回归，避免凭感觉优化。

### 副作用

监控本身必须低开销，生产默认关闭。

## 建议拆分任务

### Sprint 1：安全与起手延迟

1. 升级 Vite。
2. 增加 `getLayersVersion`。
3. `SpatialIndex` 常驻化。
4. 补充索引版本测试。
5. 建立 pointerdown benchmark。

### Sprint 2：高频交互计算合并

1. Resize pending pointer。
2. Rotate pending pointer。
3. `end()` 同步 flush 最后一帧。
4. 补充快速 move + up 测试。
5. 建立 240Hz pointer 模拟测试。

### Sprint 3：DOM 写入降级

1. 新增 resize preview writer。
2. 支持组件级实时 resize opt-in。
3. pointerup 后提交真实几何。
4. 补充视觉和 DOM 状态测试。

### Sprint 4：吸附与 GC 优化

1. `SnapEngine` 排序索引。
2. nearby 默认策略。
3. 高频路径结构复用。
4. 扩展 perf monitor。
5. 建立 CI 性能基线。

## 最终验收命令

基础正确性：

```bash
pnpm -F @datavisool/interaction-engine check
pnpm -F @datavisool/interaction-engine test
pnpm -F @datavisool/interaction-engine build
```

性能基线建议新增：

```bash
pnpm -F @datavisool/interaction-engine test:perf
```

## 参考安全公告

- https://github.com/vitejs/vite/security/advisories/GHSA-vg6x-rcgg-rjx6
- https://github.com/vitejs/vite/security/advisories/GHSA-x574-m823-4x7w
- https://github.com/vitejs/vite/security/advisories/GHSA-64vr-g452-qvp3
