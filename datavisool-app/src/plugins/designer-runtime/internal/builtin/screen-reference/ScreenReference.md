<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# ScreenReference 组件说明

## 组件标识

```json
{
  "componentType": "ScreenReference",
  "componentName": "大屏引用"
}
```

## 组件选择

```json
{
  "componentType": "ScreenReference",
  "componentName": "大屏引用",
  "description": "已有大屏页面引用组件，一个实例用于整体嵌入并显示一个已存在的大屏页面，不用于从当前设计稿重新组合普通区域内容。",
  "nativeCapabilities": "一个被引用大屏页面的全部可见内容",
  "selectable": true
}
```

## 完整规格

### 数据要求

该组件不支持通过 `dataPatch` 修改数据。

被引用的大屏由 `style.screenId` 指定，组件没有 `data` 或字段映射入口。创建或修改时不要传入 `config.data` 或 `dataPatch`；需要更换引用目标时修改 `style.screenId`。

### 配置字段

AI 可以在 `config.style` 或 `stylePatch.style` 中使用以下字段。未提交的可选字段沿用组件默认值。

```json
{
  "style": {
    "screenId": "string，目标大屏项目 ID"
  }
}
```

### 校验规则

AI 生成的补丁必须符合下面的机器可读规则：

```json
{
  "schemaVersion": "component-style-doc/v1",
  "componentType": "ScreenReference",
  "forbiddenPaths": ["base", "data", "filter", "animation", "events", "layout", "width", "height"],
  "forbiddenFunctionConfig": true,
  "colorFormat": "not-applicable",
  "allowedStylePaths": [
    {"path": "style.screenId", "type": "string"}
  ]
}
```

### 限制与校验

**通用限制**

AI 样式优化只能生成 `stylePatch`，不能修改 `base`、`data`、`filter`、事件、动画或布局。该组件没有数据配置入口，创建时不要新增 `config.data`。

**引用语义约束**

- `style.screenId` 必须是当前用户有权访问且实际存在的其他大屏项目 ID；不得使用空字符串、虚构地址或任意 URL。
- 大屏引用不能指向当前正在编辑的大屏；配置面板会排除当前项目并拒绝自引用。
- 修改 `screenId` 会重新加载被引用大屏并替换当前组件显示内容，只有用户明确要求更换引用目标时才生成该字段。
- `click` 是组件事件，只能由组件逻辑触发，不能通过样式补丁修改。
- 不得通过补丁写入 `base`、`filter`、`data` 或组件未定义的样式字段；不得生成函数配置。

**示例**

下面的 `target-project-id` 仅表示任务中由用户或项目目录提供的真实目标 ID，不能原样当作不存在的项目提交。

```json
{
  "componentType": "ScreenReference",
  "stylePatch": {
    "style": {
      "screenId": "target-project-id"
    }
  }
}
```
