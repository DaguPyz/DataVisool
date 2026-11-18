# datavisool-sdk

发布到 npm 组织的包名为 `@datavisool/sdk`。在仓库根目录的交互式终端运行 `pnpm release:datavisool-sdk`，或在本目录运行 `pnpm release`。脚本检查登录账号，选择版本和标签，构建并预演，确认后公开发布并验证下载地址。仅查询当前版本的发布状态可运行 `pnpm release:datavisool-sdk --verify-only`。发布账号需要具备组织权限。

组件开发套件，提供组件生命周期、定义、React 渲染和共享工具。应用与外部组件使用同一份公共契约。

```ts
import {AbstractDesignerController, ComponentUtil, ObjectUtil} from '@datavisool/sdk';
import type {MenuInfo, MenuToConfigMappingType} from '@datavisool/sdk/core';
import type {ComponentBaseProps, UpdateOptions} from '@datavisool/sdk/types';
```

公开入口：`@datavisool/sdk`、`@datavisool/sdk/core`、`@datavisool/sdk/utils`、`@datavisool/sdk/react`、`@datavisool/sdk/host`、`@datavisool/sdk/types`。只使用工具函数时优先选择 `/utils`。

数据加载、蓝图执行、内置配置面板由宿主实现。远程组件使用 `datavisool-cli` 构建，CLI 将 SDK 引用映射到宿主的 `DataVisoolSDK`。宿主控制器继承 SDK 控制器并实现数据加载，公共生命周期和默认动作不再重复维护。

独立开发环境可调用 `registerHostConfigPanels` 注入配置面板；脚手架默认在宿主面板位置显示说明，组件自己的样式面板照常使用。SDK 本身不访问用户认证、Tauri 或设计器全局状态。

React 组件渲染失败时，SDK 默认显示简短提示。宿主可通过 `setRenderErrorFallback` 提供自己的错误提示组件，传入 `undefined` 可恢复默认提示。

自定义组件的开发和兼容说明见 [组件开发总览](../docs/zh-cn/develop/index.md)。
