<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# BaseImage 组件说明

## 组件标识

```json
{
  "componentType": "BaseImage",
  "componentName": "基础图片"
}
```

## 组件选择

```json
{
  "componentType": "BaseImage",
  "componentName": "基础图片",
  "description": "基础图片组件，用于展示在线图片、本地上传图片或数据源绑定图片，适用于图片展示、图标展示、头像、背景图、品牌标识。",
  "nativeCapabilities": "单张图片及其完整图像内容",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件支持通过 `dataPatch` 修改数据。

数据值必须是一个字符串，内容为组件可加载的图片地址，例如 HTTPS 图片地址、本地资源地址或 data URI。空字符串表示没有可用的数据源图片，此时组件会使用样式中的默认图片配置。

静态数据示例：`{"sourceType":"static","staticData":{"value":"https://example.com/image.png"}}`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "type": "online，设置图片来源为在线图片，仅在明确换在线图片时使用",
    "onLineUrl": "string，设置在线图片地址，仅在明确换在线图片时使用",
    "opacity": "number: 0-1，设置图片透明度"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "BaseImage",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height", "style.localUrl", "style.hash"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "not-applicable",
  "allowedStylePaths": [
    {"path": "style.type", "type": "string", "enumValues": ["online"]},
    {"path": "style.onLineUrl", "type": "string"},
    {"path": "style.opacity", "type": "number", "min": 0, "max": 1}
  ]
}
```

### 限制与校验

**参考依据**

- `BaseImageComponent.tsx` 中的 `BaseImageComponentStyle`
- `BaseImageConfig.tsx` 中的样式配置面板
- `BaseImageDefinition.ts` 中的默认配置

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件或布局。该组件的可优化内容只来自组件自身 `style` 属性设计。

**图片语义约束**

- `data.value` 的图片来源优先于 `style` 图片地址，但 AI 样式优化不得修改 `data`。
- 普通视觉优化默认只允许调整 `style.opacity`。
- `style.type` 和 `style.onLineUrl` 会改变图片来源，只有用户明确要求更换为在线图片时才允许生成。
- `style.localUrl` 是本地上传图片地址，不能由 AI 生成或修改。
- `style.hash` 是上传文件后生成的文件标识，不能由 AI 生成或修改。
- 不得新增组件未定义的样式字段。

**示例**

```json
{
  "componentType": "BaseImage",
  "stylePatch": {
    "style": {
      "opacity": 0.85
    }
  }
}
```

明确要求更换为在线图片时：

```json
{
  "componentType": "BaseImage",
  "stylePatch": {
    "style": {
      "type": "online",
      "onLineUrl": "https://example.com/image.png"
    }
  }
}
```
