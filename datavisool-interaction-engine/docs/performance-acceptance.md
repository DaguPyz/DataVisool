# 主画布新引擎量化验收

## 目标

把 `datavisool-interaction-engine` 的核心画布交互先收敛成可重复运行、可失败退出的性能门禁，覆盖 500/1000 图层下的拖拽、缩放、旋转、框选、吸附、撤销重做。

## 命令

```bash
pnpm -F @datavisool/interaction-engine test:acceptance
```

快速调试可以降低样本：

```bash
pnpm -F @datavisool/interaction-engine run test:acceptance -- --iterations 20 --frameIterations 30
```

脚本会先构建 `dist`，再运行 Node + jsdom 微基准，输出 JSON 和 Markdown 到 `performance-baselines/`。任一 P95 指标超过目标线时进程退出码为 1。

## 验收矩阵

| 操作 | 500/1000 图层验收点 | 热路径目标 |
| --- | --- | --- |
| 拖拽 | 500/1000 active 图层 group drag | 240Hz pointer 输入聚合后，单帧 preview flush P95 <= 4ms；pointerup 批量真实 DOM 写入 500 <= 16ms、1000 <= 40ms |
| 缩放 | 500/1000 active 图层 group resize | 单帧 preview flush P95 <= 6ms；pointerup 批量真实 DOM 写入 500 <= 16ms、1000 <= 40ms |
| 旋转 | 500/1000 active 图层 group rotate | 单帧 preview flush P95 <= 6ms；pointerup 批量真实 DOM 写入 500 <= 16ms、1000 <= 40ms |
| 框选 | SelectionBoxController + SpatialIndex.queryRect | 1000 图层大范围框选 P95 <= 8ms |
| 吸附 | SnapEngine all-candidate 建线 + 二分 resolve | 1000 候选建线 P95 <= 3ms，resolve P95 <= 1ms |
| 撤销重做 | geometry patch commit/undo/redo | 1000 patch 栈 P95 <= 6ms |

## 性能口径

1. 拖拽、缩放、旋转必须走 transform preview。交互帧只更新 overlay/preview，不写 500/1000 个真实图层的 `width/height/rotate`。
2. 框选必须走结构化图层数据和空间索引，不允许从 DOM 反查全部 `.datavisool-app-comp-item`。
3. 吸附候选必须在 session start 冻结，resolve 只能做局部计算或二分查询。
4. 撤销重做只允许记录 geometry patch，不允许把完整项目 JSON 深拷贝放进热路径。

## 边界

这个验收脚本只覆盖核心算法和 DOM 写入门禁。它不能替代真实 WebView 验收，后续还必须补：

1. 真实编辑器 500/1000 图层拖拽 FPS、P95 frame、max frame。
2. 拖拽期间 React commit <= 3。
3. JS long task <= 5。
4. 30 分钟 heap 和 DOM 节点曲线不增长。
5. Windows WebView2 和 macOS WKWebView 双平台数据。
