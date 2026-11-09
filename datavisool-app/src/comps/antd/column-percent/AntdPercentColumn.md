<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# AntdPercentColumn 组件说明

## 组件标识

```json
{
  "componentType": "AntdPercentColumn",
  "componentName": "Antd百分比柱状图"
}
```

## 组件选择

```json
{
  "componentType": "AntdPercentColumn",
  "componentName": "Antd百分比柱状图",
  "description": "百分比柱状图组件，用于纵向展示同一分类下各分组的占比构成，适用于纵向百分比构成、分类占比对比、多分组比例展示。",
  "nativeCapabilities": "多系列百分比柱形、坐标轴、完整图例、数据标签、提示框、标注、滚动条",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是对象数组。每项包含分类、数值和系列三个属性，分别与 `style.xField`、`style.yField`、`style.seriesField` 对应；数值属性必须是非负数字。属性名不固定，Agent 可以改名，但数据属性和字段映射必须在同一次修改后保持一致。同一分类至少应有两个系列，组件会按分类计算各系列占比。

例如字段映射为 `xField: "year"`、`yField: "amount"`、`seriesField: "country"` 时，数据项可以是 `{"year":"2026","amount":30,"country":"中国"}`。

### 配置字段

AI 可以生成的 `stylePatch` 顶层只能包含 `style`，其 `style` 对象层级如下。`label`、`legend`、`tooltip`、`xAxis`、`yAxis`、`slider`、`scrollbar` 可以直接设为 `false` 隐藏；`xAxis.label`、`xAxis.line`、`xAxis.grid`、`xAxis.tickLine`、`xAxis.subTickLine`、`xAxis.title`、`yAxis.label`、`yAxis.line`、`yAxis.grid`、`yAxis.tickLine`、`yAxis.subTickLine`、`yAxis.title` 可以设为 `null` 隐藏。

下列 `<g2plot-…>` 是公共配置片段标识。运行前，相关片段会经检索注入 Agent 上下文；应按同名片段解释该键的可用配置：对象配置项使用片段内的字段，单个配置项只取片段中的同名字段。生成 `stylePatch` 时必须输出具体字段和值，遵守本组件的差异说明与校验规则，不得输出片段标识。

```json
{
  "style": {
    "padding": "<g2plot-canvas>",
    "appendPadding": "<g2plot-canvas>",
    "limitInPlot": "<g2plot-canvas>",
    "supportCSSTransform": "<g2plot-canvas>",
    "color": "<g2plot-column-series>",
    "columnWidthRatio": "<g2plot-column-layout>",
    "minColumnWidth": "<g2plot-column-layout>",
    "maxColumnWidth": "<g2plot-column-layout>",
    "dodgePadding": "<g2plot-column-series>",
    "intervalPadding": "<g2plot-column-series>",
    "shape": "<g2plot-column-series>",
    "columnStyle": "<g2plot-column-style>",
    "columnBackground": "<g2plot-column-background>",
    "label": "<g2plot-label-column>",
    "xAxis": "<g2plot-axis>",
    "yAxis": "<g2plot-axis>",
    "legend": "<g2plot-legend>",
    "tooltip": "<g2plot-tooltip>",
    "annotations": "<g2plot-annotations>",
    "slider": "<g2plot-slider>",
    "scrollbar": "<g2plot-scrollbar>"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "AntdPercentColumn",
  "allowedStylePaths": [
    {"path": "style.padding", "type": "numberOrArrayOrAuto", "min": 0, "max": 500},
    {"path": "style.appendPadding", "type": "numberOrArray", "min": 0, "max": 500},
    {"path": "style.limitInPlot", "type": "boolean"},
    {"path": "style.supportCSSTransform", "type": "boolean"},
    {"path": "style.color", "type": "colorOrColorArray"},
    {"path": "style.columnWidthRatio", "type": "number", "min": 0, "max": 1},
    {"path": "style.minColumnWidth", "type": "number", "min": 0, "max": 200},
    {"path": "style.maxColumnWidth", "type": "number", "min": 0, "max": 300},
    {"path": "style.dodgePadding", "type": "number", "min": 0, "max": 100},
    {"path": "style.intervalPadding", "type": "number", "min": 0, "max": 100},
    {"path": "style.shape", "type": "string", "enumValues": ["rect", "hollow-rect"]},
    {"path": "style.columnStyle.fill", "type": "color"},
    {"path": "style.columnStyle.fillOpacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.columnStyle.stroke", "type": "color"},
    {"path": "style.columnStyle.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.columnStyle.lineDash", "type": "array"},
    {"path": "style.columnStyle.lineOpacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.columnStyle.strokeOpacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.columnStyle.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.columnStyle.radius", "type": "numberOrArray", "min": 0, "max": 100},
    {"path": "style.columnStyle.shadowColor", "type": "color"},
    {"path": "style.columnStyle.shadowBlur", "type": "number", "min": 0, "max": 100},
    {"path": "style.columnStyle.shadowOffsetX", "type": "number", "min": -100, "max": 100},
    {"path": "style.columnStyle.shadowOffsetY", "type": "number", "min": -100, "max": 100},
    {"path": "style.columnStyle.cursor", "type": "string"},
    {"path": "style.columnBackground.style.fill", "type": "color"},
    {"path": "style.columnBackground.style.fillOpacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.columnBackground.style.stroke", "type": "color"},
    {"path": "style.columnBackground.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.columnBackground.style.radius", "type": "numberOrArray", "min": 0, "max": 100},
    {"path": "style.columnBackground.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.label", "type": "boolean", "allowFalse": true},
    {"path": "style.label.position", "type": "string", "enumValues": ["left", "right", "top", "bottom", "middle"]},
    {"path": "style.label.offsetX", "type": "number", "min": -100, "max": 100},
    {"path": "style.label.offsetY", "type": "number", "min": -100, "max": 100},
    {"path": "style.label.style.fill", "type": "color"},
    {"path": "style.label.style.stroke", "type": "color"},
    {"path": "style.label.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.label.style.fontSize", "type": "number", "min": 8, "max": 48},
    {"path": "style.label.style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.label.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.xAxis", "type": "boolean", "allowFalse": true},
    {"path": "style.xAxis.alias", "type": "string"},
    {"path": "style.xAxis.range", "type": "array"},
    {"path": "style.xAxis.tickCount", "type": "number", "min": 0, "max": 50},
    {"path": "style.xAxis.tickInterval", "type": "number", "min": 0, "max": 1000000},
    {"path": "style.xAxis.nice", "type": "boolean"},
    {"path": "style.xAxis.min", "type": "number"},
    {"path": "style.xAxis.max", "type": "number"},
    {"path": "style.xAxis.minLimit", "type": "number"},
    {"path": "style.xAxis.maxLimit", "type": "number"},
    {"path": "style.xAxis.top", "type": "boolean"},
    {"path": "style.xAxis.position", "type": "string", "enumValues": ["top", "bottom", "left", "right"]},
    {"path": "style.xAxis.verticalLimitLength", "type": "number", "min": 0, "max": 1000},
    {"path": "style.xAxis.verticalFactor", "type": "number", "min": -1, "max": 1},
    {"path": "style.xAxis.animate", "type": "boolean"},
    {"path": "style.xAxis.label", "type": "null", "allowNull": true},
    {"path": "style.xAxis.label.offset", "type": "number", "min": -100, "max": 100},
    {"path": "style.xAxis.label.offsetX", "type": "number", "min": -100, "max": 100},
    {"path": "style.xAxis.label.offsetY", "type": "number", "min": -100, "max": 100},
    {"path": "style.xAxis.label.rotate", "type": "number", "min": -6.2832, "max": 6.2832},
    {"path": "style.xAxis.label.autoRotate", "type": "boolean"},
    {"path": "style.xAxis.label.autoHide", "type": "boolean"},
    {"path": "style.xAxis.label.autoEllipsis", "type": "boolean"},
    {"path": "style.xAxis.label.style.fill", "type": "color"},
    {"path": "style.xAxis.label.style.fontSize", "type": "number", "min": 8, "max": 48},
    {"path": "style.xAxis.label.style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.xAxis.label.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.xAxis.label.style.textAlign", "type": "string", "enumValues": ["left", "center", "right", "start", "end"]},
    {"path": "style.xAxis.label.style.textBaseline", "type": "string", "enumValues": ["top", "middle", "bottom"]},
    {"path": "style.xAxis.line", "type": "null", "allowNull": true},
    {"path": "style.xAxis.line.style.stroke", "type": "color"},
    {"path": "style.xAxis.line.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.xAxis.line.style.lineDash", "type": "array"},
    {"path": "style.xAxis.line.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.xAxis.grid", "type": "null", "allowNull": true},
    {"path": "style.xAxis.grid.alternateColor", "type": "color"},
    {"path": "style.xAxis.grid.closed", "type": "boolean"},
    {"path": "style.xAxis.grid.alignTick", "type": "boolean"},
    {"path": "style.xAxis.grid.line.type", "type": "string", "enumValues": ["line", "circle"]},
    {"path": "style.xAxis.grid.line.style.stroke", "type": "color"},
    {"path": "style.xAxis.grid.line.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.xAxis.grid.line.style.lineDash", "type": "array"},
    {"path": "style.xAxis.grid.line.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.xAxis.tickLine", "type": "null", "allowNull": true},
    {"path": "style.xAxis.tickLine.alignTick", "type": "boolean"},
    {"path": "style.xAxis.tickLine.length", "type": "number", "min": 0, "max": 50},
    {"path": "style.xAxis.tickLine.style.stroke", "type": "color"},
    {"path": "style.xAxis.tickLine.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.xAxis.tickLine.style.lineDash", "type": "array"},
    {"path": "style.xAxis.tickLine.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.xAxis.subTickLine", "type": "null", "allowNull": true},
    {"path": "style.xAxis.subTickLine.count", "type": "number", "min": 0, "max": 20},
    {"path": "style.xAxis.subTickLine.length", "type": "number", "min": 0, "max": 50},
    {"path": "style.xAxis.subTickLine.style.stroke", "type": "color"},
    {"path": "style.xAxis.subTickLine.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.xAxis.subTickLine.style.lineDash", "type": "array"},
    {"path": "style.xAxis.subTickLine.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.xAxis.title", "type": "null", "allowNull": true},
    {"path": "style.xAxis.title.text", "type": "string"},
    {"path": "style.xAxis.title.offset", "type": "number", "min": -100, "max": 100},
    {"path": "style.xAxis.title.spacing", "type": "number", "min": 0, "max": 100},
    {"path": "style.xAxis.title.autoRotate", "type": "boolean"},
    {"path": "style.xAxis.title.rotation", "type": "number", "min": -6.2832, "max": 6.2832},
    {"path": "style.xAxis.title.position", "type": "string", "enumValues": ["start", "center", "end"]},
    {"path": "style.xAxis.title.style.fill", "type": "color"},
    {"path": "style.xAxis.title.style.fontSize", "type": "number", "min": 8, "max": 48},
    {"path": "style.xAxis.title.style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.xAxis.title.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.xAxis.title.style.textAlign", "type": "string", "enumValues": ["left", "center", "right", "start", "end"]},
    {"path": "style.xAxis.title.style.textBaseline", "type": "string", "enumValues": ["top", "middle", "bottom"]},
    {"path": "style.yAxis", "type": "boolean", "allowFalse": true},
    {"path": "style.yAxis.range", "type": "array"},
    {"path": "style.yAxis.alias", "type": "string"},
    {"path": "style.yAxis.min", "type": "number"},
    {"path": "style.yAxis.max", "type": "number"},
    {"path": "style.yAxis.minLimit", "type": "number"},
    {"path": "style.yAxis.maxLimit", "type": "number"},
    {"path": "style.yAxis.nice", "type": "boolean"},
    {"path": "style.yAxis.top", "type": "boolean"},
    {"path": "style.yAxis.position", "type": "string", "enumValues": ["top", "bottom", "left", "right"]},
    {"path": "style.yAxis.tickCount", "type": "number", "min": 0, "max": 50},
    {"path": "style.yAxis.tickInterval", "type": "number", "min": 0, "max": 1000000},
    {"path": "style.yAxis.verticalLimitLength", "type": "number", "min": 0, "max": 1000},
    {"path": "style.yAxis.verticalFactor", "type": "number", "min": -1, "max": 1},
    {"path": "style.yAxis.animate", "type": "boolean"},
    {"path": "style.yAxis.label", "type": "null", "allowNull": true},
    {"path": "style.yAxis.label.offset", "type": "number", "min": -100, "max": 100},
    {"path": "style.yAxis.label.offsetX", "type": "number", "min": -100, "max": 100},
    {"path": "style.yAxis.label.offsetY", "type": "number", "min": -100, "max": 100},
    {"path": "style.yAxis.label.rotate", "type": "number", "min": -6.2832, "max": 6.2832},
    {"path": "style.yAxis.label.autoRotate", "type": "boolean"},
    {"path": "style.yAxis.label.autoHide", "type": "boolean"},
    {"path": "style.yAxis.label.autoEllipsis", "type": "boolean"},
    {"path": "style.yAxis.label.style.fill", "type": "color"},
    {"path": "style.yAxis.label.style.fontSize", "type": "number", "min": 8, "max": 48},
    {"path": "style.yAxis.label.style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.yAxis.label.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.yAxis.label.style.textAlign", "type": "string", "enumValues": ["left", "center", "right", "start", "end"]},
    {"path": "style.yAxis.label.style.textBaseline", "type": "string", "enumValues": ["top", "middle", "bottom"]},
    {"path": "style.yAxis.line", "type": "null", "allowNull": true},
    {"path": "style.yAxis.line.style.stroke", "type": "color"},
    {"path": "style.yAxis.line.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.yAxis.line.style.lineDash", "type": "array"},
    {"path": "style.yAxis.line.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.yAxis.grid", "type": "null", "allowNull": true},
    {"path": "style.yAxis.grid.alternateColor", "type": "color"},
    {"path": "style.yAxis.grid.closed", "type": "boolean"},
    {"path": "style.yAxis.grid.alignTick", "type": "boolean"},
    {"path": "style.yAxis.grid.line.type", "type": "string", "enumValues": ["line", "circle"]},
    {"path": "style.yAxis.grid.line.style.stroke", "type": "color"},
    {"path": "style.yAxis.grid.line.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.yAxis.grid.line.style.lineDash", "type": "array"},
    {"path": "style.yAxis.grid.line.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.yAxis.tickLine", "type": "null", "allowNull": true},
    {"path": "style.yAxis.tickLine.alignTick", "type": "boolean"},
    {"path": "style.yAxis.tickLine.length", "type": "number", "min": 0, "max": 50},
    {"path": "style.yAxis.tickLine.style.stroke", "type": "color"},
    {"path": "style.yAxis.tickLine.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.yAxis.tickLine.style.lineDash", "type": "array"},
    {"path": "style.yAxis.tickLine.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.yAxis.subTickLine", "type": "null", "allowNull": true},
    {"path": "style.yAxis.subTickLine.count", "type": "number", "min": 0, "max": 20},
    {"path": "style.yAxis.subTickLine.length", "type": "number", "min": 0, "max": 50},
    {"path": "style.yAxis.subTickLine.style.stroke", "type": "color"},
    {"path": "style.yAxis.subTickLine.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.yAxis.subTickLine.style.lineDash", "type": "array"},
    {"path": "style.yAxis.subTickLine.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.yAxis.title", "type": "null", "allowNull": true},
    {"path": "style.yAxis.title.text", "type": "string"},
    {"path": "style.yAxis.title.offset", "type": "number", "min": -100, "max": 100},
    {"path": "style.yAxis.title.spacing", "type": "number", "min": 0, "max": 100},
    {"path": "style.yAxis.title.autoRotate", "type": "boolean"},
    {"path": "style.yAxis.title.rotation", "type": "number", "min": -6.2832, "max": 6.2832},
    {"path": "style.yAxis.title.position", "type": "string", "enumValues": ["start", "center", "end"]},
    {"path": "style.yAxis.title.style.fill", "type": "color"},
    {"path": "style.yAxis.title.style.fontSize", "type": "number", "min": 8, "max": 48},
    {"path": "style.yAxis.title.style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.yAxis.title.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.yAxis.title.style.textAlign", "type": "string", "enumValues": ["left", "center", "right", "start", "end"]},
    {"path": "style.yAxis.title.style.textBaseline", "type": "string", "enumValues": ["top", "middle", "bottom"]},
    {"path": "style.legend", "type": "boolean", "allowFalse": true},
    {"path": "style.legend.position", "type": "string", "enumValues": ["left-top", "left", "left-bottom", "top-left", "top", "top-right", "right-top", "right", "right-bottom", "bottom-left", "bottom", "bottom-right"]},
    {"path": "style.legend.layout", "type": "string", "enumValues": ["horizontal", "vertical"]},
    {"path": "style.legend.flipPage", "type": "boolean"},
    {"path": "style.legend.maxRow", "type": "number", "min": 1, "max": 20},
    {"path": "style.legend.itemWidth", "type": "number", "min": 0, "max": 500},
    {"path": "style.legend.itemHeight", "type": "number", "min": 0, "max": 100},
    {"path": "style.legend.maxItemWidth", "type": "number", "min": 0, "max": 1000},
    {"path": "style.legend.maxWidth", "type": "number", "min": 0, "max": 2000},
    {"path": "style.legend.maxHeight", "type": "number", "min": 0, "max": 2000},
    {"path": "style.legend.title.text", "type": "string"},
    {"path": "style.legend.title.spacing", "type": "number", "min": 0, "max": 100},
    {"path": "style.legend.title.style.fill", "type": "color"},
    {"path": "style.legend.title.style.fontSize", "type": "number", "min": 8, "max": 48},
    {"path": "style.legend.title.style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.legend.itemName.spacing", "type": "number", "min": 0, "max": 100},
    {"path": "style.legend.itemName.style.fill", "type": "color"},
    {"path": "style.legend.itemName.style.fontSize", "type": "number", "min": 8, "max": 48},
    {"path": "style.legend.itemName.style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.legend.itemName.style.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.legend.itemValue.alignRight", "type": "boolean"},
    {"path": "style.legend.itemValue.style.fill", "type": "color"},
    {"path": "style.legend.itemValue.style.fontSize", "type": "number", "min": 8, "max": 48},
    {"path": "style.legend.itemValue.style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.legend.itemSpacing", "type": "number", "min": 0, "max": 100},
    {"path": "style.legend.itemMarginBottom", "type": "number", "min": 0, "max": 100},
    {"path": "style.legend.marker.symbol", "type": "string", "enumValues": ["circle", "square", "diamond", "triangle", "triangle-down", "hexagon", "bowtie", "cross", "tick", "plus", "hyphen", "line"]},
    {"path": "style.legend.marker.style.r", "type": "number", "min": 0, "max": 30},
    {"path": "style.legend.marker.style.fill", "type": "color"},
    {"path": "style.legend.marker.style.stroke", "type": "color"},
    {"path": "style.legend.marker.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.legend.background.padding", "type": "number", "min": 0, "max": 80},
    {"path": "style.legend.background.style.fill", "type": "color"},
    {"path": "style.legend.background.style.stroke", "type": "color"},
    {"path": "style.legend.background.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.tooltip", "type": "boolean", "allowFalse": true},
    {"path": "style.tooltip.fields", "type": "array"},
    {"path": "style.tooltip.shared", "type": "boolean"},
    {"path": "style.tooltip.showTitle", "type": "boolean"},
    {"path": "style.tooltip.title", "type": "string"},
    {"path": "style.tooltip.position", "type": "string", "enumValues": ["top", "bottom", "left", "right"]},
    {"path": "style.tooltip.follow", "type": "boolean"},
    {"path": "style.tooltip.enterable", "type": "boolean"},
    {"path": "style.tooltip.showMarkers", "type": "boolean"},
    {"path": "style.tooltip.showContent", "type": "boolean"},
    {"path": "style.tooltip.showCrosshairs", "type": "boolean"},
    {"path": "style.tooltip.offset", "type": "number", "min": 0, "max": 200},
    {"path": "style.tooltip.reversed", "type": "boolean"},
    {"path": "style.tooltip.showNil", "type": "boolean"},
    {"path": "style.tooltip.crosshairs.type", "type": "string", "enumValues": ["x", "y", "xy"]},
    {"path": "style.tooltip.crosshairs.line.style.stroke", "type": "color"},
    {"path": "style.tooltip.crosshairs.line.style.lineWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.tooltip.crosshairs.line.style.lineDash", "type": "array"},
    {"path": "style.annotations", "type": "array"},
    {"path": "style.slider", "type": "boolean", "allowFalse": true},
    {"path": "style.slider.start", "type": "number", "min": 0, "max": 1},
    {"path": "style.slider.end", "type": "number", "min": 0, "max": 1},
    {"path": "style.slider.height", "type": "number", "min": 0, "max": 120},
    {"path": "style.slider.minLimit", "type": "number", "min": 0, "max": 1},
    {"path": "style.slider.maxLimit", "type": "number", "min": 0, "max": 1},
    {"path": "style.slider.trendCfg.isArea", "type": "boolean"},
    {"path": "style.slider.trendCfg.smooth", "type": "boolean"},
    {"path": "style.slider.handlerStyle.width", "type": "number", "min": 0, "max": 80},
    {"path": "style.slider.handlerStyle.height", "type": "number", "min": 0, "max": 80},
    {"path": "style.slider.handlerStyle.fill", "type": "color"},
    {"path": "style.slider.handlerStyle.highLightFill", "type": "color"},
    {"path": "style.slider.handlerStyle.stroke", "type": "color"},
    {"path": "style.slider.handlerStyle.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.slider.handlerStyle.radius", "type": "number", "min": 0, "max": 40},
    {"path": "style.slider.handlerStyle.cursor", "type": "string"},
    {"path": "style.slider.backgroundStyle.fill", "type": "color"},
    {"path": "style.slider.backgroundStyle.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.slider.foregroundStyle.fill", "type": "color"},
    {"path": "style.slider.foregroundStyle.opacity", "type": "number", "min": 0, "max": 1},
    {"path": "style.slider.textStyle.fill", "type": "color"},
    {"path": "style.slider.textStyle.fontSize", "type": "number", "min": 8, "max": 48},
    {"path": "style.scrollbar", "type": "boolean", "allowFalse": true},
    {"path": "style.scrollbar.type", "type": "string", "enumValues": ["horizontal", "vertical"]},
    {"path": "style.scrollbar.categorySize", "type": "number", "min": 1, "max": 200}
  ]
}
```

### 限制与校验

**参考依据**

- G2Plot 柱状图官方文档：https://g2plot.antv.antgroup.com/api/plots/column
- 本组件基于 G2Plot `ColumnOptions`，默认开启 `isPercent: true` 和 `isStack: true`。字段映射默认为 `xField: "year"`、`yField: "value"`、`seriesField: "country"`。

**通用限制**

纯样式优化不能修改 `base`、`data`、`filter` 或图层布局。数据修改任务在读取组件数据说明书后，可以同时修改数据与字段映射，但最终数据属性必须与映射一致。纯样式优化不得修改 `xField`、`yField`、`seriesField`、`groupField`、`isPercent`、`isStack`、`isGroup`、`isRange`，否则可能破坏百分比柱状图语义。函数型配置不允许生成，例如 `formatter`、`callback`、`customContent`；坐标轴刻度标签内容改写需要数据或安全 formatter 能力，当前仅支持标题文本和标签样式/布局调整。

**百分比柱状图语义约束**

- `xField` 是分类字段，`yField` 是数值字段，AI 不得修改。
- `seriesField` 是分组字段，百分比堆叠效果依赖该字段，AI 不得修改。
- `isPercent` 固定为 `true`，AI 不得生成 `isPercent: false` 或移除该配置。
- `isStack` 固定为 `true`，AI 不得生成 `isStack: false` 或移除该配置。
- 百分比柱状图不是分组或区间柱状图，AI 不得生成 `groupField`、`isGroup`、`isRange`。
- `yField` 的原始数值由 G2Plot 转换为 0 到 1 的占比值；AI 只能调整显示样式，不能改写占比计算逻辑。
- AI 只能调整显示样式，不能改写数据、字段映射或数据源。

**颜色与渐变取值要求**

- 所有颜色值必须统一使用 hex 格式：`#RRGGBB` 或带透明度的 `#RRGGBBAA`。
- G2/G2Plot 线性渐变支持 `l(angle) offset:color offset:color`，例如 `l(135) 0:#43CBFFFF 1:#0090D9FF`。
- G2/G2Plot 径向渐变支持 `r(x,y,r) offset:color offset:color`，例如 `r(0.5,0.5,1) 0:#43CBFFFF 1:#0090D900`。
- 渐变 stop color 也必须使用 hex，不允许使用 `transparent`、`rgba(...)`、`rgb(...)`、英文色名或 CSS 变量。
- 需要透明渐隐时，使用 8 位 hex alpha，例如 `#0090D900`，不要写 `transparent`。
