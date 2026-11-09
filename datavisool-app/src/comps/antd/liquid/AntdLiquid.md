<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# AntdLiquid 组件说明

## 组件标识

```json
{
  "componentType": "AntdLiquid",
  "componentName": "Antd水波图"
}
```

## 组件选择

```json
{
  "componentType": "AntdLiquid",
  "componentName": "Antd水波图",
  "description": "水波图组件，用于展示 0 到 1 的进度、占比或液位指标，适用于液位指标、完成率、容量占比、单指标进度。",
  "nativeCapabilities": "水波形、容器轮廓、中心统计文本、提示框、标注",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。最终 `data.value` 必须是 0 到 1 之间的数字，表示水波图当前水位比例；不接受对象或数组。静态数据最小示例为 `{"sourceType":"static","staticData":{"value":0.65}}`。

### 配置字段

AI 可以生成的 `stylePatch` 顶层只能包含 `style`，其 `style` 对象层级如下。`statistic`、`tooltip` 可以直接设为 `false` 隐藏。

下列 `<g2plot-…>` 是公共配置片段标识。运行前，相关片段会经检索注入 Agent 上下文；应按同名片段解释该键的可用配置：对象配置项使用片段内的字段，单个配置项只取片段中的同名字段。生成 `stylePatch` 时必须输出具体字段和值，遵守本组件的差异说明与校验规则，不得输出片段标识。

```json
{
  "style": {
    "padding": "<g2plot-canvas>",
    "appendPadding": "<g2plot-canvas>",
    "limitInPlot": "<g2plot-canvas>",
    "supportCSSTransform": "<g2plot-canvas>",
    "color": "color，设置水波主色",
    "radius": "number: 0-1，设置水波外半径",
    "shape": "circle | rect | triangle | diamond，设置水波外形",
    "liquidStyle": {
      "fill": "color，设置水波填充色",
      "fillOpacity": "number: 0-1，设置水波填充透明度",
      "stroke": "color，设置水波描边色",
      "lineWidth": "number: 0-10，设置水波描边宽度",
      "lineDash": "array，设置水波描边虚线，例如 [4, 4]",
      "lineOpacity": "number: 0-1，设置水波描边透明度",
      "strokeOpacity": "number: 0-1，设置水波边框透明度",
      "opacity": "number: 0-1，设置水波整体透明度",
      "shadowColor": "color，设置水波阴影颜色",
      "shadowBlur": "number: 0-100，设置水波阴影模糊",
      "shadowOffsetX": "number: -100-100，设置水波阴影水平偏移",
      "shadowOffsetY": "number: -100-100，设置水波阴影垂直偏移",
      "cursor": "string，设置鼠标样式"
    },
    "shapeStyle": {
      "fill": "color，设置容器形状填充色",
      "fillOpacity": "number: 0-1，设置容器形状填充透明度",
      "stroke": "color，设置容器形状描边色",
      "lineWidth": "number: 0-10，设置容器形状描边宽度",
      "lineDash": "array，设置容器形状描边虚线，例如 [4, 4]",
      "lineOpacity": "number: 0-1，设置容器形状描边透明度",
      "strokeOpacity": "number: 0-1，设置容器形状边框透明度",
      "opacity": "number: 0-1，设置容器形状整体透明度",
      "shadowColor": "color，设置容器形状阴影颜色",
      "shadowBlur": "number: 0-100，设置容器形状阴影模糊",
      "shadowOffsetX": "number: -100-100，设置容器形状阴影水平偏移",
      "shadowOffsetY": "number: -100-100，设置容器形状阴影垂直偏移",
      "cursor": "string，设置鼠标样式"
    },
    "outline": {
      "border": "number: 0-20，设置外环宽度",
      "distance": "number: 0-40，设置外环与水波距离",
      "style": {
        "stroke": "color，设置外环描边色",
        "strokeOpacity": "number: 0-1，设置外环描边透明度"
      }
    },
    "wave": {
      "count": "number: 1-10，设置波形数量",
      "length": "number: 20-500，设置波形长度"
    },
    "statistic": "<g2plot-statistic>",
    "tooltip": "<g2plot-tooltip>",
    "annotations": "<g2plot-annotations>"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "AntdLiquid",
  "forbiddenPaths": ["base","data","filter","style.percent","style.shapeCallback"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "hex-or-g2-gradient-with-hex-stops",
  "allowedStylePaths": [
    {"path":"style.padding","type":"numberOrArrayOrAuto","min":0,"max":500},
    {"path":"style.appendPadding","type":"numberOrArray","min":0,"max":500},
    {"path":"style.limitInPlot","type":"boolean"},
    {"path":"style.supportCSSTransform","type":"boolean"},
    {"path":"style.color","type":"color"},
    {"path":"style.radius","type":"number","min":0,"max":1},
    {"path":"style.shape","type":"string","enumValues":["circle","rect","triangle","diamond"]},
    {"path":"style.liquidStyle.fill","type":"color"},
    {"path":"style.liquidStyle.fillOpacity","type":"number","min":0,"max":1},
    {"path":"style.liquidStyle.stroke","type":"color"},
    {"path":"style.liquidStyle.lineWidth","type":"number","min":0,"max":20},
    {"path":"style.liquidStyle.lineDash","type":"array"},
    {"path":"style.liquidStyle.lineOpacity","type":"number","min":0,"max":1},
    {"path":"style.liquidStyle.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.liquidStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.liquidStyle.shadowColor","type":"color"},
    {"path":"style.liquidStyle.shadowBlur","type":"number","min":0,"max":100},
    {"path":"style.liquidStyle.shadowOffsetX","type":"number","min":-100,"max":100},
    {"path":"style.liquidStyle.shadowOffsetY","type":"number","min":-100,"max":100},
    {"path":"style.liquidStyle.cursor","type":"string"},
    {"path":"style.shapeStyle.fill","type":"color"},
    {"path":"style.shapeStyle.fillOpacity","type":"number","min":0,"max":1},
    {"path":"style.shapeStyle.stroke","type":"color"},
    {"path":"style.shapeStyle.lineWidth","type":"number","min":0,"max":20},
    {"path":"style.shapeStyle.lineDash","type":"array"},
    {"path":"style.shapeStyle.lineOpacity","type":"number","min":0,"max":1},
    {"path":"style.shapeStyle.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.shapeStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.shapeStyle.shadowColor","type":"color"},
    {"path":"style.shapeStyle.shadowBlur","type":"number","min":0,"max":100},
    {"path":"style.shapeStyle.shadowOffsetX","type":"number","min":-100,"max":100},
    {"path":"style.shapeStyle.shadowOffsetY","type":"number","min":-100,"max":100},
    {"path":"style.shapeStyle.cursor","type":"string"},
    {"path":"style.outline.border","type":"number","min":0,"max":20},
    {"path":"style.outline.distance","type":"number","min":0,"max":40},
    {"path":"style.outline.style.stroke","type":"color"},
    {"path":"style.outline.style.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.wave.count","type":"number","min":1,"max":10},
    {"path":"style.wave.length","type":"number","min":20,"max":500},
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
    {"path":"style.statistic.content.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.tooltip","type":"boolean","allowFalse":true},
    {"path":"style.tooltip.fields","type":"array"},
    {"path":"style.tooltip.shared","type":"boolean"},
    {"path":"style.tooltip.showTitle","type":"boolean"},
    {"path":"style.tooltip.title","type":"string"},
    {"path":"style.tooltip.position","type":"string","enumValues":["top","bottom","left","right"]},
    {"path":"style.tooltip.follow","type":"boolean"},
    {"path":"style.tooltip.enterable","type":"boolean"},
    {"path":"style.tooltip.showMarkers","type":"boolean"},
    {"path":"style.tooltip.showContent","type":"boolean"},
    {"path":"style.tooltip.showCrosshairs","type":"boolean"},
    {"path":"style.tooltip.offset","type":"number","min":0,"max":200},
    {"path":"style.tooltip.reversed","type":"boolean"},
    {"path":"style.tooltip.showNil","type":"boolean"},
    {"path":"style.tooltip.crosshairs.type","type":"string","enumValues":["x","y","xy"]},
    {"path":"style.tooltip.crosshairs.line.style.stroke","type":"color"},
    {"path":"style.tooltip.crosshairs.line.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.tooltip.crosshairs.line.style.lineDash","type":"array"},
    {"path":"style.tooltip.crosshairs.line.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.tooltip.crosshairs.line.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.tooltip.crosshairs.line.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.annotations","type":"array"}
  ]
}
```

### 限制与校验

**参考依据**

- G2Plot 水波图官方文档：https://g2plot.antv.antgroup.com/api/plots/liquid
- 本组件基于 G2Plot `LiquidOptions`，当前数值由 `style.percent` 和 `data.value` 表示。

**通用限制**

纯样式优化不能修改 `base`、`data`、`filter` 或图层布局。数据修改任务在读取组件数据说明书后，可以同时修改数据与字段映射，但最终数据属性必须与映射一致。纯样式优化不得修改 `percent`，该字段代表指标数值。函数型配置不允许生成，例如 `formatter`、`callback`、`customContent`；坐标轴刻度标签内容改写需要数据或安全 formatter 能力，当前仅支持标题文本和标签样式/布局调整。

**水波图语义约束**

- `percent` 是业务数值，AI 不得修改。
- `shape` 只允许静态枚举值：`circle`、`rect`、`triangle`、`diamond`。
- `liquidStyle` 控制水波，`shapeStyle` 控制容器形状，`outline` 控制外环轮廓。
- `wave.count` 和 `wave.length` 只影响波形密度和长度，不代表数据值。

**颜色与渐变取值要求**

- 所有颜色值必须统一使用 hex 格式：`#RRGGBB` 或带透明度的 `#RRGGBBAA`。
- G2/G2Plot 线性渐变支持 `l(angle) offset:color offset:color`，例如 `l(90) 0:#2F82FFFF 1:#CD4DFFFF`。
- G2/G2Plot 径向渐变支持 `r(x,y,r) offset:color offset:color`，例如 `r(0.5,0.5,1) 0:#43CBFFFF 1:#0090D900`。
- 渐变 stop color 也必须使用 hex，不允许使用 `transparent`、`rgba(...)`、`rgb(...)`、英文色名或 CSS 变量。
- 需要透明渐隐时，使用 8 位 hex alpha，例如 `#0090D900`，不要写 `transparent`。
