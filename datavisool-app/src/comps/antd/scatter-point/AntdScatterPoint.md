<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# AntdScatterPoint 组件说明

## 组件标识

```json
{
  "componentType": "AntdScatterPoint",
  "componentName": "Antd散点图"
}
```

## 组件选择

```json
{
  "componentType": "AntdScatterPoint",
  "componentName": "Antd散点图",
  "description": "散点图组件，用于展示 x 值和 y 值之间的分布关系，适用于相关性分析、分布观察、异常点识别、二维指标对比。",
  "nativeCapabilities": "散点、坐标轴、完整图例、数据标签、提示框、标注、滚动条",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。最终 `data.value` 必须是对象数组；`style.xField` 和 `style.yField` 指向数值坐标属性，`style.sizeField` 指向数值大小属性，`style.colorField` 指向分类属性。属性名不固定，但所有映射必须与每条数据一致；重命名属性时必须同步修改映射。允许空数组和额外属性。最小数据示例：`[{"x":1,"y":2,"type":"A"}]`。

### 配置字段

AI 可以生成的 `stylePatch` 顶层只能包含 `style`，其 `style` 对象层级如下。`legend`、`tooltip`、`xAxis`、`yAxis`、`slider`、`scrollbar` 可以直接设为 `false` 隐藏；`xAxis.label`、`xAxis.line`、`xAxis.grid`、`xAxis.tickLine`、`xAxis.subTickLine`、`xAxis.title`、`yAxis.label`、`yAxis.line`、`yAxis.grid`、`yAxis.tickLine`、`yAxis.subTickLine`、`yAxis.title` 可以设为 `null` 隐藏。

下列 `<g2plot-…>` 是公共配置片段标识。运行前，相关片段会经检索注入 Agent 上下文；应按同名片段解释该键的可用配置：对象配置项使用片段内的字段，单个配置项只取片段中的同名字段。生成 `stylePatch` 时必须输出具体字段和值，遵守本组件的差异说明与校验规则，不得输出片段标识。

```json
{
  "style": {
    "padding": "<g2plot-canvas>",
    "appendPadding": "<g2plot-canvas>",
    "limitInPlot": "<g2plot-canvas>",
    "supportCSSTransform": "<g2plot-canvas>",
    "color": "<g2plot-scatter-plot>",
    "size": "<g2plot-scatter-plot>",
    "shape": "<g2plot-scatter-plot>",
    "pointStyle": "<g2plot-point-style>",
    "quadrant": "<g2plot-quadrant>",
    "regressionLine": "<g2plot-regression-line>",
    "xAxis": "<g2plot-axis-extended>",
    "yAxis": "<g2plot-axis-extended>",
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
  "componentType": "AntdScatterPoint",
  "forbiddenPaths": ["base","data","filter","style.xField","style.yField","style.sizeField","style.colorField","style.shapeField","style.regressionLine.algorithm"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "hex-or-g2-gradient-with-hex-stops",
  "allowedStylePaths": [
    {"path":"style.padding","type":"numberOrArrayOrAuto","min":0,"max":500},
    {"path":"style.appendPadding","type":"numberOrArray","min":0,"max":500},
    {"path":"style.limitInPlot","type":"boolean"},
    {"path":"style.supportCSSTransform","type":"boolean"},
    {"path":"style.color","type":"color"},
    {"path":"style.size","type":"numberOrArray","min":0,"max":200},
    {"path":"style.shape","type":"string","enumValues":["circle","square","bowtie","diamond","hexagon","triangle"]},
    {"path":"style.pointStyle.fill","type":"color"},
    {"path":"style.pointStyle.fillOpacity","type":"number","min":0,"max":1},
    {"path":"style.pointStyle.stroke","type":"color"},
    {"path":"style.pointStyle.lineWidth","type":"number","min":0,"max":20},
    {"path":"style.pointStyle.lineDash","type":"array"},
    {"path":"style.pointStyle.lineOpacity","type":"number","min":0,"max":1},
    {"path":"style.pointStyle.strokeOpacity","type":"number","min":0,"max":1},
    {"path":"style.pointStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.pointStyle.shadowColor","type":"color"},
    {"path":"style.pointStyle.shadowBlur","type":"number","min":0,"max":100},
    {"path":"style.pointStyle.shadowOffsetX","type":"number","min":-100,"max":100},
    {"path":"style.pointStyle.shadowOffsetY","type":"number","min":-100,"max":100},
    {"path":"style.pointStyle.cursor","type":"string"},
    {"path":"style.quadrant.xBaseline","type":"number"},
    {"path":"style.quadrant.yBaseline","type":"number"},
    {"path":"style.quadrant.lineStyle.stroke","type":"color"},
    {"path":"style.quadrant.lineStyle.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.quadrant.lineStyle.lineDash","type":"array"},
    {"path":"style.quadrant.lineStyle.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.quadrant.lineStyle.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.quadrant.lineStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.quadrant.regionStyle","type":"array"},
    {"path":"style.quadrant.labels","type":"array"},
    {"path":"style.regressionLine.top","type":"boolean"},
    {"path":"style.regressionLine.type","type":"string","enumValues":["linear","exp","loess","log","poly","pow","quad"]},
    {"path":"style.regressionLine.style.stroke","type":"color"},
    {"path":"style.regressionLine.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.regressionLine.style.lineDash","type":"array"},
    {"path":"style.regressionLine.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.regressionLine.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.regressionLine.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.regressionLine.showEquation","type":"boolean"},
    {"path":"style.regressionLine.equation","type":"string"},
    {"path":"style.regressionLine.equationStyle.fill","type":"color"},
    {"path":"style.regressionLine.equationStyle.fontSize","type":"number","min":8,"max":48},
    {"path":"style.regressionLine.equationStyle.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.xAxis","type":"boolean","allowFalse":true},
    {"path":"style.xAxis.alias","type":"string"},
    {"path":"style.xAxis.range","type":"array"},
    {"path":"style.xAxis.tickCount","type":"number","min":0,"max":50},
    {"path":"style.xAxis.tickInterval","type":"number","min":0,"max":1000000},
    {"path":"style.xAxis.nice","type":"boolean"},
    {"path":"style.xAxis.min","type":"number"},
    {"path":"style.xAxis.max","type":"number"},
    {"path":"style.xAxis.minLimit","type":"number"},
    {"path":"style.xAxis.maxLimit","type":"number"},
    {"path":"style.xAxis.top","type":"boolean"},
    {"path":"style.xAxis.position","type":"string","enumValues":["top","bottom","left","right"]},
    {"path":"style.xAxis.verticalLimitLength","type":"number","min":0,"max":1000},
    {"path":"style.xAxis.verticalFactor","type":"number","min":-1,"max":1},
    {"path":"style.xAxis.animate","type":"boolean"},
    {"path":"style.xAxis.label","type":"null","allowNull":true},
    {"path":"style.xAxis.label.offset","type":"number","min":-100,"max":100},
    {"path":"style.xAxis.label.offsetX","type":"number","min":-100,"max":100},
    {"path":"style.xAxis.label.offsetY","type":"number","min":-100,"max":100},
    {"path":"style.xAxis.label.rotate","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.xAxis.label.autoRotate","type":"boolean"},
    {"path":"style.xAxis.label.autoHide","type":"boolean"},
    {"path":"style.xAxis.label.autoEllipsis","type":"boolean"},
    {"path":"style.xAxis.label.style.fill","type":"color"},
    {"path":"style.xAxis.label.style.fontSize","type":"number","min":8,"max":48},
    {"path":"style.xAxis.label.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.xAxis.label.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.xAxis.label.style.textAlign","type":"string","enumValues":["left","center","right","start","end"]},
    {"path":"style.xAxis.label.style.textBaseline","type":"string","enumValues":["top","middle","bottom"]},
    {"path":"style.xAxis.line","type":"null","allowNull":true},
    {"path":"style.xAxis.line.style.stroke","type":"color"},
    {"path":"style.xAxis.line.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.xAxis.line.style.lineDash","type":"array"},
    {"path":"style.xAxis.line.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.xAxis.line.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.xAxis.line.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.xAxis.grid","type":"null","allowNull":true},
    {"path":"style.xAxis.grid.alternateColor","type":"color"},
    {"path":"style.xAxis.grid.closed","type":"boolean"},
    {"path":"style.xAxis.grid.alignTick","type":"boolean"},
    {"path":"style.xAxis.grid.line.type","type":"string","enumValues":["line","circle"]},
    {"path":"style.xAxis.grid.line.style.stroke","type":"color"},
    {"path":"style.xAxis.grid.line.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.xAxis.grid.line.style.lineDash","type":"array"},
    {"path":"style.xAxis.grid.line.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.xAxis.grid.line.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.xAxis.grid.line.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.xAxis.tickLine","type":"null","allowNull":true},
    {"path":"style.xAxis.tickLine.alignTick","type":"boolean"},
    {"path":"style.xAxis.tickLine.length","type":"number","min":0,"max":50},
    {"path":"style.xAxis.tickLine.style.stroke","type":"color"},
    {"path":"style.xAxis.tickLine.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.xAxis.tickLine.style.lineDash","type":"array"},
    {"path":"style.xAxis.tickLine.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.xAxis.tickLine.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.xAxis.tickLine.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.xAxis.subTickLine","type":"null","allowNull":true},
    {"path":"style.xAxis.subTickLine.count","type":"number","min":0,"max":20},
    {"path":"style.xAxis.subTickLine.length","type":"number","min":0,"max":50},
    {"path":"style.xAxis.subTickLine.style.stroke","type":"color"},
    {"path":"style.xAxis.subTickLine.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.xAxis.subTickLine.style.lineDash","type":"array"},
    {"path":"style.xAxis.subTickLine.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.xAxis.subTickLine.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.xAxis.subTickLine.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.xAxis.title","type":"null","allowNull":true},
    {"path":"style.xAxis.title.text","type":"string"},
    {"path":"style.xAxis.title.offset","type":"number","min":-100,"max":100},
    {"path":"style.xAxis.title.spacing","type":"number","min":0,"max":100},
    {"path":"style.xAxis.title.autoRotate","type":"boolean"},
    {"path":"style.xAxis.title.rotation","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.xAxis.title.position","type":"string","enumValues":["start","center","end"]},
    {"path":"style.xAxis.title.style.fill","type":"color"},
    {"path":"style.xAxis.title.style.fontSize","type":"number","min":8,"max":48},
    {"path":"style.xAxis.title.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.xAxis.title.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.xAxis.title.style.textAlign","type":"string","enumValues":["left","center","right","start","end"]},
    {"path":"style.xAxis.title.style.textBaseline","type":"string","enumValues":["top","middle","bottom"]},
    {"path":"style.yAxis","type":"boolean","allowFalse":true},
    {"path":"style.yAxis.alias","type":"string"},
    {"path":"style.yAxis.range","type":"array"},
    {"path":"style.yAxis.tickCount","type":"number","min":0,"max":50},
    {"path":"style.yAxis.tickInterval","type":"number","min":0,"max":1000000},
    {"path":"style.yAxis.nice","type":"boolean"},
    {"path":"style.yAxis.min","type":"number"},
    {"path":"style.yAxis.max","type":"number"},
    {"path":"style.yAxis.minLimit","type":"number"},
    {"path":"style.yAxis.maxLimit","type":"number"},
    {"path":"style.yAxis.top","type":"boolean"},
    {"path":"style.yAxis.position","type":"string","enumValues":["top","bottom","left","right"]},
    {"path":"style.yAxis.verticalLimitLength","type":"number","min":0,"max":1000},
    {"path":"style.yAxis.verticalFactor","type":"number","min":-1,"max":1},
    {"path":"style.yAxis.animate","type":"boolean"},
    {"path":"style.yAxis.label","type":"null","allowNull":true},
    {"path":"style.yAxis.label.offset","type":"number","min":-100,"max":100},
    {"path":"style.yAxis.label.offsetX","type":"number","min":-100,"max":100},
    {"path":"style.yAxis.label.offsetY","type":"number","min":-100,"max":100},
    {"path":"style.yAxis.label.rotate","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.yAxis.label.autoRotate","type":"boolean"},
    {"path":"style.yAxis.label.autoHide","type":"boolean"},
    {"path":"style.yAxis.label.autoEllipsis","type":"boolean"},
    {"path":"style.yAxis.label.style.fill","type":"color"},
    {"path":"style.yAxis.label.style.fontSize","type":"number","min":8,"max":48},
    {"path":"style.yAxis.label.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.yAxis.label.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.yAxis.label.style.textAlign","type":"string","enumValues":["left","center","right","start","end"]},
    {"path":"style.yAxis.label.style.textBaseline","type":"string","enumValues":["top","middle","bottom"]},
    {"path":"style.yAxis.line","type":"null","allowNull":true},
    {"path":"style.yAxis.line.style.stroke","type":"color"},
    {"path":"style.yAxis.line.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.yAxis.line.style.lineDash","type":"array"},
    {"path":"style.yAxis.line.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.yAxis.line.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.yAxis.line.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.yAxis.grid","type":"null","allowNull":true},
    {"path":"style.yAxis.grid.alternateColor","type":"color"},
    {"path":"style.yAxis.grid.closed","type":"boolean"},
    {"path":"style.yAxis.grid.alignTick","type":"boolean"},
    {"path":"style.yAxis.grid.line.type","type":"string","enumValues":["line","circle"]},
    {"path":"style.yAxis.grid.line.style.stroke","type":"color"},
    {"path":"style.yAxis.grid.line.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.yAxis.grid.line.style.lineDash","type":"array"},
    {"path":"style.yAxis.grid.line.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.yAxis.grid.line.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.yAxis.grid.line.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.yAxis.tickLine","type":"null","allowNull":true},
    {"path":"style.yAxis.tickLine.alignTick","type":"boolean"},
    {"path":"style.yAxis.tickLine.length","type":"number","min":0,"max":50},
    {"path":"style.yAxis.tickLine.style.stroke","type":"color"},
    {"path":"style.yAxis.tickLine.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.yAxis.tickLine.style.lineDash","type":"array"},
    {"path":"style.yAxis.tickLine.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.yAxis.tickLine.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.yAxis.tickLine.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.yAxis.subTickLine","type":"null","allowNull":true},
    {"path":"style.yAxis.subTickLine.count","type":"number","min":0,"max":20},
    {"path":"style.yAxis.subTickLine.length","type":"number","min":0,"max":50},
    {"path":"style.yAxis.subTickLine.style.stroke","type":"color"},
    {"path":"style.yAxis.subTickLine.style.lineWidth","type":"number","min":0,"max":10},
    {"path":"style.yAxis.subTickLine.style.lineDash","type":"array"},
    {"path":"style.yAxis.subTickLine.style.lineJoin","type":"string","enumValues":["miter","round","bevel"]},
    {"path":"style.yAxis.subTickLine.style.lineCap","type":"string","enumValues":["butt","round","square"]},
    {"path":"style.yAxis.subTickLine.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.yAxis.title","type":"null","allowNull":true},
    {"path":"style.yAxis.title.text","type":"string"},
    {"path":"style.yAxis.title.offset","type":"number","min":-100,"max":100},
    {"path":"style.yAxis.title.spacing","type":"number","min":0,"max":100},
    {"path":"style.yAxis.title.autoRotate","type":"boolean"},
    {"path":"style.yAxis.title.rotation","type":"number","min":-6.2832,"max":6.2832},
    {"path":"style.yAxis.title.position","type":"string","enumValues":["start","center","end"]},
    {"path":"style.yAxis.title.style.fill","type":"color"},
    {"path":"style.yAxis.title.style.fontSize","type":"number","min":8,"max":48},
    {"path":"style.yAxis.title.style.fontWeight","type":"number","min":100,"max":900},
    {"path":"style.yAxis.title.style.opacity","type":"number","min":0,"max":1},
    {"path":"style.yAxis.title.style.textAlign","type":"string","enumValues":["left","center","right","start","end"]},
    {"path":"style.yAxis.title.style.textBaseline","type":"string","enumValues":["top","middle","bottom"]},
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
    {"path":"style.annotations","type":"array"},
    {"path":"style.slider","type":"boolean","allowFalse":true},
    {"path":"style.slider.start","type":"number","min":0,"max":1},
    {"path":"style.slider.end","type":"number","min":0,"max":1},
    {"path":"style.slider.height","type":"number","min":0,"max":120},
    {"path":"style.slider.minLimit","type":"number","min":0,"max":1},
    {"path":"style.slider.maxLimit","type":"number","min":0,"max":1},
    {"path":"style.slider.trendCfg.isArea","type":"boolean"},
    {"path":"style.slider.trendCfg.smooth","type":"boolean"},
    {"path":"style.slider.handlerStyle.width","type":"number","min":0,"max":80},
    {"path":"style.slider.handlerStyle.height","type":"number","min":0,"max":80},
    {"path":"style.slider.handlerStyle.fill","type":"color"},
    {"path":"style.slider.handlerStyle.highLightFill","type":"color"},
    {"path":"style.slider.handlerStyle.stroke","type":"color"},
    {"path":"style.slider.handlerStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.slider.handlerStyle.radius","type":"number","min":0,"max":40},
    {"path":"style.slider.handlerStyle.cursor","type":"string"},
    {"path":"style.slider.backgroundStyle.fill","type":"color"},
    {"path":"style.slider.backgroundStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.slider.foregroundStyle.fill","type":"color"},
    {"path":"style.slider.foregroundStyle.opacity","type":"number","min":0,"max":1},
    {"path":"style.slider.textStyle.fill","type":"color"},
    {"path":"style.slider.textStyle.fontSize","type":"number","min":8,"max":48},
    {"path":"style.scrollbar","type":"boolean","allowFalse":true},
    {"path":"style.scrollbar.type","type":"string","enumValues":["horizontal","vertical"]},
    {"path":"style.scrollbar.categorySize","type":"number","min":1,"max":200}
  ]
}
```

### 限制与校验

**参考依据**

- G2Plot 散点图官方文档：https://g2plot.antv.antgroup.com/api/plots/scatter
- 本组件基于 G2Plot `ScatterOptions`，字段映射默认为 `xField: "x"`、`yField: "y"`、`sizeField: "y"`、`colorField: "type"`。

**通用限制**

纯样式优化不能修改 `base`、`data`、`filter` 或图层布局。数据修改任务在读取组件数据说明书后，可以同时修改数据与字段映射，但最终数据属性必须与映射一致。纯样式优化不得修改 `xField`、`yField`、`sizeField`、`colorField`、`shapeField`，否则可能破坏散点图语义。函数型配置不允许生成，例如 `formatter`、`callback`、`customContent`；坐标轴刻度标签内容改写需要数据或安全 formatter 能力，当前仅支持标题文本和标签样式/布局调整。

**散点图语义约束**

- `xField`、`yField` 决定点位坐标，AI 不得修改。
- `sizeField` 决定大小映射字段，AI 不得修改字段名。
- `size` 只允许调整视觉大小，不代表真实数据值。
- 不得生成 `regressionLine.algorithm` 函数或其他会改变数据分析口径的配置。

**颜色与渐变取值要求**

- 所有颜色值必须统一使用 hex 格式：`#RRGGBB` 或带透明度的 `#RRGGBBAA`。
- G2/G2Plot 线性渐变支持 `l(angle) offset:color offset:color`，例如 `l(90) 0:#2F82FFFF 1:#CD4DFFFF`。
- G2/G2Plot 径向渐变支持 `r(x,y,r) offset:color offset:color`，例如 `r(0.5,0.5,1) 0:#43CBFFFF 1:#0090D900`。
- 渐变 stop color 也必须使用 hex，不允许使用 `transparent`、`rgba(...)`、`rgb(...)`、英文色名或 CSS 变量。
- 需要透明渐隐时，使用 8 位 hex alpha，例如 `#0090D900`，不要写 `transparent`。
