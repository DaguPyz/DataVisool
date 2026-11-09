<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# AntdBaseRose 组件说明

## 组件标识

```json
{
  "componentType": "AntdBaseRose",
  "componentName": "Antd基础玫瑰图"
}
```

## 组件选择

```json
{
  "componentType": "AntdBaseRose",
  "componentName": "Antd基础玫瑰图",
  "description": "基础玫瑰图组件，用于在极坐标中展示分类数值对比，适用于极坐标分类数值对比、玫瑰图分类展示、分类强弱对比。",
  "nativeCapabilities": "玫瑰扇区、极坐标轴、数据标签、完整图例、提示框、标注",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是对象数组。每项包含分类属性和数值属性，分别与 `style.xField`、`style.yField` 对应；数值属性必须是非负数字。若配置了 `style.seriesField`，它也必须指向数据中存在的分类属性。属性名不固定；可以改名，但数据属性与字段映射必须在同一次修改后保持一致。

例如字段映射为 `xField: "category"`、`yField: "amount"` 时，数据项可以是 `{"category":"华东","amount":120}`。

### 配置字段

AI 可以生成的 `stylePatch` 顶层只能包含 `style`，其 `style` 对象层级如下。`label`、`legend`、`tooltip` 可以直接设为 `false` 隐藏；`label.labelLine` 可以设为 `null`、`false`、`true` 或静态样式对象。

下列 `<g2plot-…>` 是公共配置片段标识。运行前，相关片段会经检索注入 Agent 上下文；应按同名片段解释该键的可用配置：对象配置项使用片段内的字段，单个配置项只取片段中的同名字段。生成 `stylePatch` 时必须输出具体字段和值，遵守本组件的差异说明与校验规则，不得输出片段标识。

```json
{
  "style": {
    "padding": "<g2plot-canvas>",
    "appendPadding": "<g2plot-canvas>",
    "limitInPlot": "<g2plot-canvas>",
    "supportCSSTransform": "<g2plot-canvas>",
    "color": "<g2plot-rose-plot>",
    "radius": "<g2plot-rose-plot>",
    "innerRadius": "<g2plot-rose-plot>",
    "startAngle": "<g2plot-polar-angles>",
    "endAngle": "<g2plot-polar-angles>",
    "sectorStyle": "<g2plot-sector-style>",
    "label": "<g2plot-label-line>",
    "legend": "<g2plot-legend>",
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
  "componentType": "AntdBaseRose",
  "forbiddenPaths": ["base","data","filter","style.xField","style.yField","style.seriesField","style.isGroup","style.isStack"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "hex-or-g2-gradient-with-hex-stops",
  "allowedStylePaths": [
    {"path":"style.padding","type":"numberOrArrayOrAuto","min":0,"max":500},
    {"path":"style.appendPadding","type":"numberOrArray","min":0,"max":500},
    {"path":"style.limitInPlot","type":"boolean"},
    {"path":"style.supportCSSTransform","type":"boolean"},
    {"path":"style.color","type":"color"},
    {"path":"style.radius","type":"number","min":0,"max":1},
    {"path":"style.innerRadius","type":"number","min":0,"max":1},
    {"path":"style.startAngle","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.endAngle","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.sectorStyle.fill","type":"color"},
    {"path":"style.sectorStyle.fillOpacity","type":"number","min":0,"max":1},
    {"path":"style.sectorStyle.stroke","type":"color"},
    {"path":"style.sectorStyle.lineWidth","type":"number","min":0,"max":20},
    {"path":"style.sectorStyle.lineDash","type":"array"},
    {"path":"style.sectorStyle.lineOpacity","type":"number","min":0,"max":1},
    {"path":"style.sectorStyle.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.sectorStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.sectorStyle.shadowColor","type":"color"},
    {"path":"style.sectorStyle.shadowBlur","type":"number","min":0,"max":100},
    {"path":"style.sectorStyle.shadowOffsetX","type":"number","min":-100,"max":100},
    {"path":"style.sectorStyle.shadowOffsetY","type":"number","min":-100,"max":100},
    {"path":"style.sectorStyle.cursor","type":"string"},
    {"path":"style.label","type":"boolean","allowFalse":true},
    {"path":"style.label.type","type":"string","enumValues":["inner","outer","spider"]},
    {"path":"style.label.position","type":"string","enumValues":["top","middle","bottom","left","right"]},
    {"path":"style.label.offset","type":"number","min":-100,"max":100},
    {"path":"style.label.offsetX","type":"number","min":-100,"max":100},
    {"path":"style.label.offsetY","type":"number","min":-100,"max":100},
    {"path":"style.label.autoRotate","type":"boolean"},
    {"path":"style.label.rotate","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.label.labelLine","type":"boolean","allowNull":true},
    {"path":"style.label.labelLine.style.stroke","type":"color"},
    {"path":"style.label.labelLine.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.label.labelLine.style.lineDash","type":"array"},
    {"path":"style.label.labelLine.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.label.style.fill","type":"color"},
    {"path":"style.label.style.stroke","type":"color"},
    {"path":"style.label.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.label.style.fontSize","type":"number","min":8,"max":48},
    {"path":"style.label.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.label.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.legend","type":"boolean","allowFalse":true},
    {"path":"style.legend.position","type":"string","enumValues":["left-top","left","left-bottom","top-left","top","top-right","right-top","right","right-bottom","bottom-left","bottom","bottom-right"]},
    {"path":"style.legend.layout","type":"string","enumValues":["horizontal","vertical"]},
    {"path":"style.legend.flipPage","type":"boolean"},
    {"path":"style.legend.maxRow","type":"number","min":1,"max":20},
    {"path":"style.legend.itemWidth","type":"number","min":0,"max":500},
    {"path":"style.legend.itemHeight","type":"number","min":0,"max":100},
    {"path":"style.legend.maxItemWidth","type":"number","min":0,"max":1000},
    {"path":"style.legend.maxWidth","type":"number","min":0,"max":2000},
    {"path":"style.legend.maxHeight","type":"number","min":0,"max":2000},
    {"path":"style.legend.title.text","type":"string"},
    {"path":"style.legend.title.spacing","type":"number","min":0,"max":100},
    {"path":"style.legend.title.style.fill","type":"color"},
    {"path":"style.legend.title.style.fontSize","type":"number","min":8,"max":48},
    {"path":"style.legend.title.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.legend.itemName.spacing","type":"number","min":0,"max":100},
    {"path":"style.legend.itemName.style.fill","type":"color"},
    {"path":"style.legend.itemName.style.fontSize","type":"number","min":8,"max":48},
    {"path":"style.legend.itemName.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.legend.itemName.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.legend.itemValue.alignRight","type":"boolean"},
    {"path":"style.legend.itemValue.style.fill","type":"color"},
    {"path":"style.legend.itemValue.style.fontSize","type":"number","min":8,"max":48},
    {"path":"style.legend.itemValue.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.legend.itemSpacing","type":"number","min":0,"max":100},
    {"path":"style.legend.itemMarginBottom","type":"number","min":0,"max":100},
    {"path":"style.legend.marker.symbol","type":"string","enumValues":["circle","square","diamond","triangle","triangle-down","hexagon","bowtie","cross","tick","plus","hyphen","line"]},
    {"path":"style.legend.marker.style.r","type":"number","min":0,"max":30},
    {"path":"style.legend.marker.style.fill","type":"color"},
    {"path":"style.legend.marker.style.stroke","type":"color"},
    {"path":"style.legend.marker.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.legend.background.padding","type":"number","min":0,"max":80},
    {"path":"style.legend.background.style.fill","type":"color"},
    {"path":"style.legend.background.style.stroke","type":"color"},
    {"path":"style.legend.background.style.lineWidth","type":"number","min":0,"max":10},
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

- G2Plot 玫瑰图官方文档：https://g2plot.antv.antgroup.com/api/plots/rose
- 本组件基于 G2Plot `RoseOptions`，字段映射默认为 `xField: "type"`、`yField: "value"`、`seriesField: "type"`。

**通用限制**

纯样式优化不能修改 `base`、`data`、`filter` 或图层布局。数据修改任务在读取组件数据说明书后，可以同时修改数据与字段映射，但最终数据属性必须与映射一致。纯样式优化不得修改 `xField`、`yField`、`seriesField`、`isGroup`、`isStack`，否则可能破坏玫瑰图语义。函数型配置不允许生成，例如 `formatter`、`callback`、`customContent`；坐标轴刻度标签内容改写需要数据或安全 formatter 能力，当前仅支持标题文本和标签样式/布局调整。

**基础玫瑰图语义约束**

- `xField` 是分类字段，`yField` 是数值字段，AI 不得修改。
- 基础玫瑰图不是分组或堆叠玫瑰图，AI 不得生成 `isGroup`、`isStack`。
- `sectorStyle` 只能使用静态样式对象，不得使用回调函数。

**颜色与渐变取值要求**

- 所有颜色值必须统一使用 hex 格式：`#RRGGBB` 或带透明度的 `#RRGGBBAA`。
- G2/G2Plot 线性渐变支持 `l(angle) offset:color offset:color`，例如 `l(90) 0:#2F82FFFF 1:#CD4DFFFF`。
- G2/G2Plot 径向渐变支持 `r(x,y,r) offset:color offset:color`，例如 `r(0.5,0.5,1) 0:#43CBFFFF 1:#0090D900`。
- 渐变 stop color 也必须使用 hex，不允许使用 `transparent`、`rgba(...)`、`rgb(...)`、英文色名或 CSS 变量。
- 需要透明渐隐时，使用 8 位 hex alpha，例如 `#0090D900`，不要写 `transparent`。
