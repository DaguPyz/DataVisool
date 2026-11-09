<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# LcBaseTable 组件说明

## 组件标识

```json
{
  "componentType": "LcBaseTable",
  "componentName": "基础表格"
}
```

## 组件选择

```json
{
  "componentType": "LcBaseTable",
  "componentName": "基础表格",
  "description": "基础表格组件，用于展示列配置和行数据，并支持表头、表体、行背景和轮播展示配置，适用于数据明细、订单列表、设备状态表、排行表、字段型数据展示。",
  "nativeCapabilities": "一个完整表格的表头、数据行、单元格、行背景和滚动轮播",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是对象数组，每个对象表示一行。行对象的属性名必须与 `style.columns` 中各列的 `key` 一致，否则对应单元格无法显示。行属性名和列 `key` 都可以修改，但两边必须在同一次修改后保持一致；列的 `label` 只是显示名称，不用于读取行数据。

例如列配置为 `[{"key":"name","label":"姓名"},{"key":"score","label":"分数"}]` 时，数据项可以是 `{"name":"张三","score":95}`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "columns": [
      {
        "key": "string，列字段名，必须匹配数据字段",
        "label": "string，列显示名",
        "width": "number: 0-1000，列宽",
        "textAlign": "left | center | right，列文本对齐"
      }
    ],
    "header": {
      "height": "number: 0-200，设置表头高度",
      "background": "color，设置表头背景",
      "color": "color，设置表头文字颜色",
      "fontSize": "number: 0-100，设置表头字号",
      "fontWeight": "number: 0-900，设置表头字重",
      "fontFamily": "string，设置表头字体"
    },
    "body": {
      "background": "color，设置表体背景",
      "color": "color，设置表体文字颜色",
      "fontSize": "number: 0-100，设置表体字号",
      "fontWeight": "number: 0-900，设置表体字重",
      "fontFamily": "string，设置表体字体",
      "enableCarousel": "boolean，设置是否启用表体轮播",
      "carouselSpeed": "number: 0-100，设置轮播速度",
      "carouselPauseSeconds": "number: 0-10，设置每次滚动后的停顿秒数",
      "pageSize": "number: 0-100，设置每页行数",
      "lineBackground": "string | string[]，设置单双行背景"
    }
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "LcBaseTable",
  "forbiddenPaths": ["base", "data", "style.data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color-or-config-panel-gradient-for-background-fields",
  "allowedStylePaths": [
    {"path": "style.columns", "type": "array"},
    {"path": "style.columns[].key", "type": "string"},
    {"path": "style.columns[].label", "type": "string"},
    {"path": "style.columns[].width", "type": "number", "min": 0, "max": 1000},
    {"path": "style.columns[].textAlign", "type": "string", "enumValues": ["left", "center", "right"]},
    {"path": "style.header.height", "type": "number", "min": 0, "max": 200},
    {"path": "style.header.background", "type": "color"},
    {"path": "style.header.color", "type": "color"},
    {"path": "style.header.fontSize", "type": "number", "min": 0, "max": 100},
    {"path": "style.header.fontWeight", "type": "number", "min": 0, "max": 900},
    {"path": "style.header.fontFamily", "type": "string"},
    {"path": "style.body.background", "type": "color"},
    {"path": "style.body.color", "type": "color"},
    {"path": "style.body.fontSize", "type": "number", "min": 0, "max": 100},
    {"path": "style.body.fontWeight", "type": "number", "min": 0, "max": 900},
    {"path": "style.body.fontFamily", "type": "string"},
    {"path": "style.body.enableCarousel", "type": "boolean"},
    {"path": "style.body.carouselSpeed", "type": "number", "min": 0, "max": 100},
    {"path": "style.body.carouselPauseSeconds", "type": "number", "min": 0, "max": 10},
    {"path": "style.body.pageSize", "type": "number", "min": 0, "max": 100},
    {"path": "style.body.lineBackground", "type": "string-or-string-array"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容来自组件自身的 `style` 属性设计。

**表格语义约束**

- `style.data` 和 `data.value` 是表格行数据，不属于样式优化范围，AI 不得通过 `stylePatch` 修改。
- `columns` 是列结构配置，普通视觉优化只建议调整 `width` 和 `textAlign`；不要随意修改 `key` 或 `label`。
- `columns[].key` 必须和表格数据字段匹配，否则单元格会显示为空。
- `header.height` 会影响表头高度和表体可用高度。
- `body.pageSize` 会影响每页行数和行高计算。
- `body.enableCarousel`、`body.carouselSpeed`、`body.carouselPauseSeconds` 只控制表体轮播行为，不代表业务数据。
- `body.lineBackground` 用于设置单双行背景，数组第一项用于偶数行，第二项用于奇数行。
- `click`、`dataChange` 是组件事件，不能通过样式补丁修改。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- `header.background`、`body.background`、`body.lineBackground` 可以使用普通颜色或配置面板生成的渐变值。
- `header.color`、`body.color` 应使用普通 CSS 颜色值。
- 当前组件不支持单元格边框、圆角、阴影等字段，AI 不得新增这些字段。

**示例**

```json
{
  "componentType": "LcBaseTable",
  "stylePatch": {
    "style": {
      "columns": [
        {"key": "name", "label": "姓名", "width": 120, "textAlign": "center"},
        {"key": "age", "label": "年龄", "width": 80, "textAlign": "center"},
        {"key": "sex", "label": "性别", "width": 80, "textAlign": "center"}
      ],
      "header": {
        "height": 30,
        "background": "linear-gradient(90deg, #FF7361 0%, #FF432A 100%)",
        "color": "#FFFFFF",
        "fontSize": 14,
        "fontWeight": 900,
        "fontFamily": "Arial"
      },
      "body": {
        "background": "#14141400",
        "color": "#FFFFFF",
        "fontSize": 13,
        "fontWeight": 500,
        "fontFamily": "Arial",
        "enableCarousel": false,
        "carouselSpeed": 3,
        "carouselPauseSeconds": 0.08,
        "pageSize": 5,
        "lineBackground": [
          "linear-gradient(90deg, #1199A3 0%, #008F99 100%)",
          "linear-gradient(90deg, #15BFCC 0%, #1CAAB4 100%)"
        ]
      }
    }
  }
}
```
