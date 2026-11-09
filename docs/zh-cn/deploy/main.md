# 软件部署

当前用户功能指南对应 DataVisool Web。浏览器通过同一个 Web 服务访问前端页面、`/api/**` 接口和 `/static/**` 资源。后端 Maven 模块名为 `datavisool-service`。Web 部署优先查看 [Web 端部署](/deploy/web.md)。

## 选择 Web 部署包

| 部署方式 | 主机条件 | 数据库 | 说明 |
| --- | --- | --- | --- |
| 常规部署包 | Java 17 | 自行准备 MySQL | 包含 `server.jar`、`component-docs/`、外部配置及平台启动脚本 |
| Docker app | Docker 与 Compose | 自行准备 MySQL 8.0 | 应用在容器中运行，资源保留在部署目录 |
| Docker allinone | Docker 与 Compose | 容器内 MySQL | 应用和数据库在同一容器中，数据保存在宿主机 `data/` |

- [Windows 常规部署](/deploy/web/windows.md)
- [Linux 常规部署](/deploy/web/linux.md)
- [Docker app / allinone 部署](/deploy/web/docker.md)
- [Web 升级与验证](/upgrade/upgrade.md)

本节面向已取得部署包的使用者。源码开发启动见 [开发环境](/start.md)。
