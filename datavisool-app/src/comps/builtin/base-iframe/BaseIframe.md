<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# BaseIframe 组件说明

## 组件标识

```json
{
  "componentType": "BaseIframe",
  "componentName": "基础iframe"
}
```

## 组件选择

```json
{
  "componentType": "BaseIframe",
  "componentName": "基础iframe",
  "description": "基础 iframe 组件，用于在画布中嵌入外部页面，适用于外部页面嵌入、第三方系统页面、地图或报表链接嵌入、网页容器。",
  "nativeCapabilities": "一个外部网页的完整可见内容",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件不支持通过 `dataPatch` 修改数据。

嵌入地址由样式配置提供，组件不读取 `data.value`。创建或修改时不要传入 `config.data` 或 `dataPatch`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "src": "string，设置 iframe 加载地址"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "BaseIframe",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "not-applicable",
  "allowedStylePaths": [
    {"path": "style.src", "type": "string"}
  ]
}
```

### 限制与校验

**参考依据**

- `BaseIframeComponent.tsx` 中的 `BaseIframeComponentStyle`
- `BaseIframeConfig.tsx` 中的样式配置面板
- `BaseIframeDefinition.ts` 中的默认配置

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容只来自组件自身 `style` 属性设计。

**iframe 语义约束**

- `src` 是 iframe 加载地址，会改变嵌入内容。
- 只有用户明确要求修改 iframe 地址时，AI 才允许生成 `style.src`。
- 不得为空白占位编造地址。
- 不得新增组件未定义的样式字段。

**示例**

```json
{
  "componentType": "BaseIframe",
  "stylePatch": {
    "style": {
      "src": "https://example.com"
    }
  }
}
```
