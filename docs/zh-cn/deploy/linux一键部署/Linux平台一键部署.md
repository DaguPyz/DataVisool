# Linux 运行时快速启动

如果你已经拿到官方 Linux 运行时发布包，这一页就是最短启动路径。

## 快速步骤

1. 解压 Linux 发布包到一个固定目录
2. 确认 `lcp-runtime`、`web/`、`lcp-runtime-data/` 保持同级
3. 为可执行文件添加执行权限

```shell
chmod +x lcp-runtime
```

4. 启动服务

```shell
./lcp-runtime
```

5. 浏览器打开 `http://127.0.0.1:8080/release.html#/`
6. 如果要给别人访问，把 `127.0.0.1` 换成服务器 IP 或域名

?> 这不是另一套部署方式，只是同一个发布包的快速启动版说明。

## 需要改端口时

如果你需要改端口或目录，参考包内 `部署说明.md`，或者查看 [部署参数说明](/deploy/runtime/config.md)。
