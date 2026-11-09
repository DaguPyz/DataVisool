<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# carousel 组件说明

## 组件标识

```json
{
  "componentType": "carousel",
  "componentName": "轮播图"
}
```

## 组件选择

```json
{
  "componentType": "carousel",
  "componentName": "轮播图",
  "description": "轮播图组件，用于展示图片列表，并支持自动播放、指示按钮和切换动效配置，适用于图片轮播、Banner 展示、多图切换、宣传位轮播。",
  "nativeCapabilities": "整组轮播图片、指示器和切换控件",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是非空字符串数组，每个字符串是一张可加载图片的地址，例如 HTTPS 图片地址、本地资源地址或 data URI。空项和非字符串项不会形成有效轮播内容。

静态数据示例：`{"sourceType":"static","staticData":{"value":["https://example.com/1.png","https://example.com/2.png"]}}`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "autoplay": "boolean，设置是否自动播放",
    "autoplaySpeed": "number: 0-60000，设置自动播放间隔，单位毫秒",
    "dots": "boolean，设置是否显示底部指示按钮",
    "fade": "boolean，设置是否使用淡入淡出切换",
    "speed": "number: 0-10000，设置切换动效时间，单位毫秒"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "carousel",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "allowedStylePaths": [
    {"path": "style.autoplay", "type": "boolean"},
    {"path": "style.autoplaySpeed", "type": "number", "min": 0, "max": 60000},
    {"path": "style.dots", "type": "boolean"},
    {"path": "style.fade", "type": "boolean"},
    {"path": "style.speed", "type": "number", "min": 0, "max": 10000}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容来自组件自身的 `style` 属性设计。

**轮播图语义约束**

- `data.value` 是图片列表，不属于样式优化范围，AI 不得通过 `stylePatch` 修改图片地址或图片数量。
- `click` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- `autoplay` 控制是否自动轮播，不代表图片数据。
- `autoplaySpeed` 是自动播放间隔，单位为毫秒。
- `speed` 是切换动效时间，单位为毫秒。
- `dots` 只控制是否显示底部指示按钮，不能修改按钮颜色、尺寸或位置。
- `fade` 控制是否使用淡入淡出切换；为 `false` 时使用横向滑动切换。
- 图片 `object-fit: cover` 由样式文件固定控制，AI 不得新增未定义的图片填充字段。
- 不得新增组件未定义的样式字段。

**示例**

```json
{
  "componentType": "carousel",
  "stylePatch": {
    "style": {
      "autoplay": true,
      "autoplaySpeed": 3000,
      "dots": true,
      "fade": false,
      "speed": 500
    }
  }
}
```
