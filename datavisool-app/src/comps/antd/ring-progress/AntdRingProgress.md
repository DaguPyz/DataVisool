<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# AntdRingProgress 组件说明

## 组件标识

```json
{
  "componentType": "AntdRingProgress",
  "componentName": "Antd迷你环图"
}
```

## 组件选择

```json
{
  "componentType": "AntdRingProgress",
  "componentName": "Antd迷你环图",
  "description": "进度环组件，用于展示单个 0 到 1 的进度或完成率，适用于环形进度、完成率、单指标占比、任务进度展示。",
  "nativeCapabilities": "进度环、背景轨道、完整图例、数据标签、中心统计文本、提示框",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。最终 `data.value` 必须是 0 到 1 之间的数字，表示环形进度；不接受对象或数组。静态数据最小示例为 `{"sourceType":"static","staticData":{"value":0.7}}`。

### 配置字段

AI 可以生成的 `stylePatch` 顶层只能包含 `style`，其 `style` 对象层级如下。`statistic` 可以直接设为 `false` 隐藏。

下列 `<g2plot-…>` 是公共配置片段标识。运行前，相关片段会经检索注入 Agent 上下文；应按同名片段解释该键的可用配置：对象配置项使用片段内的字段，单个配置项只取片段中的同名字段。生成 `stylePatch` 时必须输出具体字段和值，遵守本组件的差异说明与校验规则，不得输出片段标识。

```json
{
  "style": {
    "padding": "<g2plot-canvas>",
    "appendPadding": "<g2plot-canvas>",
    "limitInPlot": "<g2plot-canvas>",
    "supportCSSTransform": "<g2plot-canvas>",
    "radius": "number: 0-1，设置外环半径",
    "innerRadius": "number: 0-1，设置内环半径",
    "color": "color | [color, color]，设置进度色和背景色",
    "progressStyle": {
      "fill": "color，设置进度环填充色",
      "fillOpacity": "number: 0-1，设置进度环填充透明度",
      "stroke": "color，设置进度环描边色",
      "lineWidth": "number: 0-10，设置进度环描边宽度",
      "lineDash": "array，设置进度环描边虚线，例如 [4, 4]",
      "lineOpacity": "number: 0-1，设置进度环描边透明度",
      "strokeOpacity": "number: 0-1，设置进度环边框透明度",
      "opacity": "number: 0-1，设置进度环整体透明度",
      "lineCap": "butt | round | square，设置进度环端点样式",
      "shadowColor": "color，设置进度环阴影颜色",
      "shadowBlur": "number: 0-100，设置进度环阴影模糊",
      "shadowOffsetX": "number: -100-100，设置进度环阴影水平偏移",
      "shadowOffsetY": "number: -100-100，设置进度环阴影垂直偏移",
      "cursor": "string，设置鼠标样式"
    },
    "statistic": "<g2plot-statistic>"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "AntdRingProgress",
  "forbiddenPaths": ["base","data","filter","style.percent","style.legend","style.label","style.tooltip"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "hex-or-g2-gradient-with-hex-stops",
  "allowedStylePaths": [
    {"path":"style.padding","type":"numberOrArrayOrAuto","min":0,"max":500},
    {"path":"style.appendPadding","type":"numberOrArray","min":0,"max":500},
    {"path":"style.limitInPlot","type":"boolean"},
    {"path":"style.supportCSSTransform","type":"boolean"},
    {"path":"style.radius","type":"number","min":0,"max":1},
    {"path":"style.innerRadius","type":"number","min":0,"max":1},
    {"path":"style.color","type":"color"},
    {"path":"style.progressStyle.fill","type":"color"},
    {"path":"style.progressStyle.fillOpacity","type":"number","min":0,"max":1},
    {"path":"style.progressStyle.stroke","type":"color"},
    {"path":"style.progressStyle.lineWidth","type":"number","min":0,"max":20},
    {"path":"style.progressStyle.lineDash","type":"array"},
    {"path":"style.progressStyle.lineOpacity","type":"number","min":0,"max":1},
    {"path":"style.progressStyle.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.progressStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.progressStyle.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.progressStyle.shadowColor","type":"color"},
    {"path":"style.progressStyle.shadowBlur","type":"number","min":0,"max":100},
    {"path":"style.progressStyle.shadowOffsetX","type":"number","min":-100,"max":100},
    {"path":"style.progressStyle.shadowOffsetY","type":"number","min":-100,"max":100},
    {"path":"style.progressStyle.cursor","type":"string"},
    {"path":"style.statistic","type":"boolean","allowFalse":true},
    {"path":"style.statistic.title","type":"boolean","allowFalse":true},
    {"path":"style.statistic.title.content","type":"string"},
    {"path":"style.statistic.title.offsetX","type":"number","min":-100,"max":100},
    {"path":"style.statistic.title.offsetY","type":"number","min":-100,"max":100},
    {"path":"style.statistic.title.style.color","type":"color"},
    {"path":"style.statistic.title.style.fill","type":"color"},
    {"path":"style.statistic.title.style.fontSize","type":"numberOrString"},
    {"path":"style.statistic.title.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.statistic.content","type":"boolean","allowFalse":true},
    {"path":"style.statistic.content.content","type":"string"},
    {"path":"style.statistic.content.offsetX","type":"number","min":-100,"max":100},
    {"path":"style.statistic.content.offsetY","type":"number","min":-100,"max":100},
    {"path":"style.statistic.content.style.color","type":"color"},
    {"path":"style.statistic.content.style.fill","type":"color"},
    {"path":"style.statistic.content.style.fontSize","type":"numberOrString"},
    {"path":"style.statistic.content.style.fontWeight","type":"number","min":100,"max":900}
  ]
}
```

### 限制与校验

**参考依据**

- G2Plot 进度环图官方文档：https://g2plot.antv.antgroup.com/api/plots/ring-progress
- 本组件基于 G2Plot `RingProgressOptions`，当前数值由 `style.percent` 和 `data.value` 表示。

**通用限制**

纯样式优化不能修改 `base`、`data`、`filter` 或图层布局。数据修改任务在读取组件数据说明书后，可以同时修改数据与字段映射，但最终数据属性必须与映射一致。纯样式优化不得修改 `percent`，该字段代表指标数值。函数型配置不允许生成，例如 `formatter`、`callback`、`customContent`；坐标轴刻度标签内容改写需要数据或安全 formatter 能力，当前仅支持标题文本和标签样式/布局调整。

**进度环语义约束**

- `percent` 是业务数值，AI 不得修改。
- 进度环不支持通用 `legend`、`label`、`tooltip` 和 `data` 配置；`color` 只允许按 `RingProgressOptions` 调整静态外观。
- `statistic` 只用于中心文本显示，不得改写真实数据。

**颜色与渐变取值要求**

- 所有颜色值必须统一使用 hex 格式：`#RRGGBB` 或带透明度的 `#RRGGBBAA`。
- G2/G2Plot 线性渐变支持 `l(angle) offset:color offset:color`，例如 `l(90) 0:#2F82FFFF 1:#CD4DFFFF`。
- G2/G2Plot 径向渐变支持 `r(x,y,r) offset:color offset:color`，例如 `r(0.5,0.5,1) 0:#43CBFFFF 1:#0090D900`。
- 渐变 stop color 也必须使用 hex，不允许使用 `transparent`、`rgba(...)`、`rgb(...)`、英文色名或 CSS 变量。
- 需要透明渐隐时，使用 8 位 hex alpha，例如 `#0090D900`，不要写 `transparent`。
