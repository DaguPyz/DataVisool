<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# Switch 组件说明

## 组件标识

```json
{
  "componentType": "Switch",
  "componentName": "开关组件"
}
```

## 组件选择

```json
{
  "componentType": "Switch",
  "componentName": "开关组件",
  "description": "基础开关组件，用于展示布尔开关状态并响应状态改变、点击、开启、关闭、切换和值变化事件，适用于布尔开关、启停状态、功能开关、筛选开关。",
  "nativeCapabilities": "一个开关的轨道、滑块和开关状态",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是布尔值：`true` 表示开启，`false` 表示关闭。不要使用字符串 `"true"`、`"false"` 或数字代替布尔值。

静态数据示例：`{"sourceType":"static","staticData":{"value":true}}`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "token": {
      "colorPrimary": "color，设置开关主色",
      "colorPrimaryHover": "color，设置开关悬浮色",
      "colorPrimaryBorder": "color，设置开关边框色",
      "colorText": "color，设置开关文本色",
      "colorTextLightSolid": "color，设置开关状态文本色",
      "fontSize": "number: 1-200，设置开关内部文字字号"
    },
    "components": {
      "handleSize": "number: 0-200，设置开关把手尺寸",
      "trackHeight": "number: 0-200，设置开关轨道高度",
      "trackMinWidth": "number: 0-300，设置开关轨道最小宽度",
      "trackPadding": "number: 0-50，设置开关轨道内边距",
      "handleBg": "color，设置开关把手背景",
      "colorBgContainer": "color，设置开关容器背景"
    },
    "props": {
      "size": "default | small，设置开关尺寸",
      "loading": "boolean，设置加载状态",
      "disabled": "boolean，设置禁用状态",
      "checkedChildren": "string，设置开启时文本",
      "unCheckedChildren": "string，设置关闭时文本"
    },
    "label": {
      "content": "string，设置外侧标签文本",
      "position": "left | right，设置外侧标签位置",
      "color": "color，设置外侧标签文字颜色",
      "fontSize": "number: 8-72，设置外侧标签字号",
      "fontWeight": "number: 100-900，设置外侧标签字重",
      "fontFamily": "string，设置外侧标签字体"
    }
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "Switch",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height", "value", "defaultValue", "controller"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color",
  "allowedStylePaths": [
    {"path": "style.token.colorPrimary", "type": "color"},
    {"path": "style.token.colorPrimaryHover", "type": "color"},
    {"path": "style.token.colorPrimaryBorder", "type": "color"},
    {"path": "style.token.colorText", "type": "color"},
    {"path": "style.token.colorTextLightSolid", "type": "color"},
    {"path": "style.token.fontSize", "type": "number", "min": 1, "max": 200},
    {"path": "style.components.handleSize", "type": "number", "min": 0, "max": 200},
    {"path": "style.components.trackHeight", "type": "number", "min": 0, "max": 200},
    {"path": "style.components.trackMinWidth", "type": "number", "min": 0, "max": 300},
    {"path": "style.components.trackPadding", "type": "number", "min": 0, "max": 50},
    {"path": "style.components.handleBg", "type": "color"},
    {"path": "style.components.colorBgContainer", "type": "color"},
    {"path": "style.props.size", "type": "string", "enumValues": ["default", "small"]},
    {"path": "style.props.loading", "type": "boolean"},
    {"path": "style.props.disabled", "type": "boolean"},
    {"path": "style.props.checkedChildren", "type": "string"},
    {"path": "style.props.unCheckedChildren", "type": "string"},
    {"path": "style.label.content", "type": "string"},
    {"path": "style.label.position", "type": "string", "enumValues": ["left", "right"]},
    {"path": "style.label.color", "type": "color"},
    {"path": "style.label.fontSize", "type": "number", "min": 8, "max": 72},
    {"path": "style.label.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.label.fontFamily", "type": "string"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容来自组件自身的 `style` 属性设计。

**开关语义约束**

- `data.value` 是当前开关值，不属于样式优化范围，AI 不得通过 `stylePatch` 修改。
- `value`、`defaultValue` 是值相关属性，不属于样式优化范围。
- `change`、`click`、`on`、`off`、`toggle`、`valueChange` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- `checkedChildren` 和 `unCheckedChildren` 是开关内部状态文本，可以按视觉目标调整，但不要改写为与用户需求无关的文案。
- `label.content` 是开关外侧标签文本，可以按视觉目标调整，但不要改写为与用户需求无关的文案。
- `props.size` 当前有效值为 `default` 或 `small`；不要生成组件未明确支持的尺寸值。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- 颜色字段应使用组件配置面板可表达的普通 CSS 颜色值。
- `token` 下的颜色用于开关主体状态色和文本色。
- `components.handleBg` 控制开关把手背景。
- `components.colorBgContainer` 控制开关容器背景。
- `label.color` 控制外侧标签文字颜色。

**示例**

```json
{
  "componentType": "Switch",
  "stylePatch": {
    "style": {
      "token": {
        "colorPrimary": "#4FB8FF",
        "colorPrimaryHover": "#7ACDFF",
        "colorPrimaryBorder": "#4FB8FF",
        "colorText": "#FFFFFF",
        "colorTextLightSolid": "#FFFFFF",
        "fontSize": 14
      },
      "components": {
        "handleSize": 20,
        "trackHeight": 24,
        "trackMinWidth": 44,
        "trackPadding": 2,
        "handleBg": "#FFFFFF",
        "colorBgContainer": "#2C2C3E"
      },
      "props": {
        "size": "default",
        "loading": false,
        "disabled": false,
        "checkedChildren": "开",
        "unCheckedChildren": "关"
      },
      "label": {
        "content": "",
        "position": "left",
        "color": "#FFFFFF",
        "fontSize": 14,
        "fontWeight": 400,
        "fontFamily": ""
      }
    }
  }
}
```
