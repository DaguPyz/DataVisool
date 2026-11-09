<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# BaseVideo 组件说明

## 组件标识

```json
{
  "componentType": "BaseVideo",
  "componentName": "视频"
}
```

## 组件选择

```json
{
  "componentType": "BaseVideo",
  "componentName": "视频",
  "description": "视频组件，用于展示视频资源，并支持封面、播放控制和填充模式配置，适用于视频文件播放、宣传视频、监控视频片段、带封面的视频展示。",
  "nativeCapabilities": "一个视频画面、封面和原生播放控件",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件不支持通过 `dataPatch` 修改数据。

视频地址和封面由样式配置提供，组件不读取 `data.value`。创建或修改时不要传入 `config.data` 或 `dataPatch`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "src": "string，设置视频地址",
    "poster": "string，设置视频封面图地址",
    "autoPlay": "boolean，设置是否自动播放",
    "controls": "boolean，设置是否显示浏览器原生控件",
    "loop": "boolean，设置是否循环播放",
    "muted": "boolean，设置是否静音播放",
    "objectFit": "contain | cover | fill | none | scale-down，设置视频填充模式"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "BaseVideo",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "allowedStylePaths": [
    {"path": "style.src", "type": "string"},
    {"path": "style.poster", "type": "string"},
    {"path": "style.autoPlay", "type": "boolean"},
    {"path": "style.controls", "type": "boolean"},
    {"path": "style.loop", "type": "boolean"},
    {"path": "style.muted", "type": "boolean"},
    {"path": "style.objectFit", "type": "string", "enumValues": ["contain", "cover", "fill", "none", "scale-down"]}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`filter`、事件、动画或布局。该组件的可优化内容来自组件自身的 `style` 属性设计。

**视频语义约束**

- `src` 是视频地址，只有用户明确要求替换视频资源时才允许修改。
- `poster` 是视频封面图地址，只有用户明确要求替换封面时才允许修改。
- 不得编造无法确认可访问的视频地址或封面地址。
- `autoPlay`、`controls`、`loop`、`muted` 是播放行为配置，不是视觉样式，应按用户需求谨慎调整。
- `objectFit` 只控制视频在组件区域内的填充方式，不得修改组件外部宽高。
- `click` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- 不得新增组件未定义的样式字段。

**资源取值要求**

- `src` 应使用项目可加载资源地址或可访问的远程视频地址。
- `poster` 应使用项目可加载图片地址或可访问的远程图片地址。
- 组件会通过 `AssetUrlUtil.toLoadableUrl` 处理 `src`。
- 当前组件会为同一个 `src` 同时声明 `mp4`、`webm`、`ogg` 三种 source 类型，优先使用浏览器可播放的视频资源。

**示例**

```json
{
  "componentType": "BaseVideo",
  "stylePatch": {
    "style": {
      "src": "/assets/demo.mp4",
      "poster": "/assets/demo-poster.png",
      "autoPlay": true,
      "controls": true,
      "loop": false,
      "muted": true,
      "objectFit": "contain"
    }
  }
}
```
