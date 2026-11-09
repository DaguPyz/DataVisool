<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# FourAngleGlowBorder 组件说明

## 组件标识

```json
{
  "componentType": "FourAngleGlowBorder",
  "componentName": "四角辉光边框"
}
```

## 组件选择

```json
{
  "componentType": "FourAngleGlowBorder",
  "componentName": "四角辉光边框",
  "description": "四角辉光边框装饰组件，用于在组件区域四角绘制发光边框效果，适用于科技风边框、卡片角标装饰、重点区域外框、大屏装饰边框。",
  "nativeCapabilities": "一个矩形区域四角的整套辉光边框；不包含背景和内部内容",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件不支持通过 `dataPatch` 修改数据。

四角辉光边框只使用样式配置，不读取 `data.value`。创建或修改时不要传入 `config.data` 或 `dataPatch`。

### 配置字段

AI 可以生成的 `stylePatch` 对象层级如下。

```json
{
  "style": {
    "width": "number: 0-10，设置四角边框线宽",
    "length": "number: 0-100，设置四角边线长度",
    "radius": "number: 0-100，设置四角圆角",
    "color": "color，设置四角边框颜色"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "FourAngleGlowBorder",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "css-color",
  "allowedStylePaths": [
    {"path": "style.width", "type": "number", "min": 0, "max": 10},
    {"path": "style.length", "type": "number", "min": 0, "max": 100},
    {"path": "style.radius", "type": "number", "min": 0, "max": 100},
    {"path": "style.color", "type": "color"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件的可优化内容来自组件自身的 `style` 属性设计。

**边框语义约束**

- `width` 控制四角边框线宽，单位为像素。
- `length` 控制每个角线的边长，单位为像素。
- `radius` 控制四角圆角，单位为像素。
- `color` 控制四角边框颜色。
- 组件宽高由外部布局控制，AI 不得修改 `width` 或 `height` 布局字段。
- `click` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- 不得新增组件未定义的样式字段。

**颜色取值要求**

- `color` 应使用组件配置面板可表达的普通 CSS 颜色值。
- 当前组件不支持渐变、阴影、背景或透明度字段，AI 不得新增这些字段。

**示例**

```json
{
  "componentType": "FourAngleGlowBorder",
  "stylePatch": {
    "style": {
      "color": "#34E4FF",
      "width": 2,
      "radius": 4,
      "length": 10
    }
  }
}
```
