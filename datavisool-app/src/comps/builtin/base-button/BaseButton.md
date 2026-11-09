<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# BaseButton 组件说明

## 组件标识

```json
{
  "componentType": "BaseButton",
  "componentName": "按钮"
}
```

## 组件选择

```json
{
  "componentType": "BaseButton",
  "componentName": "按钮",
  "description": "基础按钮组件，用于展示按钮文本并响应点击事件，适用于操作按钮、工具栏动作、表单提交、页面跳转入口。",
  "nativeCapabilities": "一个按钮的底板、边框和按钮文字",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件不支持通过 `dataPatch` 修改数据。

按钮显示内容由样式配置提供，组件不会读取 `data.value`。创建或修改按钮时不要传入 `config.data` 或 `dataPatch`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "content": "string，设置按钮文本",
    "color": "color，设置按钮文字颜色",
    "fontSize": "number: 1-200，设置按钮文字字号",
    "fontWeight": "number: 100-900，设置按钮文字字重",
    "fontFamily": "string，设置按钮文字字体",
    "letterSpacing": "number: 0-50，设置按钮文字字间距",
    "backgroundColor": "color，设置按钮默认背景",
    "borderRadius": "number: 0-200，设置按钮边框圆角",
    "borderWidth": "number: 0-50，设置按钮边框宽度",
    "borderColor": "color，设置按钮边框颜色",
    "borderStyle": "none | solid | dashed | dotted | double | groove | ridge | inset | outset，设置按钮边框样式",
    "speed": "number: 0-10，设置悬浮扫描动画速度，单位秒",
    "scannerColor": "color，设置悬浮扫描光颜色",
    "hoverShadow": "color，设置悬浮阴影颜色",
    "hoverBackgroundColor": "color，设置悬浮背景"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "BaseButton",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color-or-config-panel-gradient",
  "allowedStylePaths": [
    {"path": "style.content", "type": "string"},
    {"path": "style.color", "type": "color"},
    {"path": "style.fontSize", "type": "number", "min": 1, "max": 200},
    {"path": "style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.fontFamily", "type": "string"},
    {"path": "style.letterSpacing", "type": "number", "min": 0, "max": 50},
    {"path": "style.backgroundColor", "type": "color"},
    {"path": "style.borderRadius", "type": "number", "min": 0, "max": 200},
    {"path": "style.borderWidth", "type": "number", "min": 0, "max": 50},
    {"path": "style.borderColor", "type": "color"},
    {"path": "style.borderStyle", "type": "string", "enumValues": ["none", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"]},
    {"path": "style.speed", "type": "number", "min": 0, "max": 10},
    {"path": "style.scannerColor", "type": "color"},
    {"path": "style.hoverShadow", "type": "color"},
    {"path": "style.hoverBackgroundColor", "type": "color"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容完全来自组件自身的 `style` 属性设计。

**按钮语义约束**

- `content` 是按钮展示文本，可以按视觉目标调整，但不要改写为与用户需求无关的文案。
- `speed` 只控制悬浮扫描动画速度，不代表业务数据。
- `hoverBackgroundColor`、`hoverShadow`、`scannerColor` 只在鼠标悬浮时生效。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- 颜色字段应使用组件配置面板可表达的颜色值。
- `backgroundColor` 和 `hoverBackgroundColor` 对应 CSS `background`，可以使用普通颜色或配置面板生成的渐变值。
- `borderColor`、`color`、`scannerColor`、`hoverShadow` 应使用普通颜色值。

**示例**

```json
{
  "componentType": "BaseButton",
  "stylePatch": {
    "style": {
      "content": "提交",
      "color": "#FFFFFF",
      "fontSize": 16,
      "fontWeight": 600,
      "backgroundColor": "#1677FF",
      "borderRadius": 6,
      "borderWidth": 0,
      "borderColor": "transparent",
      "borderStyle": "solid",
      "hoverBackgroundColor": "#4096FF",
      "scannerColor": "#FFFFFF",
      "hoverShadow": "#1677FF66",
      "speed": 0.3
    }
  }
}
```
