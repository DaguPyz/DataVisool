# Linux 运行时部署

本页适用于 `light-chaser-runtime-2026.2.0-linux-x64-musl.zip`。

运行时包已经把前端资源、运行时程序和数据目录模板放在一起，不需要你再单独准备前端服务器、后端运行环境或数据库。

## 1. 包内内容

Linux 发布包解压后通常包含：

- `lcp-runtime`
- `web/`
- `lcp-runtime-data/`
- `部署说明.md`

## 2. 部署步骤

1. 将官方提供的 Linux 运行时压缩包解压到一个固定目录，例如 `/opt/lcp-runtime/`
2. 确认 `lcp-runtime`、`web/`、`lcp-runtime-data/` 在同一层级
3. 为可执行文件添加执行权限

```shell
chmod +x lcp-runtime
```

4. 启动服务

```shell
./lcp-runtime
```

5. 在浏览器中访问 `http://127.0.0.1:8080/release.html#/`
6. 如果是部署到服务器，把地址中的 `127.0.0.1` 换成服务器 IP 或域名

## 3. 自定义启动

如果你需要修改监听端口、前端目录或数据目录，可以显式设置环境变量：

```shell
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

如果你要长期常驻运行，建议把启动命令交给 `systemd` 或其他进程守护方式。下面是一个最小示例：

```ini
[Unit]
Description=Light Chaser Runtime
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/lcp-runtime
ExecStart=/opt/lcp-runtime/lcp-runtime
Environment=LCP_RUNTIME_BIND=0.0.0.0:8080
Environment=LCP_RUNTIME_WEB_DIR=/opt/lcp-runtime/web
Environment=LCP_RUNTIME_DATA_DIR=/opt/lcp-runtime/lcp-runtime-data
Restart=always
RestartSec=5
User=lcp

[Install]
WantedBy=multi-user.target
```

如果你的运行目录不是 `/opt/lcp-runtime`，把上面的路径换成你自己的解压目录即可。
如果你的机器上没有 `lcp` 用户，就把 `User=` 改成你自己的服务账号，或者先创建一个独立账号再绑定服务。
