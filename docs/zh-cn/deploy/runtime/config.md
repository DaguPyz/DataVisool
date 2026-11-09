# 部署参数说明

运行时发布包默认已经可以直接启动。如果你需要修改监听端口、前端目录或数据目录，可以在启动时设置下面几个参数。

## 常用参数

| 参数 | 作用 | 常见取值 |
| --- | --- | --- |
| `LCP_RUNTIME_BIND` | 服务监听地址 | `0.0.0.0:8080` |
| `LCP_RUNTIME_WEB_DIR` | Pure Release 前端目录 | 包内 `web/` 目录 |
| `LCP_RUNTIME_DATA_DIR` | 运行时数据目录 | 包内 `lcp-runtime-data/` 目录 |

?> 如果你只是按官方发布包直接启动，通常不需要修改这些参数。
?> 如果你不显式设置 `LCP_RUNTIME_WEB_DIR`，服务会优先回退到可执行文件同级的 `web/` 目录；如果你不显式设置 `LCP_RUNTIME_DATA_DIR`，默认使用当前目录下的 `lcp-runtime-data/`。

## 启动示例

### Windows

```powershell
$env:LCP_RUNTIME_BIND="0.0.0.0:8080"
$env:LCP_RUNTIME_WEB_DIR="D:\lcp-runtime\web"
$env:LCP_RUNTIME_DATA_DIR="D:\lcp-runtime\lcp-runtime-data"
.\lcp-runtime.exe
```

### macOS / Linux

```shell
LCP_RUNTIME_BIND=0.0.0.0:8080 \
LCP_RUNTIME_WEB_DIR=/opt/lcp-runtime/web \
LCP_RUNTIME_DATA_DIR=/opt/lcp-runtime/lcp-runtime-data \
./lcp-runtime
```

## 目录说明

- `web/release.html`：Pure Release 入口页
- `web/assets/`：前端静态资源
- `web/favicon.ico`：站点图标
- `lcp-runtime-data/static/`：项目导入后的图片、视频、字体、模型和动态脚本资源
- `lcp-runtime-data/db/`：运行时数据目录，首次启动后自动生成

## 访问检查

- `http://服务器IP:端口/` 可以跳转到 `/release.html#/`
- `http://服务器IP:端口/release.html#/` 可以正常打开
- `http://服务器IP:端口/static/...` 可以正常加载资源
