<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# BaseColorBlock 组件说明

## 组件标识

```json
{
  "componentType": "BaseColorBlock",
  "componentName": "基础色块"
}
```

## 组件选择

```json
{
  "componentType": "BaseColorBlock",
  "componentName": "基础色块",
  "description": "基础色块组件，用于展示背景色、边框、阴影等装饰性视觉块，并支持点击事件，适用于背景色块、卡片底板、分割块、视觉装饰区域。",
  "nativeCapabilities": "一个背景色、边框和阴影组成的色块；不包含内部内容",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件不支持通过 `dataPatch` 修改数据。

基础色块只使用样式配置，不读取 `data.value`。创建或修改时不要传入 `config.data` 或 `dataPatch`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "background": "color | gradient，设置色块背景",
    "borderRadius": "number: 0-500，设置色块圆角",
    "borderWidth": "number: 0-50，设置色块边框宽度",
    "borderColor": "color，设置色块边框颜色",
    "borderStyle": "none | solid | dashed | dotted | double | groove | ridge | inset | outset，设置色块边框样式",
    "boxShadow": "string，设置色块阴影，例如 0 0 20px #009DFF66",
    "backgroundSize": "string，设置背景尺寸，例如 cover、contain 或 100% 100%",
    "opacity": "number: 0-1，设置色块整体透明度"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "BaseColorBlock",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color-or-config-panel-gradient",
  "allowedStylePaths": [
    {"path": "style.background", "type": "color"},
    {"path": "style.borderRadius", "type": "number", "min": 0, "max": 500},
    {"path": "style.borderWidth", "type": "number", "min": 0, "max": 50},
    {"path": "style.borderColor", "type": "color"},
    {"path": "style.borderStyle", "type": "string", "enumValues": ["none", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"]},
    {"path": "style.boxShadow", "type": "string"},
    {"path": "style.backgroundSize", "type": "string"},
    {"path": "style.opacity", "type": "number", "min": 0, "max": 1}
  ]
}
```

### 限制与校验

**参考依据**

- `BaseColorBlockComponent.tsx` 中的 `BaseColorBlockComponentStyle`
- `BaseColorBlockConfig.tsx` 中的样式配置面板
- `BaseColorBlockDefinition.ts` 中的默认样式

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容只来自组件自身 `style` 属性设计。

**色块语义约束**

- `BaseColorBlock` 是装饰性视觉块，不承载业务数据。
- `background` 控制色块背景，可以使用纯色或配置面板支持的渐变值。
- `borderRadius`、`borderWidth`、`borderColor`、`borderStyle` 只影响边框表现。
- `boxShadow`、`backgroundSize`、`opacity` 来自组件自身 `style` 类型，组件会作为内联样式直接生效。
- 不得新增组件未定义的样式字段。

**示例**

```json
{
  "componentType": "BaseColorBlock",
  "stylePatch": {
    "style": {
      "background": "#009DFF33",
      "borderRadius": 8,
      "borderWidth": 1,
      "borderColor": "#009DFFFF",
      "borderStyle": "solid",
      "boxShadow": "0 0 24px #009DFF66",
      "backgroundSize": "100% 100%",
      "opacity": 1
    }
  }
}
```
