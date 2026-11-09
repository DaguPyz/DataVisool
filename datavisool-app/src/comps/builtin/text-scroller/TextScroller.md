<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# TextScroller 组件说明

## 组件标识

```json
{
  "componentType": "TextScroller",
  "componentName": "文字弹幕"
}
```

## 组件选择

```json
{
  "componentType": "TextScroller",
  "componentName": "文字弹幕",
  "description": "文字弹幕组件，用于横向滚动展示文本内容，并响应点击事件，适用于滚动公告、消息字幕、实时告警文本、横向弹幕。",
  "nativeCapabilities": "一个横向滚动文本块及其滚动效果",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是字符串，用作横向滚动的完整文本。不要传入对象或数组；滚动速度、字体和颜色由样式配置控制。

静态数据示例：`{"sourceType":"static","staticData":{"value":"系统公告：今晚 22:00 进行维护"}}`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "speed": "number: 0-10，设置滚动速度",
    "fontSize": "number: 1-100，设置文字字号",
    "fontWeight": "number: 100-900，设置文字字重",
    "color": "color，设置文字颜色；渐变文字时也保存渐变值",
    "fontFamily": "string，设置文字字体",
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
  "componentType": "TextScroller",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color-or-config-panel-gradient-for-color",
  "allowedStylePaths": [
    {"path": "style.speed", "type": "number", "min": 0, "max": 10},
    {"path": "style.fontSize", "type": "number", "min": 1, "max": 100},
    {"path": "style.fontWeight", "type": "number", "min": 100, "max": 900},
    {"path": "style.color", "type": "color"},
    {"path": "style.fontFamily", "type": "string"},
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

**弹幕语义约束**

- `data.value` 是弹幕文本内容，不属于样式优化范围，AI 不得通过 `stylePatch` 修改。
- `speed` 控制滚动速度，不代表业务数据。
- 当前实现会将 `speed` 转换为动画时长：`speed > 0` 时使用 `1 / speed` 秒；`speed` 为 `0` 时动画时长为 `0s`。
- `click` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- 组件滚动方向、动画名称、容器宽高和溢出隐藏由样式文件固定控制，AI 不得新增未定义字段。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- `color` 可以使用普通颜色，也可以使用配置面板生成的渐变值。
- 普通文字颜色应只设置 `color`，并将渐变相关字段恢复为 `initial`。
- 渐变文字应将 `backgroundImage` 设置为同一个渐变值，并将 `WebkitTextFillColor` 设置为 `transparent`。

**示例**

普通文字样式：

```json
{
  "componentType": "TextScroller",
  "stylePatch": {
    "style": {
      "speed": 0.1,
      "fontSize": 16,
      "fontWeight": 500,
      "color": "#FFFFFF",
      "fontFamily": "Arial",
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
  "componentType": "TextScroller",
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
