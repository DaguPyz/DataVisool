<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# DateTime 组件说明

## 组件标识

```json
{
  "componentType": "DateTime",
  "componentName": "当前时间"
}
```

## 组件选择

```json
{
  "componentType": "DateTime",
  "componentName": "当前时间",
  "description": "当前时间组件，用于按指定格式实时展示本地日期时间，适用于当前时间展示、日期时间标题、系统时间、大屏时钟。",
  "nativeCapabilities": "一段按格式实时更新的日期时间文本",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件不支持通过 `dataPatch` 修改数据。

当前时间由组件在运行时生成，显示格式由样式配置控制，不读取 `data.value`。创建或修改时不要传入 `config.data` 或 `dataPatch`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "fontSize": "number: 1-200，设置时间文字字号",
    "color": "color，设置时间文字颜色",
    "fontFamily": "string，设置时间文字字体",
    "fontWeight": "number: 100-900，设置时间文字字重",
    "alignItems": "flex-start | center | flex-end，设置垂直对齐",
    "justifyContent": "flex-start | center | flex-end，设置水平对齐",
    "letterSpacing": "string，设置字距",
    "formatType": "0 | 1 | 2，设置时间格式"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "DateTime",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color",
  "allowedStylePaths": [
    {"path": "style.fontSize", "type": "number", "min": 1, "max": 200},
    {"path": "style.color", "type": "color"},
    {"path": "style.fontFamily", "type": "string"},
    {"path": "style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.alignItems", "type": "string", "enumValues": ["flex-start", "center", "flex-end"]},
    {"path": "style.justifyContent", "type": "string", "enumValues": ["flex-start", "center", "flex-end"]},
    {"path": "style.letterSpacing", "type": "string"},
    {"path": "style.formatType", "type": "string", "enumValues": ["0", "1", "2"]}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容来自组件自身的 `style` 属性设计。

**时间语义约束**

- 组件显示内容由浏览器本地时间每秒自动生成，AI 不得通过样式补丁伪造固定时间文本。
- 该组件没有数据配置入口，AI 不得新增 `data` 或通过 `stylePatch` 设置时间值。
- `formatType` 只控制日期时间展示格式，不代表业务数据。
- `alignItems` 控制垂直对齐，`justifyContent` 控制水平对齐。
- `letterSpacing` 控制字距，建议使用可被 CSS 接受的数值字符串。
- `click` 是组件事件，不能通过样式补丁修改。
- 不得新增组件未定义的样式字段。

**格式取值要求**

- `formatType: "0"`：展示为 `YYYY-MM-DD HH:mm:ss`。
- `formatType: "1"`：展示为 `YYYY/MM/DD HH:mm:ss`。
- `formatType: "2"`：展示为 `YYYY年MM月DD日 HH时mm分ss秒`。

**颜色取值要求**

- `color` 应使用组件配置面板可表达的普通 CSS 颜色值。
- 当前组件不支持渐变文字、描边、背景或阴影字段，AI 不得新增这些字段。

**示例**

```json
{
  "componentType": "DateTime",
  "stylePatch": {
    "style": {
      "fontSize": 16,
      "fontWeight": 500,
      "color": "#FFFFFF",
      "fontFamily": "Arial",
      "alignItems": "center",
      "justifyContent": "center",
      "letterSpacing": "1",
      "formatType": "2"
    }
  }
}
```
