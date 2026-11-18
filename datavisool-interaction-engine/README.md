# @datavisool/interaction-engine

DataVisool 画布交互引擎，提供拖拽、缩放、旋转、吸附、命中测试和选区等能力。

## 发布 npm 包

在仓库根目录的交互式终端运行 `pnpm release:datavisool-interaction-engine`，或在本目录运行 `pnpm release`。脚本检查 npm 登录账号，选择版本和标签，构建并预演；确认后公开发布并验证下载地址。发布账号需要具备 datavisool 组织的发布权限。

仅查询当前版本状态：`pnpm release:datavisool-interaction-engine --verify-only`。

包名从 `datavisool-interaction-engine` 改为 `@datavisool/interaction-engine`；使用方需要同步更新依赖和导入。导出的 `DATAVISOOL_INTERACTION_ENGINE_PACKAGE` 常量值也随之改变。
