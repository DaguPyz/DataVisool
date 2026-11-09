<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# DateTimePicker 组件说明

## 组件标识

```json
{
  "componentType": "DateTimePicker",
  "componentName": "日期时间选择器"
}
```

## 组件选择

```json
{
  "componentType": "DateTimePicker",
  "componentName": "日期时间选择器",
  "description": "日期时间选择输入组件，一个实例用于渲染一个可交互的日期、时间或日期时间选择控件，不适用于只读日期时间文字。",
  "nativeCapabilities": "一个日期时间输入框、当前值和选择面板",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据源使用 `staticData.value` 保存当前选择值。`pickerType` 不是 `range` 时，值必须是日期或日期时间字符串；`pickerType` 为 `range` 时，值必须是包含开始值和结束值的二元素字符串数组。字符串应与选择器类型和 `format` 约定一致，不要传入对象或其他数组结构。

静态数据示例：`{"sourceType":"static","staticData":{"value":"2026-01-01"}}`。

### 配置字段

AI 可以在 `config.style` 或 `stylePatch.style` 中使用以下字段。`token` 和 `components` 是主题样式对象，未提交的可选字段沿用组件默认值。

```json
{
  "style": {
    "pickerType": "date | week | month | quarter | year | datetime | range，选择日期、周、月、季度、年、日期时间或日期范围",
    "placeholder": "string，设置输入框占位文本",
    "showTime": "boolean，是否显示时间并使用日期时间输入",
    "format": "string，设置值的显示格式，例如 YYYY-MM-DD",
    "allowClear": "boolean，是否允许清空当前值",
    "disabled": "boolean，是否禁用输入框",
    "showNow": "boolean，是否显示此刻快捷操作",
    "token": {
      "lineWidth": "number >= 0，设置边框线宽",
      "fontSize": "number >= 0，设置弹层基础字号",
      "colorTextHeading": "color，设置弹层标题文字颜色",
      "colorPrimary": "color，设置选中和主操作颜色",
      "colorSplit": "color，设置分割线颜色",
      "colorText": "color，设置主要文字颜色",
      "colorBorder": "color，设置边框颜色",
      "colorBgContainerDisabled": "color，设置禁用输入框背景颜色",
      "colorTextPlaceholder": "color，设置占位文本颜色",
      "colorIcon": "color，设置图标颜色",
      "colorIconHover": "color，设置图标悬浮颜色",
      "borderRadius": "number >= 0，设置边框圆角",
      "lineType": "solid | dashed | dotted | double，设置边框线型",
      "fontFamily": "string，设置弹层字体",
      "fontWeightStrong": "number: 100-900，设置强调文字字重",
      "padding": "number >= 0，设置弹层内边距",
      "colorBgElevated": "color，设置弹层背景颜色"
    },
    "components": {
      "colorBgContainer": "color，设置输入框背景颜色",
      "colorBorder": "color，设置输入框边框颜色",
      "colorText": "color，设置输入框文字颜色",
      "colorPrimary": "color，设置输入框主色",
      "colorTextHeading": "color，设置弹层标题颜色",
      "colorSplit": "color，设置弹层分割线颜色",
      "hoverBorderColor": "color，设置输入框悬浮边框颜色",
      "activeBorderColor": "color，设置输入框激活边框颜色",
      "hoverBg": "color，设置输入框悬浮背景颜色",
      "activeBg": "color，设置输入框激活背景颜色",
      "activeShadow": "string，设置输入框激活态 CSS 阴影",
      "cellActiveWithRangeBg": "color，设置范围选中单元格背景颜色",
      "cellHoverBg": "color，设置单元格悬浮背景颜色",
      "cellHoverWithRangeBg": "color，设置范围单元格悬浮背景颜色",
      "cellHeight": "number >= 0，设置日期单元格高度",
      "cellWidth": "number >= 0，设置日期单元格宽度",
      "withoutTimeCellHeight": "number >= 0，设置无时间选择单元格高度",
      "textHeight": "number >= 0，设置弹层文本高度",
      "timeCellHeight": "number >= 0，设置时间单元格高度",
      "timeColumnHeight": "number >= 0，设置时间列高度",
      "timeColumnWidth": "number >= 0，设置时间列宽度",
      "inputFontSize": "number >= 0，设置输入框字号",
      "paddingBlock": "number >= 0，设置输入框垂直内边距",
      "paddingInline": "number >= 0，设置输入框水平内边距"
    }
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "DateTimePicker",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color",
  "allowedStylePaths": [
    {"path": "style.pickerType", "type": "string", "enumValues": ["date", "week", "month", "quarter", "year", "datetime", "range"]},
    {"path": "style.placeholder", "type": "string"},
    {"path": "style.showTime", "type": "boolean"},
    {"path": "style.format", "type": "string"},
    {"path": "style.allowClear", "type": "boolean"},
    {"path": "style.disabled", "type": "boolean"},
    {"path": "style.showNow", "type": "boolean"},
    {"path": "style.token.lineWidth", "type": "number", "min": 0},
    {"path": "style.token.fontSize", "type": "number", "min": 0},
    {"path": "style.token.colorTextHeading", "type": "color"},
    {"path": "style.token.colorPrimary", "type": "color"},
    {"path": "style.token.colorSplit", "type": "color"},
    {"path": "style.token.colorText", "type": "color"},
    {"path": "style.token.colorBorder", "type": "color"},
    {"path": "style.token.colorBgContainerDisabled", "type": "color"},
    {"path": "style.token.colorTextPlaceholder", "type": "color"},
    {"path": "style.token.colorIcon", "type": "color"},
    {"path": "style.token.colorIconHover", "type": "color"},
    {"path": "style.token.borderRadius", "type": "number", "min": 0},
    {"path": "style.token.lineType", "type": "string", "enumValues": ["solid", "dashed", "dotted", "double"]},
    {"path": "style.token.fontFamily", "type": "string"},
    {"path": "style.token.fontWeightStrong", "type": "number", "min": 100, "max": 900},
    {"path": "style.token.padding", "type": "number", "min": 0},
    {"path": "style.token.colorBgElevated", "type": "color"},
    {"path": "style.components.colorBgContainer", "type": "color"},
    {"path": "style.components.colorBorder", "type": "color"},
    {"path": "style.components.colorText", "type": "color"},
    {"path": "style.components.colorPrimary", "type": "color"},
    {"path": "style.components.colorTextHeading", "type": "color"},
    {"path": "style.components.colorSplit", "type": "color"},
    {"path": "style.components.hoverBorderColor", "type": "color"},
    {"path": "style.components.activeBorderColor", "type": "color"},
    {"path": "style.components.hoverBg", "type": "color"},
    {"path": "style.components.activeBg", "type": "color"},
    {"path": "style.components.activeShadow", "type": "string"},
    {"path": "style.components.cellActiveWithRangeBg", "type": "color"},
    {"path": "style.components.cellHoverBg", "type": "color"},
    {"path": "style.components.cellHoverWithRangeBg", "type": "color"},
    {"path": "style.components.cellHeight", "type": "number", "min": 0},
    {"path": "style.components.cellWidth", "type": "number", "min": 0},
    {"path": "style.components.withoutTimeCellHeight", "type": "number", "min": 0},
    {"path": "style.components.textHeight", "type": "number", "min": 0},
    {"path": "style.components.timeCellHeight", "type": "number", "min": 0},
    {"path": "style.components.timeColumnHeight", "type": "number", "min": 0},
    {"path": "style.components.timeColumnWidth", "type": "number", "min": 0},
    {"path": "style.components.inputFontSize", "type": "number", "min": 0},
    {"path": "style.components.paddingBlock", "type": "number", "min": 0},
    {"path": "style.components.paddingInline", "type": "number", "min": 0}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。创建组件时可以在完整 `config` 中同时提供 `data` 和 `style`，但 `stylePatch` 不得修改 `data`。

**日期时间语义约束**

- `data.value` 是当前选择值，不属于样式优化范围；修改选择值或数据源必须使用 `dataPatch`。
- `pickerType: "range"` 时，`data.value` 必须是 `[开始值, 结束值]`；其他选择器类型使用单个字符串值。
- `pickerType: "datetime"` 或 `showTime: true` 使用日期时间输入；`pickerType` 为 `week`、`month` 或其他类型时，值和 `format` 应与对应选择器保持一致。
- `format` 只控制值的显示格式，不是数据字段映射；不要通过样式补丁伪造时间值。
- `allowClear`、`disabled`、`showNow` 只控制输入交互状态；`open`、`close`、`change`、`ok`、`valueChange`、`confirm` 是组件事件，不能通过补丁修改。
- `token` 与 `components` 只接受文档列出的主题字段；不得新增函数值或未定义字段。

**颜色与阴影取值要求**

- 颜色字段应使用普通 CSS 颜色值；不应把渐变语法用于日期选择器主题颜色。
- `activeShadow` 应使用 CSS `box-shadow` 字符串，例如 `0 0 0 2px rgba(79, 184, 255, 0.2)`。
- `fontFamily` 应使用字体名称或 CSS 字体栈，`lineType` 只能使用列出的枚举值。

**示例**

```json
{
  "componentType": "DateTimePicker",
  "stylePatch": {
    "style": {
      "pickerType": "datetime",
      "placeholder": "请选择日期时间",
      "showTime": true,
      "format": "YYYY-MM-DD HH:mm:ss",
      "allowClear": true,
      "disabled": false,
      "showNow": true,
      "token": {
        "fontSize": 14,
        "colorPrimary": "#4FB8FF",
        "colorBgElevated": "#2C2C3E",
        "lineType": "solid"
      },
      "components": {
        "colorBgContainer": "#2C2C3E",
        "colorBorder": "#3A3A4E",
        "activeShadow": "0 0 0 2px rgba(79, 184, 255, 0.2)",
        "inputFontSize": 14
      }
    }
  }
}
```
