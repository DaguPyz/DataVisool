<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# AntdGauge 组件说明

## 组件标识

```json
{
  "componentType": "AntdGauge",
  "componentName": "Antd仪表盘"
}
```

## 组件选择

```json
{
  "componentType": "AntdGauge",
  "componentName": "Antd仪表盘",
  "description": "仪表盘组件，用于展示 0 到 1 的进度、达成率或指标占比，适用于单指标进度、达成率、评分仪表盘、运行状态指数。",
  "nativeCapabilities": "仪表弧线、进度色带、刻度轴、指针、数据标签、中心统计文本、提示框、标注",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。最终 `data.value` 必须是 0 到 1 之间的数字，表示仪表盘当前百分比；不接受对象或数组。静态数据最小示例为 `{"sourceType":"static","staticData":{"value":0.75}}`。

### 配置字段

AI 可以生成的 `stylePatch` 顶层只能包含 `style`，其 `style` 对象层级如下。`axis`、`indicator`、`statistic`、`tooltip` 可以直接设为 `false` 隐藏；`axis.label`、`axis.line`、`axis.grid`、`axis.tickLine`、`axis.subTickLine` 可以设为 `null` 隐藏。

下列 `<g2plot-…>` 是公共配置片段标识。运行前，相关片段会经检索注入 Agent 上下文；应按同名片段解释该键的可用配置：对象配置项使用片段内的字段，单个配置项只取片段中的同名字段。生成 `stylePatch` 时必须输出具体字段和值，遵守本组件的差异说明与校验规则，不得输出片段标识。

```json
{
  "style": {
    "padding": "<g2plot-canvas>",
    "appendPadding": "<g2plot-canvas>",
    "limitInPlot": "<g2plot-canvas>",
    "supportCSSTransform": "<g2plot-canvas>",
    "radius": "number: 0-1，设置仪表盘外半径",
    "innerRadius": "number: 0-1，设置仪表盘内半径",
    "startAngle": "number: -6.2832-6.2832，设置起始角度",
    "endAngle": "<g2plot-polar-angles>",
    "range": {
      "ticks": "array，设置分段刻度值，例如 [0, 0.6, 0.8, 1]",
      "color": "color | color[]，设置进度区间颜色",
      "width": "number: 0-80，设置区间宽度"
    },
    "indicator": {
      "pointer": {
        "style": {
          "stroke": "color，设置指针描边色",
          "fill": "color，设置指针填充色",
          "lineWidth": "number: 0-10，设置指针线宽",
          "opacity": "number: 0-1，设置指针透明度"
        }
      },
      "pin": {
        "style": {
          "stroke": "color，设置中心圆描边色",
          "fill": "color，设置中心圆填充色",
          "r": "number: 0-20，设置中心圆半径",
          "lineWidth": "number: 0-10，设置中心圆线宽",
          "opacity": "number: 0-1，设置中心圆透明度"
        }
      }
    },
    "axis": {
      "tickLine": {
        "alignTick": "boolean，控制主刻度线是否对齐刻度",
        "length": "number: -50-50，设置主刻度线长度",
        "style": {
          "stroke": "color，设置主刻度线颜色",
          "lineWidth": "number: 0-10，设置主刻度线宽度",
          "lineDash": "array，设置主刻度线虚线，例如 [4, 4]",
          "lineJoin": "miter | round | bevel，设置主刻度线连接样式",
          "lineCap": "butt | round | square，设置主刻度线端点样式",
          "opacity": "number: 0-1，设置主刻度线透明度"
        }
      },
      "subTickLine": {
        "count": "number: 0-50，设置子刻度数量",
        "length": "number: -50-50，设置子刻度线长度",
        "style": {
          "stroke": "color，设置子刻度线颜色",
          "lineWidth": "number: 0-10，设置子刻度线宽度",
          "lineDash": "array，设置子刻度线虚线，例如 [2, 2]",
          "lineJoin": "miter | round | bevel，设置子刻度线连接样式",
          "lineCap": "butt | round | square，设置子刻度线端点样式",
          "opacity": "number: 0-1，设置子刻度线透明度"
        }
      },
      "label": {
        "offset": "number: -100-100，设置刻度标签相对轴线偏移",
        "offsetX": "number: -100-100，设置刻度标签水平偏移",
        "offsetY": "number: -100-100，设置刻度标签垂直偏移",
        "rotate": "number: -6.2832-6.2832，设置刻度标签旋转弧度",
        "autoRotate": "boolean，控制刻度标签是否自动旋转",
        "autoHide": "boolean，控制刻度标签是否自动隐藏防重叠",
        "autoEllipsis": "boolean，控制刻度标签是否自动省略",
        "style": {
          "fill": "color，设置刻度标签文字颜色",
          "stroke": "color，设置刻度标签描边色",
          "lineWidth": "number: 0-10，设置刻度标签描边宽度",
          "fontSize": "number: 8-48，设置刻度标签字号",
          "fontWeight": "number: 100-900，设置刻度标签字重",
          "opacity": "number: 0-1，设置刻度标签透明度",
          "textAlign": "left | center | right | start | end，设置刻度标签水平对齐",
          "textBaseline": "top | middle | bottom，设置刻度标签基线"
        }
      },
      "grid": {
        "alternateColor": "color，设置相邻网格区域交替填充色",
        "closed": "boolean，控制网格线是否闭合",
        "alignTick": "boolean，控制网格线是否对齐刻度",
        "line": {
          "type": "line | circle，设置网格线类型",
          "style": {
            "stroke": "color，设置网格线颜色",
            "lineWidth": "number: 0-10，设置网格线宽度",
            "lineDash": "array，设置网格线虚线，例如 [4, 4]",
            "lineJoin": "miter | round | bevel，设置网格线连接样式",
            "lineCap": "butt | round | square，设置网格线端点样式",
            "opacity": "number: 0-1，设置网格线透明度"
          }
        }
      },
      "line": {
        "style": {
          "stroke": "color，设置轴线颜色",
          "lineWidth": "number: 0-10，设置轴线宽度",
          "lineDash": "array，设置轴线虚线，例如 [4, 4]",
          "lineJoin": "miter | round | bevel，设置轴线连接样式",
          "lineCap": "butt | round | square，设置轴线端点样式",
          "opacity": "number: 0-1，设置轴线透明度"
        }
      }
    },
    "statistic": "<g2plot-statistic>",
    "gaugeStyle": {
      "fill": "color，设置仪表盘填充色",
      "fillOpacity": "number: 0-1，设置仪表盘填充透明度",
      "stroke": "color，设置仪表盘描边色",
      "lineWidth": "number: 0-10，设置仪表盘描边宽度",
      "lineDash": "array，设置仪表盘描边虚线，例如 [4, 4]",
      "lineOpacity": "number: 0-1，设置仪表盘描边透明度",
      "strokeOpacity": "number: 0-1，设置仪表盘边框透明度",
      "opacity": "number: 0-1，设置仪表盘整体透明度",
      "shadowColor": "color，设置仪表盘阴影颜色",
      "shadowBlur": "number: 0-100，设置仪表盘阴影模糊",
      "shadowOffsetX": "number: -100-100，设置仪表盘阴影水平偏移",
      "shadowOffsetY": "number: -100-100，设置仪表盘阴影垂直偏移",
      "cursor": "string，设置鼠标样式"
    },
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
  "componentType": "AntdGauge",
  "forbiddenPaths": ["base","data","filter","style.percent","style.type","style.meter"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "hex-or-g2-gradient-with-hex-stops",
  "allowedStylePaths": [
    {"path":"style.padding","type":"numberOrArrayOrAuto","min":0,"max":500},
    {"path":"style.appendPadding","type":"numberOrArray","min":0,"max":500},
    {"path":"style.limitInPlot","type":"boolean"},
    {"path":"style.supportCSSTransform","type":"boolean"},
    {"path":"style.radius","type":"number","min":0,"max":1},
    {"path":"style.innerRadius","type":"number","min":0,"max":1},
    {"path":"style.startAngle","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.endAngle","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.range.ticks","type":"array"},
    {"path":"style.range.color","type":"color"},
    {"path":"style.range.width","type":"number","min":0,"max":80},
    {"path":"style.indicator.pointer.style.fill","type":"color"},
    {"path":"style.indicator.pointer.style.fillOpacity","type":"number","min":0,"max":1},
    {"path":"style.indicator.pointer.style.stroke","type":"color"},
    {"path":"style.indicator.pointer.style.lineWidth","type":"number","min":0,"max":20},
    {"path":"style.indicator.pointer.style.lineDash","type":"array"},
    {"path":"style.indicator.pointer.style.lineOpacity","type":"number","min":0,"max":1},
    {"path":"style.indicator.pointer.style.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.indicator.pointer.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.indicator.pointer.style.shadowColor","type":"color"},
    {"path":"style.indicator.pointer.style.shadowBlur","type":"number","min":0,"max":100},
    {"path":"style.indicator.pointer.style.shadowOffsetX","type":"number","min":-100,"max":100},
    {"path":"style.indicator.pointer.style.shadowOffsetY","type":"number","min":-100,"max":100},
    {"path":"style.indicator.pointer.style.cursor","type":"string"},
    {"path":"style.indicator.pin.style.fill","type":"color"},
    {"path":"style.indicator.pin.style.fillOpacity","type":"number","min":0,"max":1},
    {"path":"style.indicator.pin.style.stroke","type":"color"},
    {"path":"style.indicator.pin.style.lineWidth","type":"number","min":0,"max":20},
    {"path":"style.indicator.pin.style.lineDash","type":"array"},
    {"path":"style.indicator.pin.style.lineOpacity","type":"number","min":0,"max":1},
    {"path":"style.indicator.pin.style.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.indicator.pin.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.indicator.pin.style.shadowColor","type":"color"},
    {"path":"style.indicator.pin.style.shadowBlur","type":"number","min":0,"max":100},
    {"path":"style.indicator.pin.style.shadowOffsetX","type":"number","min":-100,"max":100},
    {"path":"style.indicator.pin.style.shadowOffsetY","type":"number","min":-100,"max":100},
    {"path":"style.indicator.pin.style.cursor","type":"string"},
    {"path":"style.indicator.pin.style.r","type":"number","min":0,"max":20},
    {"path":"style.axis.tickLine","type":"null","allowNull":true},
    {"path":"style.axis.tickLine.alignTick","type":"boolean"},
    {"path":"style.axis.tickLine.length","type":"number","min":-50,"max":50},
    {"path":"style.axis.tickLine.style.stroke","type":"color"},
    {"path":"style.axis.tickLine.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.axis.tickLine.style.lineDash","type":"array"},
    {"path":"style.axis.tickLine.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.axis.tickLine.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.axis.tickLine.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.axis.subTickLine","type":"null","allowNull":true},
    {"path":"style.axis.subTickLine.count","type":"number","min":0,"max":50},
    {"path":"style.axis.subTickLine.length","type":"number","min":-50,"max":50},
    {"path":"style.axis.subTickLine.style.stroke","type":"color"},
    {"path":"style.axis.subTickLine.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.axis.subTickLine.style.lineDash","type":"array"},
    {"path":"style.axis.subTickLine.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.axis.subTickLine.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.axis.subTickLine.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.axis.label","type":"null","allowNull":true},
    {"path":"style.axis.label.offset","type":"number","min":-100,"max":100},
    {"path":"style.axis.label.offsetX","type":"number","min":-100,"max":100},
    {"path":"style.axis.label.offsetY","type":"number","min":-100,"max":100},
    {"path":"style.axis.label.rotate","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.axis.label.autoRotate","type":"boolean"},
    {"path":"style.axis.label.autoHide","type":"boolean"},
    {"path":"style.axis.label.autoEllipsis","type":"boolean"},
    {"path":"style.axis.label.style.fill","type":"color"},
    {"path":"style.axis.label.style.stroke","type":"color"},
    {"path":"style.axis.label.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.axis.label.style.fontSize","type":"number","min":8,"max":48},
    {"path":"style.axis.label.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.axis.label.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.axis.label.style.textAlign","type":"string","enumValues":["left","center","right","start","end"]},
    {"path":"style.axis.label.style.textBaseline","type":"string","enumValues":["top","middle","bottom"]},
    {"path":"style.axis.line","type":"null","allowNull":true},
    {"path":"style.axis.line.style.stroke","type":"color"},
    {"path":"style.axis.line.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.axis.line.style.lineDash","type":"array"},
    {"path":"style.axis.line.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.axis.line.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.axis.line.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.axis.grid","type":"null","allowNull":true},
    {"path":"style.axis.grid.alternateColor","type":"color"},
    {"path":"style.axis.grid.closed","type":"boolean"},
    {"path":"style.axis.grid.alignTick","type":"boolean"},
    {"path":"style.axis.grid.line.type","type":"string","enumValues":["line","circle"]},
    {"path":"style.axis.grid.line.style.stroke","type":"color"},
    {"path":"style.axis.grid.line.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.axis.grid.line.style.lineDash","type":"array"},
    {"path":"style.axis.grid.line.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.axis.grid.line.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.axis.grid.line.style.opacity","type":"number","min":0,"max":1},
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
    {"path":"style.gaugeStyle.fill","type":"color"},
    {"path":"style.gaugeStyle.fillOpacity","type":"number","min":0,"max":1},
    {"path":"style.gaugeStyle.stroke","type":"color"},
    {"path":"style.gaugeStyle.lineWidth","type":"number","min":0,"max":20},
    {"path":"style.gaugeStyle.lineDash","type":"array"},
    {"path":"style.gaugeStyle.lineOpacity","type":"number","min":0,"max":1},
    {"path":"style.gaugeStyle.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.gaugeStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.gaugeStyle.shadowColor","type":"color"},
    {"path":"style.gaugeStyle.shadowBlur","type":"number","min":0,"max":100},
    {"path":"style.gaugeStyle.shadowOffsetX","type":"number","min":-100,"max":100},
    {"path":"style.gaugeStyle.shadowOffsetY","type":"number","min":-100,"max":100},
    {"path":"style.gaugeStyle.cursor","type":"string"},
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

- G2Plot 仪表盘官方文档：https://g2plot.antv.antgroup.com/api/plots/gauge
- 本组件基于 G2Plot `GaugeOptions`，当前数值由 `style.percent` 和 `data.value` 表示。

**通用限制**

纯样式优化不能修改 `base`、`data`、`filter` 或图层布局。数据修改任务在读取组件数据说明书后，可以同时修改数据与字段映射，但最终数据属性必须与映射一致。纯样式优化不得修改 `percent`，该字段代表指标数值。函数型配置不允许生成，例如 `formatter`、`callback`、`customContent`；坐标轴刻度标签内容改写需要数据或安全 formatter 能力，当前仅支持标题文本和标签样式/布局调整。

**仪表盘语义约束**

- `percent` 是业务数值，AI 不得修改。
- `radius`、`innerRadius`、`startAngle`、`endAngle` 只影响仪表盘形态。
- `range`、`axis`、`indicator`、`statistic` 只允许静态对象，不得生成自定义 shape 函数。
- `type`、`meter` 会改变仪表盘类型，默认不要生成，除非用户明确要求分段仪表盘。

**颜色与渐变取值要求**

- 所有颜色值必须统一使用 hex 格式：`#RRGGBB` 或带透明度的 `#RRGGBBAA`。
- G2/G2Plot 线性渐变支持 `l(angle) offset:color offset:color`，例如 `l(90) 0:#2F82FFFF 1:#CD4DFFFF`。
- G2/G2Plot 径向渐变支持 `r(x,y,r) offset:color offset:color`，例如 `r(0.5,0.5,1) 0:#43CBFFFF 1:#0090D900`。
- 渐变 stop color 也必须使用 hex，不允许使用 `transparent`、`rgba(...)`、`rgb(...)`、英文色名或 CSS 变量。
- 需要透明渐隐时，使用 8 位 hex alpha，例如 `#0090D900`，不要写 `transparent`。
