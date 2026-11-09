# 组件开发

DataVisool Web 支持内置组件和服务器组件。自定义服务器组件由 `datavisool-cli` 生成与打包，上传后可在设计器中使用；CLI 将组件 SDK、React 和 UI 包映射到当前 Web 宿主提供的全局对象。

`创建组件 → 实现定义、控制器和视图 → 本地预览 → 打包 ZIP → Web 上传`

- [使用脚手架开发服务器组件](/develop/develop_pro.md)：创建、预览、构建并上传组件。
- [配置面板与 JSON Schema UI](/develop/ui.md)：用 schema 描述控件，并调用控制器更新组件配置。

当前模板依赖 `@datavisool/sdk`，不再使用旧版 `light-chaser-interface`、`light-chaser-types`、`light-chaser-ui` 或 `light-chaser-util`。若需要 JSON Schema 配置面板，当前 Web 宿主支持 `@datavisool/ui/schema` 的 `DatavisoolGUI`；加入该 UI 开发依赖的方式见[配置面板与 JSON Schema UI](/develop/ui.md)。
