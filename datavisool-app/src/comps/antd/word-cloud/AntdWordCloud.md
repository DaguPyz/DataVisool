<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# AntdWordCloud 组件说明

## 组件标识

```json
{
  "componentType": "AntdWordCloud",
  "componentName": "Antd词云图"
}
```

## 组件选择

```json
{
  "componentType": "AntdWordCloud",
  "componentName": "Antd词云图",
  "description": "词云图组件，用于按权重展示词条大小和颜色，适用于关键词权重展示、标签热度、词频可视化、主题分布展示。",
  "nativeCapabilities": "全部词条文字、权重字号和颜色、完整图例、提示框、标注",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。最终 `data.value` 必须是对象数组；`style.wordField` 指向词条文本属性，`style.weightField` 指向非负数值权重属性，`style.colorField` 指向颜色分类属性。属性名不固定，但映射必须与每条数据一致；重命名属性时必须同步修改映射。允许空数组和额外属性。最小数据示例：`[{"name":"DataVisool","value":10}]`。

### 配置字段

AI 可以生成的 `stylePatch` 顶层只能包含 `style`，其 `style` 对象层级如下。`legend`、`tooltip` 可以直接设为 `false` 隐藏。

下列 `<g2plot-…>` 是公共配置片段标识。运行前，相关片段会经检索注入 Agent 上下文；应按同名片段解释该键的可用配置：对象配置项使用片段内的字段，单个配置项只取片段中的同名字段。生成 `stylePatch` 时必须输出具体字段和值，遵守本组件的差异说明与校验规则，不得输出片段标识。

```json
{
  "style": {
    "padding": "<g2plot-canvas>",
    "appendPadding": "<g2plot-canvas>",
    "limitInPlot": "<g2plot-canvas>",
    "supportCSSTransform": "<g2plot-canvas>",
    "color": "color | color[]，设置词条颜色",
    "spiral": "archimedean | rectangular，设置词云整体布局形状",
    "timeInterval": "number: 100-10000，设置布局最大执行时间",
    "random": "number: 0-1，设置固定随机种子；不得生成函数",
    "wordStyle": {
      "fontFamily": "string，设置词条字体",
      "fontWeight": "number: 100-900 | normal | bold，设置词条字重",
      "fontSize": "number | [number, number]，设置词条字号或字号范围",
      "rotation": "number | [number, number]，设置旋转角度或范围",
      "rotationSteps": "number: 1-12，设置旋转步数",
      "padding": "number: 0-50，设置词条间距"
    },
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
  "componentType": "AntdWordCloud",
  "forbiddenPaths": ["base","data","filter","style.wordField","style.weightField","style.colorField","style.imageMask","style.placementStrategy","style.randomFunction"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "hex-only-or-hex-array",
  "allowedStylePaths": [
    {"path":"style.padding","type":"numberOrArrayOrAuto","min":0,"max":500},
    {"path":"style.appendPadding","type":"numberOrArray","min":0,"max":500},
    {"path":"style.limitInPlot","type":"boolean"},
    {"path":"style.supportCSSTransform","type":"boolean"},
    {"path":"style.color","type":"color"},
    {"path":"style.spiral","type":"string","enumValues":["archimedean","rectangular"]},
    {"path":"style.timeInterval","type":"number","min":100,"max":10000},
    {"path":"style.random","type":"number","min":0,"max":1},
    {"path":"style.wordStyle.fontFamily","type":"string"},
    {"path":"style.wordStyle.fontWeight","type":"numberOrString"},
    {"path":"style.wordStyle.fontSize","type":"numberOrArray","min":8,"max":120},
    {"path":"style.wordStyle.rotation","type":"numberOrArray","min":-180,"max":180},
    {"path":"style.wordStyle.rotationSteps","type":"number","min":1,"max":12},
    {"path":"style.wordStyle.padding","type":"number","min":0,"max":50},
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

- G2Plot 词云图官方文档：https://g2plot.antv.antgroup.com/api/plots/word-cloud
- 本组件基于 G2Plot `WordCloudOptions`，字段映射默认为 `wordField: "name"`、`weightField: "value"`、`colorField: "name"`。

**通用限制**

纯样式优化不能修改 `base`、`data`、`filter` 或图层布局。数据修改任务在读取组件数据说明书后，可以同时修改数据与字段映射，但最终数据属性必须与映射一致。纯样式优化不得修改 `wordField`、`weightField`、`colorField`，否则可能破坏词条内容、权重和颜色语义。函数型配置不允许生成，例如 `formatter`、`callback`、`customContent`；坐标轴刻度标签内容改写需要数据或安全 formatter 能力，当前仅支持标题文本和标签样式/布局调整。

**词云图语义约束**

- `wordField` 决定词条文本，`weightField` 决定词条权重，AI 不得修改。
- `wordStyle.fontSize` 可调整字号范围，但不能改写权重字段。
- `spiral` 只允许 `archimedean` 或 `rectangular`。
- 不得生成 `imageMask`，避免引入外部资源或 base64 大字段。
- `random` 只允许数字固定种子，不允许函数。

**颜色与渐变取值要求**

- 所有颜色值必须统一使用 hex 格式：`#RRGGBB` 或带透明度的 `#RRGGBBAA`。
- G2/G2Plot 线性渐变支持 `l(angle) offset:color offset:color`，例如 `l(90) 0:#2F82FFFF 1:#CD4DFFFF`。
- G2/G2Plot 径向渐变支持 `r(x,y,r) offset:color offset:color`，例如 `r(0.5,0.5,1) 0:#43CBFFFF 1:#0090D900`。
- 渐变 stop color 也必须使用 hex，不允许使用 `transparent`、`rgba(...)`、`rgb(...)`、英文色名或 CSS 变量。
- 需要透明渐隐时，使用 8 位 hex alpha，例如 `#0090D900`，不要写 `transparent`。
