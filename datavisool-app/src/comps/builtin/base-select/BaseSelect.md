<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# BaseSelect 组件说明

## 组件标识

```json
{
  "componentType": "BaseSelect",
  "componentName": "下拉框"
}
```

## 组件选择

```json
{
  "componentType": "BaseSelect",
  "componentName": "下拉框",
  "description": "基础下拉框组件，用于展示选项列表并响应点击、选项改变事件，适用于下拉筛选、选项选择、表单选择字段、条件切换。",
  "nativeCapabilities": "一个选择框的底板、当前值、下拉标记和选项列表",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是选项对象数组。每项必须包含 `label` 和 `value`：`label` 是显示文字，必须为字符串；`value` 是选项值，可以是字符串或数字；可选的 `disabled` 必须为布尔值。

静态数据示例：`{"sourceType":"static","staticData":{"value":[{"label":"选项一","value":"1"},{"label":"选项二","value":"2","disabled":true}]}}`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "fontSize": "number: 1-200，设置选择框文字字号",
    "fontFamily": "string，设置选择框文字字体",
    "selectorBg": "color，设置选择框主体背景",
    "colorText": "color，设置选择框文字颜色",
    "borderRadius": "number: 0-200，设置选择框边框圆角",
    "lineWidth": "number: 0-50，设置选择框边框宽度",
    "colorBorder": "color，设置选择框边框颜色",
    "colorPrimaryHover": "color，设置选择框悬浮边框颜色",
    "controlOutline": "color，设置选择框激活轮廓颜色",
    "borderRadiusLG": "number: 1-200，设置下拉面板边框圆角",
    "optionFontSize": "number: 1-200，设置选项文字字号",
    "optionHeight": "number: 1-200，设置选项高度",
    "optionSelectedBg": "color，设置选中项背景",
    "optionSelectedColor": "color，设置选中项文字颜色",
    "optionActiveBg": "color，设置悬浮项背景",
    "colorBgElevated": "color，设置下拉面板背景"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "BaseSelect",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color-or-config-panel-gradient-for-selectorBg",
  "allowedStylePaths": [
    {"path": "style.fontSize", "type": "number", "min": 1, "max": 200},
    {"path": "style.fontFamily", "type": "string"},
    {"path": "style.selectorBg", "type": "color"},
    {"path": "style.colorText", "type": "color"},
    {"path": "style.borderRadius", "type": "number", "min": 0, "max": 200},
    {"path": "style.lineWidth", "type": "number", "min": 0, "max": 50},
    {"path": "style.colorBorder", "type": "color"},
    {"path": "style.colorPrimaryHover", "type": "color"},
    {"path": "style.controlOutline", "type": "color"},
    {"path": "style.borderRadiusLG", "type": "number", "min": 1, "max": 200},
    {"path": "style.optionFontSize", "type": "number", "min": 1, "max": 200},
    {"path": "style.optionHeight", "type": "number", "min": 1, "max": 200},
    {"path": "style.optionSelectedBg", "type": "color"},
    {"path": "style.optionSelectedColor", "type": "color"},
    {"path": "style.optionActiveBg", "type": "color"},
    {"path": "style.colorBgElevated", "type": "color"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容完全来自组件自身的 `style` 属性设计。

**下拉框语义约束**

- `data.value` 是下拉选项数据，不属于样式优化范围，AI 不得通过 `stylePatch` 修改。
- 该组件当前没有定义 `placeholder`、`multiple`、`disabled`、`defaultValue` 等字段，AI 不得新增这些字段。
- `click` 和 `selectedChange` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- `selectorBg` 控制选择框主体背景，不代表选项数据。
- `optionSelectedBg`、`optionSelectedColor`、`optionActiveBg`、`colorBgElevated` 只用于下拉选项区域。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- 颜色字段应使用组件配置面板可表达的颜色值。
- `selectorBg` 对应 CSS `background`，可以使用普通颜色或配置面板生成的渐变值。
- `colorText`、`colorBorder`、`colorPrimaryHover`、`controlOutline`、`optionSelectedBg`、`optionSelectedColor`、`optionActiveBg`、`colorBgElevated` 应使用普通颜色值。

**示例**

```json
{
  "componentType": "BaseSelect",
  "stylePatch": {
    "style": {
      "fontSize": 16,
      "fontFamily": "\"Poppins\", \"Roboto\", \"Helvetica Neue\", Arial, sans-serif",
      "selectorBg": "#27293D",
      "colorText": "#FFFFFF",
      "borderRadius": 4,
      "lineWidth": 1,
      "colorBorder": "rgba(255, 255, 255, 0.2)",
      "colorPrimaryHover": "#FD5D93",
      "controlOutline": "rgba(253, 93, 147, 0.3)",
      "borderRadiusLG": 4,
      "optionFontSize": 14,
      "optionHeight": 32,
      "optionSelectedBg": "rgba(253, 93, 147, 0.15)",
      "optionSelectedColor": "#FFFFFF",
      "optionActiveBg": "rgba(29, 140, 248, 0.2)",
      "colorBgElevated": "#1E1E2F"
    }
  }
}
```
