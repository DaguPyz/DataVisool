<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# BaseText 组件说明

## 组件标识

```json
{
  "componentType": "BaseText",
  "componentName": "基础文本"
}
```

## 组件选择

```json
{
  "componentType": "BaseText",
  "componentName": "基础文本",
  "description": "基础文本组件，用于展示静态或数据驱动的文本内容，并响应点击事件，适用于标题、说明文字、标签文本、静态文案、数据驱动文本。",
  "nativeCapabilities": "单个静态或数据驱动文本块",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值应为字符串，用作组件显示的完整文本。不要传入对象或数组；其他原始值虽然可能被转换成文字，但不属于该组件的正确数据格式。

静态数据示例：`{"sourceType":"static","staticData":{"value":"系统运行正常"}}`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "color": "color，设置文字颜色；渐变文字时也保存渐变值",
    "fontSize": "number: 1-200，设置文字字号",
    "fontWeight": "number: 100-900，设置文字字重",
    "fontFamily": "string，设置文字字体",
    "alignItems": "flex-start | center | flex-end，设置垂直对齐",
    "justifyContent": "flex-start | center | flex-end，设置水平对齐",
    "strokeWidth": "number: 0-10，设置文字描边宽度",
    "strokeColor": "color，设置文字描边颜色",
    "letterSpacing": "number: 0-50，设置字距",
    "lineHeight": "number: 0-10，设置行距",
    "textAlign": "left | center | right，设置文本内部对齐",
    "backgroundImage": "string，设置渐变文字背景",
    "backgroundClip": "initial | text，设置背景裁剪",
    "WebkitBackgroundClip": "initial | text，设置 WebKit 背景裁剪",
    "WebkitTextFillColor": "initial | transparent，设置 WebKit 文字填充色",
    "cursor": "string，设置鼠标指针样式"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "BaseText",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color-or-config-panel-gradient-for-color",
  "allowedStylePaths": [
    {"path": "style.color", "type": "color"},
    {"path": "style.fontSize", "type": "number", "min": 1, "max": 200},
    {"path": "style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.fontFamily", "type": "string"},
    {"path": "style.alignItems", "type": "string", "enumValues": ["flex-start", "center", "flex-end"]},
    {"path": "style.justifyContent", "type": "string", "enumValues": ["flex-start", "center", "flex-end"]},
    {"path": "style.strokeWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.strokeColor", "type": "color"},
    {"path": "style.letterSpacing", "type": "number", "min": 0, "max": 50},
    {"path": "style.lineHeight", "type": "number", "min": 0, "max": 10},
    {"path": "style.textAlign", "type": "string", "enumValues": ["left", "center", "right"]},
    {"path": "style.backgroundImage", "type": "string"},
    {"path": "style.backgroundClip", "type": "string", "enumValues": ["initial", "text"]},
    {"path": "style.WebkitBackgroundClip", "type": "string", "enumValues": ["initial", "text"]},
    {"path": "style.WebkitTextFillColor", "type": "string", "enumValues": ["initial", "transparent"]},
    {"path": "style.cursor", "type": "string"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容来自组件自身的 `style` 属性设计。

**文本语义约束**

- `data.value` 是文本内容，不属于样式优化范围，AI 不得通过 `stylePatch` 修改。
- `click` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- 双击编辑文本是编辑模式下的组件行为，不属于样式优化范围。
- `alignItems` 控制垂直对齐，`justifyContent` 控制水平对齐，`textAlign` 控制多行文本内部对齐。
- 渐变文字需要同时设置 `backgroundImage`、`backgroundClip`、`WebkitBackgroundClip`、`WebkitTextFillColor`。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- `color` 可以使用普通颜色，也可以使用配置面板生成的渐变值。
- 普通文字颜色应只设置 `color`，并将渐变相关字段恢复为 `initial`。
- 渐变文字应将 `backgroundImage` 设置为同一个渐变值，并将 `WebkitTextFillColor` 设置为 `transparent`。
- `strokeColor` 应使用普通 CSS 颜色值。

**示例**

普通文字样式：

```json
{
  "componentType": "BaseText",
  "stylePatch": {
    "style": {
      "color": "#A7A7A7",
      "fontSize": 16,
      "fontWeight": 400,
      "fontFamily": "\"Poppins\", sans-serif",
      "alignItems": "center",
      "justifyContent": "center",
      "strokeColor": "#FFFFFF",
      "strokeWidth": 0,
      "letterSpacing": 0,
      "lineHeight": 1,
      "textAlign": "left",
      "backgroundImage": "initial",
      "backgroundClip": "initial",
      "WebkitBackgroundClip": "initial",
      "WebkitTextFillColor": "initial"
    }
  }
}
```

渐变文字样式：

```json
{
  "componentType": "BaseText",
  "stylePatch": {
    "style": {
      "color": "linear-gradient(90deg, #4FB8FF 0%, #FD5D93 100%)",
      "backgroundImage": "linear-gradient(90deg, #4FB8FF 0%, #FD5D93 100%)",
      "backgroundClip": "text",
      "WebkitBackgroundClip": "text",
      "WebkitTextFillColor": "transparent"
    }
  }
}
```
