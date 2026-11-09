<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# DigitalFlipper 组件说明

## 组件标识

```json
{
  "componentType": "DigitalFlipper",
  "componentName": "数字翻牌器"
}
```

## 组件选择

```json
{
  "componentType": "DigitalFlipper",
  "componentName": "数字翻牌器",
  "description": "数字翻牌器组件，用于展示数值，并支持前后缀、小数位、分隔符和翻牌动画，适用于核心指标数值、大屏 KPI、实时计数、金额或数量展示。",
  "nativeCapabilities": "一个数值、前后缀、小数和分隔符及翻牌动画",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是有限数字，用作翻牌器的目标数值。不要传入对象、数组、布尔值、`NaN` 或无穷值；小数位数和前后缀由样式配置控制。

静态数据示例：`{"sourceType":"static","staticData":{"value":12345.67}}`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "fontSize": "number: 0-200，设置数字字号",
    "fontWeight": "number: 0-900，设置数字字重",
    "fontFamily": "string，设置数字字体",
    "color": "color，设置数字颜色；渐变文字时也保存渐变值",
    "type": "slide | caper，设置翻牌动画类型",
    "alignItems": "flex-start | center | flex-end，设置垂直对齐",
    "justifyContent": "flex-start | center | flex-end，设置水平对齐",
    "prefix": "string，设置数字前缀",
    "suffix": "string，设置数字后缀",
    "decimalPlaces": "number: 0-20，设置小数位数",
    "separator": "string，设置数字分隔符",
    "duration": "number: 0-60，设置动画时长，单位秒",
    "backgroundImage": "string，设置渐变文字背景",
    "backgroundClip": "initial | text，设置背景裁剪",
    "WebkitBackgroundClip": "initial | text，设置 WebKit 背景裁剪",
    "WebkitTextFillColor": "initial | transparent，设置 WebKit 文字填充色"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "DigitalFlipper",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color-or-config-panel-gradient-for-color",
  "allowedStylePaths": [
    {"path": "style.fontSize", "type": "number", "min": 0, "max": 200},
    {"path": "style.fontWeight", "type": "number", "min": 0, "max": 900},
    {"path": "style.fontFamily", "type": "string"},
    {"path": "style.color", "type": "color"},
    {"path": "style.type", "type": "string", "enumValues": ["slide", "caper"]},
    {"path": "style.alignItems", "type": "string", "enumValues": ["flex-start", "center", "flex-end"]},
    {"path": "style.justifyContent", "type": "string", "enumValues": ["flex-start", "center", "flex-end"]},
    {"path": "style.prefix", "type": "string"},
    {"path": "style.suffix", "type": "string"},
    {"path": "style.decimalPlaces", "type": "number", "min": 0, "max": 20},
    {"path": "style.separator", "type": "string"},
    {"path": "style.duration", "type": "number", "min": 0, "max": 60},
    {"path": "style.backgroundImage", "type": "string"},
    {"path": "style.backgroundClip", "type": "string", "enumValues": ["initial", "text"]},
    {"path": "style.WebkitBackgroundClip", "type": "string", "enumValues": ["initial", "text"]},
    {"path": "style.WebkitTextFillColor", "type": "string", "enumValues": ["initial", "transparent"]}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容来自组件自身的 `style` 属性设计。

**数字语义约束**

- `data.value` 是实际数值，不属于样式优化范围，AI 不得通过 `stylePatch` 修改。
- `prefix` 和 `suffix` 只用于展示前后缀，不代表数值本身。
- `decimalPlaces` 只控制小数位显示，不改变原始数据。
- `separator` 只控制数字分隔符，不改变原始数据。
- `duration` 是翻牌动画时长，单位为秒。
- `type` 控制动画类型，`slide` 为滑动，`caper` 为跳动。
- 渐变文字仅适合 `type: "caper"`；`slide` 类型下不建议使用渐变文字。
- `click` 和 `dataChange` 是组件事件，不能通过样式补丁修改。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- `color` 可以使用普通颜色，也可以使用配置面板生成的渐变值。
- 普通颜色应只设置 `color`，并将渐变相关字段恢复为 `initial`。
- 渐变文字应将 `backgroundImage` 设置为同一个渐变值，并将 `WebkitTextFillColor` 设置为 `transparent`。

**示例**

普通数字样式：

```json
{
  "componentType": "DigitalFlipper",
  "stylePatch": {
    "style": {
      "fontSize": 20,
      "fontWeight": 500,
      "fontFamily": "Microsoft YaHei",
      "color": "#FFFFFF",
      "type": "caper",
      "justifyContent": "center",
      "alignItems": "center",
      "prefix": "",
      "suffix": "",
      "decimalPlaces": 0,
      "separator": ",",
      "duration": 1,
      "backgroundImage": "initial",
      "backgroundClip": "initial",
      "WebkitBackgroundClip": "initial",
      "WebkitTextFillColor": "initial"
    }
  }
}
```

渐变数字样式：

```json
{
  "componentType": "DigitalFlipper",
  "stylePatch": {
    "style": {
      "type": "caper",
      "color": "linear-gradient(90deg, #4FB8FF 0%, #FD5D93 100%)",
      "backgroundImage": "linear-gradient(90deg, #4FB8FF 0%, #FD5D93 100%)",
      "backgroundClip": "text",
      "WebkitBackgroundClip": "text",
      "WebkitTextFillColor": "transparent"
    }
  }
}
```
