<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# BaseTab 组件说明

## 组件标识

```json
{
  "componentType": "BaseTab",
  "componentName": "按钮选项卡"
}
```

## 组件选择

```json
{
  "componentType": "BaseTab",
  "componentName": "按钮选项卡",
  "description": "按钮选项卡组件，用于展示选项列表并响应选中改变、值变化和点击选项事件，适用于页签切换、分类筛选、菜单选项、状态分组切换。",
  "nativeCapabilities": "整组选项按钮、选项文字和选中状态",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是选项对象数组。每项必须包含 `label` 和 `value`：`label` 是显示文字，必须为字符串；`value` 可以是字符串或数字；可选的 `disabled` 必须为布尔值。`value` 应在数组中保持唯一。

静态数据示例：`{"sourceType":"static","staticData":{"value":[{"label":"选项一","value":"1"},{"label":"选项二","value":"2"}]}}`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "fontFamily": "string，设置选项文字字体",
    "containerBgColor": "color，设置容器背景颜色",
    "containerRadius": "number: 0-100，设置容器圆角",
    "containerBorderWidth": "number: 0-10，设置容器边框宽度",
    "containerBorderColor": "color，设置容器边框颜色",
    "containerPadding": "number: 0-50，设置容器内边距",
    "itemGap": "number: 0-100，设置选项间距",
    "containerShadow": "string，设置容器阴影",
    "layout": "horizontal | vertical，设置选项排列方向",
    "justifyContent": "flex-start | center | flex-end | space-between，设置选项对齐方式",
    "flexWrap": "boolean，设置选项是否自动换行",
    "mode": "single | multiple，设置单选或多选模式",
    "itemBgColor": "color，设置默认项背景",
    "itemColor": "color，设置默认项文字颜色",
    "itemRadius": "number: 0-50，设置默认项圆角",
    "itemBorderWidth": "number: 0-5，设置默认项边框宽度",
    "itemBorderColor": "color，设置默认项边框颜色",
    "itemFontSize": "number: 8-72，设置默认项文字字号",
    "itemFontWeight": "number: 100-900，设置默认项文字字重",
    "itemHeight": "number: 20-100，设置默认项高度",
    "itemMinWidth": "number: 0-300，设置默认项最小宽度",
    "itemPadding": "string，设置默认项内边距",
    "itemShadow": "string，设置默认项阴影",
    "activeBgColor": "color，设置选中项背景",
    "activeColor": "color，设置选中项文字颜色",
    "activeBorderColor": "color，设置选中项边框颜色",
    "activeFontWeight": "number: 100-900，设置选中项文字字重",
    "activeShadow": "string，设置选中项阴影",
    "itemHoverBgColor": "color，设置悬浮项背景",
    "itemHoverColor": "color，设置悬浮项文字颜色",
    "itemHoverBorderColor": "color，设置悬浮项边框颜色"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "BaseTab",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color",
  "allowedStylePaths": [
    {"path": "style.fontFamily", "type": "string"},
    {"path": "style.containerBgColor", "type": "color"},
    {"path": "style.containerRadius", "type": "number", "min": 0, "max": 100},
    {"path": "style.containerBorderWidth", "type": "number", "min": 0, "max": 10},
    {"path": "style.containerBorderColor", "type": "color"},
    {"path": "style.containerPadding", "type": "number", "min": 0, "max": 50},
    {"path": "style.itemGap", "type": "number", "min": 0, "max": 100},
    {"path": "style.containerShadow", "type": "string"},
    {"path": "style.layout", "type": "string", "enumValues": ["horizontal", "vertical"]},
    {"path": "style.justifyContent", "type": "string", "enumValues": ["flex-start", "center", "flex-end", "space-between"]},
    {"path": "style.flexWrap", "type": "boolean"},
    {"path": "style.mode", "type": "string", "enumValues": ["single", "multiple"]},
    {"path": "style.itemBgColor", "type": "color"},
    {"path": "style.itemColor", "type": "color"},
    {"path": "style.itemRadius", "type": "number", "min": 0, "max": 50},
    {"path": "style.itemBorderWidth", "type": "number", "min": 0, "max": 5},
    {"path": "style.itemBorderColor", "type": "color"},
    {"path": "style.itemFontSize", "type": "number", "min": 8, "max": 72},
    {"path": "style.itemFontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.itemHeight", "type": "number", "min": 20, "max": 100},
    {"path": "style.itemMinWidth", "type": "number", "min": 0, "max": 300},
    {"path": "style.itemPadding", "type": "string"},
    {"path": "style.itemShadow", "type": "string"},
    {"path": "style.activeBgColor", "type": "color"},
    {"path": "style.activeColor", "type": "color"},
    {"path": "style.activeBorderColor", "type": "color"},
    {"path": "style.activeFontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.activeShadow", "type": "string"},
    {"path": "style.itemHoverBgColor", "type": "color"},
    {"path": "style.itemHoverColor", "type": "color"},
    {"path": "style.itemHoverBorderColor", "type": "color"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局尺寸。该组件的可优化内容来自组件自身的 `style` 属性设计。

**选项卡语义约束**

- `data.value` 是选项数据，不属于样式优化范围，AI 不得通过 `stylePatch` 修改选项文本、值或禁用状态。
- `change`、`valueChange`、`click` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- `mode` 会影响单选或多选行为，只应在用户明确要求时调整。
- `layout`、`justifyContent`、`flexWrap` 只控制组件内部选项排列，不得修改组件外部宽高。
- `itemPadding` 应使用合法 CSS 内边距写法，例如 `"4px 12px"`。
- `containerShadow`、`itemShadow`、`activeShadow` 应使用合法 CSS 阴影值。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- 颜色字段应使用组件配置面板可表达的普通 CSS 颜色值。
- `containerBgColor` 控制容器背景。
- `itemBgColor`、`itemColor`、`itemBorderColor` 控制未选中项样式。
- `activeBgColor`、`activeColor`、`activeBorderColor` 控制选中项样式。
- `itemHoverBgColor`、`itemHoverColor`、`itemHoverBorderColor` 只在鼠标悬浮未选中项时生效。

**示例**

```json
{
  "componentType": "BaseTab",
  "stylePatch": {
    "style": {
      "fontFamily": "",
      "containerBgColor": "transparent",
      "containerRadius": 8,
      "containerBorderWidth": 0,
      "containerBorderColor": "transparent",
      "containerPadding": 4,
      "itemGap": 8,
      "containerShadow": "none",
      "layout": "horizontal",
      "justifyContent": "flex-start",
      "flexWrap": false,
      "mode": "single",
      "itemBgColor": "#2C2C3E",
      "itemColor": "#A0A0B2",
      "itemRadius": 4,
      "itemBorderWidth": 1,
      "itemBorderColor": "#3A3A4E",
      "itemFontSize": 14,
      "itemFontWeight": 400,
      "itemHeight": 32,
      "itemMinWidth": 80,
      "itemPadding": "4px 12px",
      "itemShadow": "none",
      "activeBgColor": "#4FB8FF",
      "activeColor": "#FFFFFF",
      "activeBorderColor": "transparent",
      "activeFontWeight": 600,
      "activeShadow": "0 2px 8px rgba(79, 184, 255, 0.3)",
      "itemHoverBgColor": "#343447",
      "itemHoverColor": "#FFFFFF",
      "itemHoverBorderColor": "#4FB8FF"
    }
  }
}
```
