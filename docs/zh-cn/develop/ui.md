# 配置面板与 JSON Schema UI

自定义组件可以用 `@datavisool/ui/schema` 的 `DatavisoolGUI` 根据 `Control` schema 生成配置面板。当前 Web 宿主将 schema UI 导出放入 `window.DataVisoolUI`，`datavisool-cli` 也会把 `@datavisool/ui/schema` 映射到该全局对象，因此这套写法可用于上传到当前 Web 的服务器组件。

CLI 模板默认只声明 `@datavisool/sdk`。使用 `DatavisoolGUI` 时，还需在组件项目中添加与宿主版本匹配的 `@datavisool/ui` 开发依赖，以支持本地预览和 TypeScript 类型检查；CLI 打包时会把 UI 包作为宿主外部依赖处理。从 DataVisool-Desktop 源码构建时，可先在仓库根目录执行 `pnpm -F @datavisool/ui build`，再在组件项目目录运行 `pnpm add -D /path/to/DataVisool-Desktop/datavisool-ui`，并将路径替换为本机仓库位置。

## 最小示例

示例沿用模板按钮的 `style` 配置。`key` 路径会决定 `dataFragment` 的结构；根节点的 `key: 'style'` 让修改字号时生成 `{style: {fontSize: 20}}`，可以直接交给控制器合并。

```tsx
import React from "react";
import {DatavisoolGUI, type Control, type FieldChangeData} from "@datavisool/ui/schema";
import {Controller} from "./controller";

export const BaseButtonStyleConfig: React.FC<{controller: Controller}> = ({controller}) => {
  const style = controller.getConfig()?.style;
  const schema: Control = {
    type: "grid",
    key: "style",
    children: [
      {
        type: "accordion",
        label: "基础设置",
        children: [
          {
            type: "grid",
            children: [
              {type: "input", label: "内容", key: "content", value: style?.content},
              {
                type: "number-input",
                label: "字号",
                key: "fontSize",
                value: style?.fontSize,
                config: {min: 1, max: 100, step: 1},
              },
              {type: "color-picker", label: "文字颜色", key: "color", value: style?.color},
            ],
          },
        ],
      },
    ],
  };

  const onFieldChange = ({dataFragment}: FieldChangeData) => {
    controller.update(dataFragment as any);
  };

  return <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>;
};
```

`FieldChangeData` 包含控件值 `data`、标识 `id`、字段路径和配置片段 `dataFragment`。简单字段可直接把 `dataFragment` 传给 `controller.update()`；若字段需要联动或转换，在 `onFieldChange` 中根据 `id` 和 `data` 处理后再更新。

## 常用控件

当前 schema 控件表支持 `input`、`number-input`、`color-picker`、`select`、`switch`、`slider`、`checkbox`、`radio`、`text-area` 等字段；`grid`、`accordion`、`sub-accordion` 可用于布局和分组。具体控件类型由当前 `@datavisool/ui/schema` 的 `UIMap` 注册表决定，属性放在 `config` 中，例如：

```ts
{
  type: "select",
  label: "对齐方式",
  key: "align",
  value: style.align,
  config: {
    options: [
      {label: "左对齐", value: "left"},
      {label: "居中", value: "center"},
      {label: "右对齐", value: "right"},
    ],
  },
}
```

控件属性和可用选项以所安装 UI 版本的 `Control` 类型及对应控件 props 为准；组件新增配置项时，也要在 `getInitConfig()` 中提供默认值。
