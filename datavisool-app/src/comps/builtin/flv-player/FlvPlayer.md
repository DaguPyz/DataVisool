<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# FlvPlayer 组件说明

## 组件标识

```json
{
  "componentType": "FlvPlayer",
  "componentName": "FLV视频流"
}
```

## 组件选择

```json
{
  "componentType": "FlvPlayer",
  "componentName": "FLV视频流",
  "description": "FLV 视频流组件，用于播放 FLV 格式的视频流地址，适用于FLV 直播流播放、实时视频流、监控流展示。",
  "nativeCapabilities": "一个FLV视频流画面和原生播放控件",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件不支持通过 `dataPatch` 修改数据。

FLV 流地址由样式配置提供，组件不读取 `data.value`。创建或修改时不要传入 `config.data` 或 `dataPatch`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "url": "string，设置 FLV 视频流地址"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "FlvPlayer",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "allowedStylePaths": [
    {"path": "style.url", "type": "string"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容来自组件自身的 `style` 属性设计。

**视频流语义约束**

- `url` 是 FLV 视频流地址，只有用户明确要求替换视频流时才允许修改。
- 不得编造无法确认可访问的视频流地址。
- 组件内部固定使用 `flv.js` 创建 `type: "flv"` 播放器，AI 不得新增 `type`、`format`、`protocol` 等未定义字段。
- 浏览器原生 `controls` 由组件固定开启，AI 不得通过样式补丁修改。
- 组件宽高由外部布局控制，AI 不得修改 `width` 或 `height`。
- `click` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- 不得新增组件未定义的样式字段。

**资源取值要求**

- `url` 应使用可被 `flv.js` 播放的 FLV 视频流地址。
- 推荐使用明确的 FLV 流地址，例如以 `.flv` 结尾，或服务端明确返回 FLV 流。
- 如果用户没有提供可用地址，AI 应保留原值，不应自行生成公网地址。

**示例**

```json
{
  "componentType": "FlvPlayer",
  "stylePatch": {
    "style": {
      "url": "https://example.com/live/demo.flv"
    }
  }
}
```
