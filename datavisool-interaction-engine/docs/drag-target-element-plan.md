# 多元素命中拖拽功能规划

## 功能边界

第一功能直接实现“命中目标后拖拽多个元素”的闭环。单元素拖拽不单独设计，它只是多元素拖拽中 `activeIds.length === 1` 的特例。

这里的“多元素”指：用户 pointerdown 命中一个可拖拽图层后，引擎根据当前选中集合决定本次拖拽的 active ids，并在拖拽过程中批量更新这些目标元素的 DOM transform。

本阶段做：

1. 原生 pointer 事件注册和销毁。
2. 命中目标检测。
3. 当前选中集合解析。
4. 多元素拖拽 session。
5. `requestAnimationFrame` 合帧。
6. 批量写 active elements 的 `style.transform`。
7. `pointerup` 后一次性提交多个最终位移 patch。
8. 单元素拖拽作为多元素拖拽特例覆盖。
9. 基础性能计数器。

本阶段不做：

1. React 适配层。
2. MobX 状态联动。
3. 吸附。
4. 框选生成多选。
5. 分组。
6. resize。
7. rotate。
8. 复杂 overlay 控制点。
9. 多选 bbox 控制框。

说明：本阶段会读取宿主传入的 `getSelectedIds()`，但不实现框选和图层树多选规则。选中集合来自宿主，拖拽引擎只负责“拖动这些 ids”。

## 1. 问题定位

当前 1000 图层拖拽基线已经跌到 39.1 FPS，p95 帧耗时 50.4ms，最长帧 66.8ms。多元素命中拖拽是整个替换方案的核心热路径，必须先证明：

```txt
pointerdown -> resolve active ids -> pointermove -> RAF -> batch DOM transform -> pointerup commit
```

这条链路可以脱离 React、MobX、Moveable 和 Selecto 独立运行。

## 2. 根因分析

旧链路的主要风险来自通用交互库和宿主状态系统叠加：

1. pointermove 期间可能触发 React commit。
2. Moveable 内部有通用能力判断和 guideline 计算。
3. 选中态、右侧面板、历史记录等业务副作用容易混入拖拽过程。
4. DOM 几何读取如果出现在 pointermove，会触发 layout 或放大主线程压力。
5. 大 JSON 图层配置如果在移动过程中 diff/clone，会放大 GC 和 long task。

第一阶段必须把所有业务副作用推迟到 `pointerup`，拖拽过程中只允许读取 session 内存快照并写目标 DOM transform。

## 3. 性能影响

多元素拖拽属于 P0 热路径。每一帧预算只有 16.7ms，其中 JS 计算理想上要控制在 2ms 内，给浏览器 layout/paint/composite 留足空间。

本阶段性能约束：

| 指标 | 目标 |
| --- | ---: |
| 500 图层拖拽 FPS | >= 60 |
| 1000 图层拖拽 FPS | >= 55 |
| pointermove JS 耗时 | < 2ms/frame |
| 拖拽期间 React commit | 0 |
| 拖拽期间 MobX action | 0 |
| 每帧 DOM 写入次数 | activeIds.length |
| pointermove 全量 DOM 查询 | 0 |
| pointermove `getBoundingClientRect` | 0 |
| pointermove JSON 序列化 | 0 |

多元素拖拽的额外约束：

| active 元素数 | 每帧 JS 目标 |
| ---: | ---: |
| 1 | < 1ms |
| 10 | < 2ms |
| 50 | < 5ms |

超过 50 个 active 元素时仍按同一架构处理，但验收应单独建立大批量拖拽基线，不能用单元素指标偷换。

## 4. 优化方案

采用纯 TypeScript 核心引擎，不引入 React。

推荐首批模块：

```txt
src/core/
  types.ts
  Coordinate.ts
  PointerSession.ts
  HitTest.ts
  DragController.ts
  InteractionEngine.ts
  InteractionPerfMonitor.ts
src/dom/
  DomElementRegistry.ts
  TransformWriter.ts
```

首阶段数据流：

```txt
InteractionEngine.mount
  -> container.addEventListener("pointerdown")

pointerdown
  -> Coordinate.clientToCanvas
  -> HitTest.findTarget
  -> ActiveTargetResolver.resolve
  -> DragController.start
  -> cache active elements / start boxes / start pointer

pointermove
  -> Coordinate.clientToCanvas
  -> DragController.move
  -> update pending dx/dy
  -> schedule RAF

RAF
  -> TransformWriter.writeBatchTranslate
  -> perfMonitor.recordDomWrites

pointerup
  -> DragController.end
  -> emit onDragCommit
  -> cleanup session
```

## 5. 代码级实现建议

### 核心类型

```ts
export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LayerBox extends Rect {
    id: string;
    rotate: number;
    lock: boolean;
    hide: boolean;
    order?: number;
}

export interface DragCommitItem {
    id: string;
    x: number;
    y: number;
}
```

### Engine 入参

```ts
export interface InteractionEngineOptions {
    container: HTMLElement;
    getScale: () => number;
    getLayers: () => LayerBox[];
    getSelectedIds: () => string[];
    getElementById: (id: string) => HTMLElement | null;
    onSelect?: (ids: string[]) => void;
    onDragCommit?: (items: DragCommitItem[]) => void;
}
```

### Active ids 解析

```ts
function resolveDragActiveIds(hitId: string, selectedIds: string[]): string[] {
    return selectedIds.includes(hitId) ? selectedIds : [hitId];
}
```

规则：

1. pointerdown 命中已选中图层：拖拽整个 selectedIds。
2. pointerdown 命中未选中图层：本次只拖拽 hitId，并触发 `onSelect?.([hitId])`。
3. hidden 图层不可命中。
4. locked 图层可选中，但不进入 active drag ids。
5. 如果 active ids 为空，不启动 drag session。

### Session 快照

```ts
interface DragSession {
    hitId: string;
    activeIds: string[];
    activeElements: Map<string, HTMLElement>;
    startPointer: Point;
    currentPointer: Point;
    startBoxes: Map<string, LayerBox>;
    latestDx: number;
    latestDy: number;
    rafId: number | null;
    moved: boolean;
    startedAt: number;
}
```

### 禁止写法

拖拽热路径禁止：

```ts
// pointermove 禁止
setState(...)
JSON.stringify(...)
document.querySelectorAll(...)
element.getBoundingClientRect()
options.getLayers()
options.onDragCommit(...)
```

### DOM 写入

第一阶段只写 transform，不写 left/top。每个 active element 使用自己的 startBox 叠加同一组 dx/dy：

```ts
const x = startBox.x + dx;
const y = startBox.y + dy;
element.style.transform = `translate(${x}px, ${y}px) rotate(${startBox.rotate}deg)`;
```

后续接入真实设计器时，需要和现有图层 transform 规则对齐。如果现有 DOM 已经使用 `translate(x, y) rotate(...)`，直接覆盖；如果由 `left/top + transform` 组合表达，则第一阶段必须先定义 `TransformWriter` 兼容策略，不能在 controller 内硬编码。

## 6. 架构级优化建议

1. `datavisool-interaction-engine` 保持纯 TS 包，不依赖 React、MobX、Ant Design、Tauri。
2. `InteractionEngine` 只管理事件生命周期和 controller 编排。
3. `DragController` 只处理拖拽 session，不直接访问业务 store。
4. `TransformWriter` 统一管理 DOM 写入，后续便于统计、回滚和适配 transform 表达式。
5. `onDragCommit` 是唯一业务出口，宿主应用在这里调用历史记录和 MobX 更新。
6. 命中检测第一版可以线性扫描 `LayerBox[]`，但只允许发生在 pointerdown。pointermove 不允许扫描。
7. 后续引入 `SpatialIndex` 时只替换 `HitTest` 的候选获取，不改变 `DragController`。
8. `ActiveTargetResolver` 独立出来，后续接入 shift 追加、多选框选、分组顶层规则时不会污染拖拽热路径。

## 7. 是否值得优化

非常值得。

这是自研交互引擎的第一条核心链路。直接从多元素拖拽建模，可以避免先写单元素 controller、再重构成 group drag 的二次成本。只要 active ids 是数组，单元素和多元素共享同一套 session、RAF、commit 边界。

## 8. 预估收益

| 场景 | 当前基线 | 阶段目标 | 收益 |
| --- | ---: | ---: | --- |
| 500 图层拖拽 | 60.2 FPS | 60 FPS 稳定 | 保持满帧，降低 long task 风险 |
| 1000 图层拖拽 | 39.1 FPS | 55 FPS+ | 交互卡顿明显降低 |
| React commit | 220+ | 0-3 | 拖拽热路径脱离 React |
| JS long task | 139 | 明显下降 | 主线程压力下降 |
| 单元素/多元素代码路径 | 分散在通用库 | 统一数组 session | 减少后续重构 |

## 9. 优化优先级

P0。

理由：

1. 它直接决定 1000 图层编辑是否可用。
2. 它是替换 Moveable 的最小可验证闭环。
3. 它会固定后续 resize、rotate、多选拖拽的架构边界。
4. 当前模块刚建立，越早固定纯 TS 热路径，后续返工越少。
5. 多元素拖拽直接覆盖单元素拖拽，不增加本质复杂度。

## 10. 是否存在副作用

存在，主要是兼容风险：

1. 批量写 `style.transform` 可能覆盖宿主现有 transform 表达式。
2. pointer capture 处理不当会导致拖拽中断或鼠标释放丢失。
3. 拖拽过程中 DOM 显示位置和业务 store 位置会短暂不一致。
4. 如果 pointerup commit 失败，DOM 需要批量回滚到 startBoxes。
5. lock/hide 判断如果与宿主规则不一致，会出现旧库和新库行为差异。
6. 只做 axis-aligned 命中时，旋转元素边缘命中可能与旧实现不完全一致。
7. activeIds 数量较大时，每帧 DOM 写入会线性增长，必须量化 10/50/100 active 元素场景。

规避策略：

1. 第一阶段只在 demo 和受控实验页面验证。
2. 接入主应用时必须通过 `LCP_INTERACTION_ENGINE=native` 开关启用。
3. `TransformWriter` 必须支持 `resetMany(entries)`。
4. `pointerup`、`pointercancel`、`lostpointercapture` 都必须清理 session。
5. 在真实接入前补充 transform 表达式兼容测试。

## MVP 验收清单

1. `pointerdown` 命中最高 order 的可见图层。
2. 命中未选中图层时，active ids 为 `[hitId]`。
3. 命中已选中图层时，active ids 为 `selectedIds`。
4. locked 图层可命中但不可拖拽。
5. 拖拽过程中所有 active 元素跟手移动。
6. 拖拽过程中不调用 `onDragCommit`。
7. 拖拽过程中不重新读取 `getLayers`。
8. 一帧内多次 pointermove 只触发一次批量 DOM flush。
9. `pointerup` 只提交一次最终坐标数组。
10. `pointercancel` 可以批量回滚 DOM。
11. destroy 后事件全部解绑。
12. Vitest 覆盖 session、RAF 合帧、commit、cancel、destroy。

## 第一批测试规划

单元测试：

1. `Coordinate.clientToCanvas` 按 scale 转换坐标。
2. `HitTest.findTarget` 按 order 命中。
3. `HitTest.findTarget` 跳过 hidden。
4. `ActiveTargetResolver.resolve` 命中已选中图层时返回 selected ids。
5. `ActiveTargetResolver.resolve` 命中未选中图层时返回 hitId。
6. `ActiveTargetResolver.resolve` 过滤 locked 图层。
7. `DragController.start` 缓存 startBoxes 和 activeElements。
8. `DragController.move` 只更新 pending delta。
9. `DragController.flush` 批量写 transform。
10. `DragController.end` 输出最终 `DragCommitItem[]`。
11. `DragController.cancel` 批量回滚 transform。

集成测试：

1. 创建 1000 个虚拟 layer box，pointerdown 只命中目标。
2. 命中 selectedIds 中任意一个图层后，拖拽整个 selectedIds。
3. 连续派发 100 次 pointermove，验证 DOM flush 次数小于等于 RAF flush 次数。
4. 每次 flush 的 DOM 写入次数等于 activeIds.length。
5. pointerup 后验证 commit 只发生一次，且 items.length 等于 activeIds.length。

后续性能基准：

1. 500/1000/2000 图层 demo 页面。
2. 使用 `performance.now()` 统计 pointermove、RAF flush、commit 耗时。
3. 输出 `avg/p95/max`。
4. 后续接入浏览器自动化工具执行拖拽并采样 FPS。

## 推荐实施顺序

1. 建 `core/types.ts`，固定 `Point/Rect/LayerBox/DragCommitItem`。
2. 建 `dom/TransformWriter.ts`，先实现批量 translate 写入和 resetMany。
3. 建 `core/HitTest.ts`，只做 pointerdown 线性命中。
4. 建 `core/ActiveTargetResolver.ts`，解析 hitId、selectedIds、locked 状态。
5. 建 `core/DragController.ts`，实现多元素 session、RAF、commit、cancel。
6. 建 `core/InteractionEngine.ts`，负责事件注册、销毁、pointer capture。
7. 给 demo 增加 1/10/50 active 元素拖拽实验页面。
8. 补 Vitest 单元测试和 jsdom 集成测试。
9. 再考虑接入 `datavisool-app` 的 native 开关。
