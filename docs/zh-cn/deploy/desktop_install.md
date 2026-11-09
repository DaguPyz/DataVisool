# 桌面端安装包

> 本页保留为独立交付方式的历史参考，未以 Web 工程验证其最新发行状态。当前 Web 站点请查看 [Web 端部署](/deploy/web.md)。

当前桌面端采用安装包分发。官方发布时会同时提供当前版本下载地址和自动更新清单。

## 当前下载入口

| 项目                      | 地址                                                                                                         | 说明                         |
|-------------------------|------------------------------------------------------------------------------------------------------------|----------------------------|
| Windows x64 安装包         | [LCP_2026.2.0_x64-setup.exe](https://lcpdesigner.cn/releases/2026.2.0/LCP_2026.2.0_x64-setup.exe)          | Windows 用户直接下载安装           |
| macOS Apple Silicon 安装包 | [LCP_darwin-aarch64.dmg](https://lcpdesigner.cn/releases/2026.2.0/LCP_2026.2.0_aarch64_darwin-aarch64.dmg) | Apple Silicon Mac 用户直接下载安装 |
| macOS Intel 安装包         | [LCP_darwin-x86_64.dmg](https://lcpdesigner.cn/releases/2026.2.0/LCP_2026.2.0_x64_darwin-x86_64.dmg)       | Intel Mac 用户直接下载安装         |

?> 自动更新用的是 `.app.tar.gz` 和 `latest.json`，不是手动安装包。普通用户只需要下载 `.exe` 或 `.dmg`。

?> 当前官方桌面安装包只覆盖 Windows x64、macOS Apple Silicon 和 macOS Intel。

## Windows 安装步骤

1. 打开 Windows 安装包下载链接并下载 `.exe`
2. 双击安装包，按向导完成安装
3. 安装完成后，从开始菜单或桌面图标启动 LCP
4. 首次启动后检查首页、设计器和发布入口是否正常

?> 如果 Windows 弹出 SmartScreen 或来源提示，确认下载地址来自官方发布目录后再继续。

## macOS 安装步骤

1. 打开对应架构的 `.dmg` 下载链接
2. 下载完成后双击挂载镜像
3. 将 `LCP` 拖入 `Applications`
4. 从“应用程序”里启动 LCP
5. 首次启动后检查首页、设计器和发布入口是否正常

?> 如果 macOS 提示“来自未识别的开发者”，通常先右键应用图标选择打开，再按系统提示放行。

## 如何确认版本

安装完成后，可以在应用内关于页面或首页设置中确认版本号。当前文档对应的版本是 `2026.2.0`。

## 说明

- 如果你要给普通用户分发桌面端，请优先使用上面的安装包链接
- 如果你是做自动更新或官网下载页，可以直接读取 [latest.json](https://lcpdesigner.cn/latest.json) 中的 `installers` 字段
- 如果你只想看发版链路，请参考桌面端发版说明，而不是安装说明
