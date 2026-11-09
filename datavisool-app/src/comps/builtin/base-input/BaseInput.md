<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# BaseInput 组件说明

## 组件标识

```json
{
  "componentType": "BaseInput",
  "componentName": "输入框"
}
```

## 组件选择

```json
{
  "componentType": "BaseInput",
  "componentName": "输入框",
  "description": "基础输入框组件，用于接收文本输入并响应点击、值改变事件，适用于文本输入、搜索条件、表单字段、筛选输入框。",
  "nativeCapabilities": "一个输入框的底板、边框、占位文字和输入文字",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件不支持通过 `dataPatch` 修改数据。

输入框内容由用户交互和样式配置管理，组件不读取 `data.value`。创建或修改时不要传入 `config.data` 或 `dataPatch`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "color": "color，设置输入文字颜色",
    "fontSize": "number: 1-200，设置输入文字字号",
    "fontWeight": "number: 100-900，设置输入文字字重",
    "fontFamily": "string，设置输入文字字体",
    "backgroundColor": "color，设置输入框默认背景",
    "borderRadius": "number: 0-200，设置输入框边框圆角",
    "borderWidth": "number: 0-50，设置输入框边框宽度",
    "borderColor": "color，设置输入框边框颜色",
    "borderStyle": "none | solid | dashed | dotted | double | groove | ridge | inset | outset，设置输入框边框样式",
    "backgroundColorHover": "color，设置悬浮背景",
    "borderRadiusHover": "number: 0-200，设置悬浮边框圆角",
    "borderWidthHover": "number: 0-50，设置悬浮边框宽度",
    "borderColorHover": "color，设置悬浮边框颜色"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "BaseInput",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color",
  "allowedStylePaths": [
    {"path": "style.color", "type": "color"},
    {"path": "style.fontSize", "type": "number", "min": 1, "max": 200},
    {"path": "style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.fontFamily", "type": "string"},
    {"path": "style.backgroundColor", "type": "color"},
    {"path": "style.borderRadius", "type": "number", "min": 0, "max": 200},
    {"path": "style.borderWidth", "type": "number", "min": 0, "max": 50},
    {"path": "style.borderColor", "type": "color"},
    {"path": "style.borderStyle", "type": "string", "enumValues": ["none", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"]},
    {"path": "style.backgroundColorHover", "type": "color"},
    {"path": "style.borderRadiusHover", "type": "number", "min": 0, "max": 200},
    {"path": "style.borderWidthHover", "type": "number", "min": 0, "max": 50},
    {"path": "style.borderColorHover", "type": "color"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容完全来自组件自身的 `style` 属性设计。

**输入框语义约束**

- 该组件当前没有定义 `placeholder`、`value`、`type` 等字段，AI 不得新增这些字段。
- `click` 和 `valueChange` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- `backgroundColorHover`、`borderRadiusHover`、`borderWidthHover`、`borderColorHover` 只在鼠标悬浮时生效。
- 聚焦态边框和阴影由组件样式文件固定控制，AI 不得新增未定义的聚焦态字段。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- 颜色字段应使用组件配置面板可表达的普通 CSS 颜色值。
- `backgroundColor` 和 `backgroundColorHover` 对应 CSS `background-color`，不建议使用渐变值。
- `color`、`borderColor`、`borderColorHover` 应使用普通颜色值。

**示例**

```json
{
  "componentType": "BaseInput",
  "stylePatch": {
    "style": {
      "color": "#FFFFFF",
      "fontSize": 14,
      "fontWeight": 400,
      "fontFamily": "\"Poppins\", sans-serif",
      "backgroundColor": "#27293D",
      "borderRadius": 6,
      "borderWidth": 1,
      "borderColor": "#3B4261",
      "borderStyle": "solid",
      "backgroundColorHover": "rgba(253, 93, 147, 0.1)",
      "borderRadiusHover": 6,
      "borderWidthHover": 1,
      "borderColorHover": "#FD5D93"
    }
  }
}
```
