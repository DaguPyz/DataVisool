# 使用脚手架开发服务器组件

服务器组件在浏览器中运行。使用 `datavisool-cli` 创建组件项目，在本地预览并打包为 ZIP，再从 DataVisool Web 的“服务器组件”页面上传。

## 环境与创建项目

需要 Node.js、pnpm，以及 TypeScript/React 基础。当前 CLI 源码包名和命令名均为 `datavisool-cli`，源码版本为 `0.2.0`；其 `package.json` 未声明 Node.js 最低版本。当前公开 npm registry 中尚未找到 `datavisool-cli`，所以先从 DataVisool-Desktop 源码仓库运行 CLI，并在组件项目中链接本地 SDK：

```bash
# 在 DataVisool-Desktop 仓库根目录执行
pnpm install
pnpm -F @datavisool/sdk build
node ./datavisool-cli/bin/index.js create my-components /absolute/path/my-components

# 在组件项目目录执行；本地路径替换为 DataVisool-Desktop 仓库位置
cd /absolute/path/my-components
pnpm add -D /path/to/DataVisool-Desktop/datavisool-sdk
pnpm install
```

`create <name> [destination]` 会将模板复制到目标目录，并把生成项目的 `package.json` 名称设为 `<name>`。默认目标目录与 `<name>` 相同；若目标已存在，CLI 会先询问是否覆盖。模板示例组件位于 `src/components/remote-button/`。

这样组件项目可使用当前源码中的 SDK 和 CLI；组件开发期间，在项目目录通过 CLI 源文件运行预览与构建：

```bash
node /path/to/DataVisool-Desktop/datavisool-cli/bin/index.js dev
node /path/to/DataVisool-Desktop/datavisool-cli/bin/index.js build remote-button
```

模板 `package.json` 自带的 `dev`、`build` 脚本会调用全局 `datavisool-cli` 命令。待 CLI 正式发布后，可使用 `npm install -g datavisool-cli` 安装，并改用这些脚本；安装后先运行 `datavisool-cli --version` 确认版本。模板声明的 SDK 版本范围为 `@datavisool/sdk: ^0.1.0`。

## 开发与本地预览

```bash
node /path/to/DataVisool-Desktop/datavisool-cli/bin/index.js dev
```

打开 `http://localhost:3000/`，首页列出模板识别到的组件；选择组件后可预览视图并编辑组件自己的配置面板。独立预览页会为由宿主提供的内置配置面板显示提示，最终配置效果应在 DataVisool Web 设计器中复核。

预览服务器默认使用 `http://localhost:3000/`。

## 组件文件

模板示例按组件目录组织：

| 文件 | 用途 |
| --- | --- |
| `definition.ts` | 定义唯一的 `compKey`、组件名称、初始配置、预览图、配置面板映射和蓝图事件；`getBaseInfo()` 返回的 `source: 'remote'` 必须保留 |
| `controller.ts` | 继承 SDK 控制器，创建和销毁组件实例，更新配置、数据、主题并注册蓝图事件 |
| `component.tsx` | React 视图；模板用 `forwardRef` 暴露更新配置和绑定事件的方法 |
| `config.tsx` | React 配置表单；控件变更时调用 `controller.update(...)` |
| `component.module.less` | 组件样式 |
| `*.png` | 组件库中的预览图 |

模板使用 `@datavisool/sdk`。CLI 构建会把依赖映射到 Web 宿主全局对象：`react` 到 `React`、`react-dom` 和 `react-dom/client` 到 `ReactDOM`、`@datavisool/sdk` 及其公开子入口到 `DataVisoolSDK`、`@datavisool/sdk/types` 到 `DataVisoolTypes`、`@datavisool/ui` 及其公开子入口到 `DataVisoolUI`。当前 Web 宿主导出这些全局对象，CLI 同时把组件定义注册到 `__DATAVISOOL_REMOTE_COMPONENT_TEMP__`。不要把旧的 `LightChaserInterface`、`LightChaserUtil` 或旧注册全局名写进组件。

`compKey` 必须唯一。模板示例让初始配置中的 `base.type` 与 `compKey` 一致；定义类需继承 SDK 的 `AbstractDesignerDefinition`，并返回基础信息、初始配置、控制器、预览图和配置面板映射。蓝图会依据 `getEventList()` 显示组件可触发的事件。

控制器需实现 `AbstractDesignerController` 的生命周期。`create(container, config, executor, index?)` 接收容器、初始配置、蓝图执行器和可选循环索引；`update()` 合并配置并刷新视图，`changeData()` 更新组件数据，`registerEvent()` 把组件交互转发给蓝图，`destroy()` 释放组件实例。数据加载方式由组件实现；如需响应主题变化，在 `updateTheme()` 中更新并刷新组件。

## 打包并上传

```bash
node /path/to/DataVisool-Desktop/datavisool-cli/bin/index.js build
```

不带组件名时，CLI 会打包 `src/components/` 下包含 `definition.ts` 的组件目录。指定目录名可构建单个组件；多个名称可用多个参数或逗号分隔：

```bash
node /path/to/DataVisool-Desktop/datavisool-cli/bin/index.js build remote-button
node /path/to/DataVisool-Desktop/datavisool-cli/bin/index.js build remote-button,remote-chart
```

每个组件会输出 `dist/<组件目录名>.zip`，并在 `dist/<组件目录名>/` 下保留入口 JS 和 `assets/` 等静态资源。上传时选择生成的 ZIP，确保样式和图片随包保存。

1. 登录 Web，打开“服务器组件”管理页。
2. 点击“上传”，选择 `dist/<组件目录名>.zip`。
3. 上传成功后，在设计器组件库中找到该组件并添加到画布。

更新已上传组件时，使用管理页中的“替换”操作。删除组件前，先确认没有项目引用它。
