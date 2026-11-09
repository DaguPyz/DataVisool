# Windows 运行时部署

本页适用于 `light-chaser-runtime-2026.2.0-windows-x64.zip`。

运行时包已经把前端资源、运行时程序和数据目录模板放在一起，不需要你再单独准备前端服务器、后端运行环境或数据库。

## 1. 包内内容

Windows 发布包解压后通常包含：

- `lcp-runtime.exe`
- `web/`
- `lcp-runtime-data/`
- `部署说明.md`

## 2. 部署步骤

1. 将官方提供的 Windows 运行时压缩包解压到一个固定目录，例如 `D:\lcp-runtime\`
2. 确认 `lcp-runtime.exe`、`web/`、`lcp-runtime-data/` 在同一层级
3. 双击 `lcp-runtime.exe` 启动服务
4. 在浏览器中访问 `http://127.0.0.1:8080/release.html#/`
5. 如果是部署到服务器，把地址中的 `127.0.0.1` 换成服务器 IP 或域名

?> Windows 首次启动时，如果系统弹出防火墙提示，请允许该程序访问你设置的端口。

## 3. 自定义启动

如果你需要修改监听端口、前端目录或数据目录，可以显式设置环境变量：

```powershell
$env:LCP_RUNTIME_BIND="0.0.0.0:8080"
$env:LCP_RUNTIME_WEB_DIR="D:\lcp-runtime\web"
$env:LCP_RUNTIME_DATA_DIR="D:\lcp-runtime\lcp-runtime-data"
.\lcp-runtime.exe
```

## 4. 部署成功判断

- 打开首页后会自动进入 `/release.html#/`
- 导入页和项目页都可以正常打开
- 图片、视频、字体和模型资源能正常显示

## 5. 常驻运行

如果你要长期常驻运行，建议把启动命令交给 Windows 服务管理工具，避免关闭终端后进程退出。
