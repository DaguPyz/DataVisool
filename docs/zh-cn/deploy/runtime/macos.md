# macOS 运行时部署

本页适用于 `light-chaser-runtime-2026.2.0-macos-apple-silicon.zip` 和 `light-chaser-runtime-2026.2.0-macos-intel.zip`。

## 1. 包内内容

解压后通常包含：

- `lcp-runtime`
- `web/`
- `lcp-runtime-data/`
- `部署说明.md`

## 2. 部署步骤

1. 将官方提供的 macOS 运行时压缩包解压到一个固定目录，例如 `/opt/lcp-runtime/`
2. 确认 `lcp-runtime`、`web/`、`lcp-runtime-data/` 在同一层级
3. 为可执行文件添加执行权限

```bash
chmod +x lcp-runtime
```

4. 启动服务

```bash
./lcp-runtime
```

5. 在浏览器中访问 `http://127.0.0.1:8080/release.html#/`
6. 如果是部署到服务器，把地址中的 `127.0.0.1` 换成服务器 IP 或域名

## 3. 自定义启动

如果你需要修改监听端口、前端目录或数据目录，推荐显式设置环境变量：

```bash
LCP_RUNTIME_BIND=0.0.0.0:8080 \
LCP_RUNTIME_WEB_DIR=/opt/lcp-runtime/web \
LCP_RUNTIME_DATA_DIR=/opt/lcp-runtime/lcp-runtime-data \
./lcp-runtime
```

## 4. 部署成功判断

- 打开首页后会自动进入 `/release.html#/`
- 导入页和项目页都可以正常打开
- 图片、视频、字体和模型资源能正常显示

## 5. 常驻运行

如果你要长期常驻运行，建议把同一条启动命令写入 `launchd` 或其他系统服务管理方式中。
