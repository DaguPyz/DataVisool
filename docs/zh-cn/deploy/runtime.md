# 运行时部署

> 本页保留为独立交付方式的历史参考，未以 Web 工程验证其最新发行状态。当前 Web 站点请查看 [Web 端部署](/deploy/web.md)。

运行时用于 Pure Release 同源部署。当前运行时包内已经把前端资源、运行时程序和数据目录模板放在一起，不需要你再单独准备前端服务器、后端运行环境或数据库。

## 发布物组成

| 内容 | 说明 |
| --- | --- |
| `lcp-runtime` | 运行时服务程序 |
| `web/` | Pure Release 前端资源，包含 `release.html`、`assets/`、`favicon.ico` |
| `lcp-runtime-data/` | 运行时数据目录模板 |
| `部署说明.md` | 包内部署说明 |

## 当前官方构建产物

`npm run build:runtime` 会按平台生成这些压缩包：

| 平台 | 文件名示例 |
| --- | --- |
| macOS Apple Silicon | `light-chaser-runtime-2026.2.0-macos-apple-silicon.zip` |
| macOS Intel | `light-chaser-runtime-2026.2.0-macos-intel.zip` |
| Linux x64 musl | `light-chaser-runtime-2026.2.0-linux-x64-musl.zip` |
| Windows x64 | `light-chaser-runtime-2026.2.0-windows-x64.zip` |

默认输出目录是 `dist/runtime-package/`。
如果你只需要宿主机平台版本，可以改用 `npm run build:runtime:host`。

?> Linux 生产环境建议优先使用 musl 包，减少宿主机系统库差异带来的风险。

## 统一访问地址

- 首页：`http://服务器IP:端口/`
- 入口页：`http://服务器IP:端口/release.html#/`

## 推荐阅读顺序

1. [部署参数说明](/deploy/runtime/config.md)
2. [Windows 运行时部署](/deploy/windows常规部署/windows常规部署.md)
3. [macOS 运行时部署](/deploy/runtime/macos.md)
4. [Linux 运行时部署](/deploy/linux常规部署/linux常规部署.md)
5. [Windows 快速启动](/deploy/windows一键部署/windows平台一键部署.md)
6. [Linux 快速启动](/deploy/linux一键部署/Linux平台一键部署.md)

## 说明

?> 运行时包内的 `web/release.html` 来自桌面端仓库中的 `light-chaser-app/release.html`，打包后会被同步到运行时 `web/` 目录。
?> 当前运行时部署是同源托管方案，不再需要单独的前端服务器、Nginx 或额外数据库来承载页面。
