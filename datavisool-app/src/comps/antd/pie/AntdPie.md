<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# AntdPie 组件说明

## 组件标识

```json
{
  "componentType": "AntdPie",
  "componentName": "Antd饼图"
}
```

## 组件选择

```json
{
  "componentType": "AntdPie",
  "componentName": "Antd饼图",
  "description": "饼图/环图组件，用于展示分类占比，适用于分类占比、环图占比、组成结构展示、少量分类比例对比。",
  "nativeCapabilities": "饼图或环图扇区、数据标签和引导线、完整图例（标记/名称/附加值）、中心统计文本、提示框、标注",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。最终 `data.value` 必须是对象数组；`style.angleField` 指向非负数值属性，`style.colorField` 指向分类属性。属性名不固定，但映射必须与每条数据一致；重命名属性时必须同步修改映射。允许空数组和额外属性。最小数据示例：`[{"type":"A","value":10}]`。

### 配置字段

AI 可以生成的 `stylePatch` 顶层只能包含 `style`，其 `style` 对象层级如下。`label`、`legend`、`tooltip`、`statistic` 可以直接设为 `false` 隐藏；`label.labelLine` 可以设为 `null`、`false`、`true` 或静态样式对象。

下列 `<g2plot-…>` 是公共配置片段标识。运行前，相关片段会经检索注入 Agent 上下文；应按同名片段解释该键的可用配置：对象配置项使用片段内的字段，单个配置项只取片段中的同名字段。生成 `stylePatch` 时必须输出具体字段和值，遵守本组件的差异说明与校验规则，不得输出片段标识。

```json
{
  "style": {
    "padding": "<g2plot-canvas>",
    "appendPadding": "<g2plot-canvas>",
    "limitInPlot": "<g2plot-canvas>",
    "supportCSSTransform": "<g2plot-canvas>",
    "color": "color | color[]，设置扇区颜色，必须为 hex 或 stop color 全部为 hex 的 G2 渐变字符串",
    "radius": "number: 0-1，设置饼图外半径",
    "innerRadius": "number: 0-1，设置饼图内半径，0 为实心饼图",
    "startAngle": "<g2plot-polar-angles>",
    "endAngle": "<g2plot-polar-angles>",
    "pieStyle": {
      "fill": "color，设置扇区填充色",
      "fillOpacity": "number: 0-1，设置扇区填充透明度",
      "stroke": "color，设置扇区描边色",
      "lineWidth": "number: 0-10，设置扇区描边宽度",
      "lineDash": "array，设置扇区描边虚线，例如 [4, 4]",
      "lineOpacity": "number: 0-1，设置扇区描边透明度",
      "strokeOpacity": "number: 0-1，设置扇区边框透明度",
      "opacity": "number: 0-1，设置扇区整体透明度",
      "shadowColor": "color，设置扇区阴影颜色",
      "shadowBlur": "number: 0-100，设置扇区阴影模糊",
      "shadowOffsetX": "number: -100-100，设置扇区阴影水平偏移",
      "shadowOffsetY": "number: -100-100，设置扇区阴影垂直偏移",
      "cursor": "string，设置鼠标样式"
    },
    "label": {
      "position": "inner | outer | spider，设置数据标签相对图形的位置",
      "offset": "number: -100-100，设置数据标签整体偏移量",
      "offsetX": "number: -100-100，设置数据标签水平偏移量",
      "offsetY": "number: -100-100，设置数据标签垂直偏移量",
      "autoRotate": "boolean，控制标签是否自动旋转",
      "rotate": "number: -6.2832-6.2832，设置标签旋转弧度",
      "labelLine": {
        "style": {
          "stroke": "color，设置标签引导线颜色",
          "lineWidth": "number: 0-10，设置标签引导线宽度",
          "lineDash": "array，设置标签引导线虚线，例如 [4, 4]",
          "opacity": "number: 0-1，设置标签引导线透明度"
        }
      },
      "style": {
        "fill": "color，设置数据标签文字颜色",
        "stroke": "color，设置数据标签描边色",
        "lineWidth": "number: 0-10，设置数据标签描边宽度",
        "fontSize": "number: 8-48，设置数据标签字号",
        "fontWeight": "number: 100-900，设置数据标签字重",
        "opacity": "number: 0-1，设置数据标签透明度",
        "textAlign": "left | center | right | start | end，设置数据标签水平对齐",
        "textBaseline": "top | middle | bottom，设置数据标签基线"
      }
    },
    "legend": "<g2plot-legend>",
    "tooltip": "<g2plot-tooltip>",
    "statistic": "<g2plot-statistic>",
    "annotations": "<g2plot-annotations>"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "AntdPie",
  "forbiddenPaths": ["base","data","filter","style.angleField","style.colorField","style.shape"],
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
    {"path":"style.pieStyle.fill","type":"color"},
    {"path":"style.pieStyle.fillOpacity","type":"number","min":0,"max":1},
    {"path":"style.pieStyle.stroke","type":"color"},
    {"path":"style.pieStyle.lineWidth","type":"number","min":0,"max":20},
    {"path":"style.pieStyle.lineDash","type":"array"},
    {"path":"style.pieStyle.lineOpacity","type":"number","min":0,"max":1},
    {"path":"style.pieStyle.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.pieStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.pieStyle.shadowColor","type":"color"},
    {"path":"style.pieStyle.shadowBlur","type":"number","min":0,"max":100},
    {"path":"style.pieStyle.shadowOffsetX","type":"number","min":-100,"max":100},
    {"path":"style.pieStyle.shadowOffsetY","type":"number","min":-100,"max":100},
    {"path":"style.pieStyle.cursor","type":"string"},
    {"path":"style.label","type":"boolean","allowFalse":true},
    {"path":"style.label.type","type":"string","enumValues":["inner","outer","spider"]},
    {"path":"style.label.position","type":"string","enumValues":["inner","outer","spider"]},
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
    {"path":"style.annotations","type":"array"}
  ]
}
```

### 限制与校验

**参考依据**

- G2Plot 饼图官方文档：https://g2plot.antv.antgroup.com/api/plots/pie
- 本组件基于 G2Plot `PieOptions`，字段映射默认为 `angleField: "value"`、`colorField: "type"`。

**通用限制**

纯样式优化不能修改 `base`、`data`、`filter` 或图层布局。数据修改任务在读取组件数据说明书后，可以同时修改数据与字段映射，但最终数据属性必须与映射一致。纯样式优化不得修改 `angleField`、`colorField`，否则可能破坏饼图分类和占比语义。函数型配置不允许生成，例如 `formatter`、`callback`、`customContent`；坐标轴刻度标签内容改写需要数据或安全 formatter 能力，当前仅支持标题文本和标签样式/布局调整。

**饼图语义约束**

- `angleField` 决定扇区角度，`colorField` 决定分类颜色，AI 不得修改。
- `radius`、`innerRadius`、`startAngle`、`endAngle` 只影响环图形态。
- `statistic` 只用于中心文本显示，不得用于改写数据总计。
- 不得生成自定义 `shape` 函数。

**颜色与渐变取值要求**

- 所有颜色值必须统一使用 hex 格式：`#RRGGBB` 或带透明度的 `#RRGGBBAA`。
- G2/G2Plot 线性渐变支持 `l(angle) offset:color offset:color`，例如 `l(90) 0:#2F82FFFF 1:#CD4DFFFF`。
- G2/G2Plot 径向渐变支持 `r(x,y,r) offset:color offset:color`，例如 `r(0.5,0.5,1) 0:#43CBFFFF 1:#0090D900`。
- 渐变 stop color 也必须使用 hex，不允许使用 `transparent`、`rgba(...)`、`rgb(...)`、英文色名或 CSS 变量。
- 需要透明渐隐时，使用 8 位 hex alpha，例如 `#0090D900`，不要写 `transparent`。
