# Web 端部署

本组文档说明拿到 DataVisool Web 发布包后的部署。`datavisool-service` 同时提供前端页面、`/api/**` 接口和 `/static/**` 业务资源。

当前发布包有三种部署方式：

| 方式 | 运行内容 | 数据库 | 运行环境 |
| --- | --- | --- | --- |
| 常规部署 | `server.jar` | 外部 MySQL | Java 17 |
| Docker app | 应用容器 | 外部 MySQL 8.0 | Docker Engine、Docker Compose v2.20+ |
| Docker allinone | 单容器内的应用与 MySQL | 包内 MySQL | Docker Engine、Docker Compose v2.20+ |

## 常规部署包

常规 ZIP 中包含 `server.jar`、同级 `component-docs/`、`config/application.yml`、部署说明和平台启动入口。请解压完整发布包，并保留 `server.jar` 与 `component-docs/` 的同级关系。包内入口包括 Linux、Windows 和 macOS 启动脚本，其中 Windows 还提供命令行辅助脚本。手动启动命令见操作系统部署页。

推荐使用包内启动入口，它会检查 Java 17、交互补齐缺少的数据库连接值，并记录进程和日志：

- Linux：见 [Linux Web 部署](/deploy/web/linux.md)。
- Windows：见 [Windows Web 部署](/deploy/web/windows.md)。

启动脚本默认连接本机 `127.0.0.1:3306`。首次启动会询问数据库名、用户名和密码；准备好可用的 MySQL 实例及具备建库和迁移权限的账号后，按提示填写。实际数据库名由部署者提供。

首次使用空数据库时，启动器会提示设置 `admin` 的初始密码（至少 8 个字符、最多 72 个 UTF-8 字节），输入不回显且不会写入配置文件。非交互启动可设置 `DATAVISOOL_ADMIN_PASSWORD`；已有数据库不会重置管理员密码。

应用在数据库初始化前检查配置生效后的监听端口和地址，无法绑定时提示端口可能被占用或地址不可用。`server.port=0` 使用系统分配的端口，跳过固定端口检查；`--check` 不启动应用，也不检查端口。

`datavisool.resource-path.root` 可以不配置；未配置时资源根目录以 Java 进程工作目录为基准。若要把上传资源存到其他位置，可在 `config/application.yml` 中显式配置，并确保运行账号有读写权限。AI 存储和授权目录也按需配置。

若自行管理 Java 进程，可手动运行 `java -jar` 命令；示例见操作系统部署页。手动启动前需自行填写 `config/application.yml` 中的数据库连接信息，且仍需保留 `component-docs/`。

## Docker 发布包

当前 Docker 发布包分为 Docker app 与 Docker allinone，使用包内镜像和一键启动脚本，部署机不需要 Node.js、Java 或 JDK。系统架构需与发布包标注的 `amd64` 或 `arm64` 匹配；部署机需要本机 Docker Engine 或 Docker Desktop 的 Linux 容器引擎，以及 Docker Compose v2.20+。

详细步骤、`.env` 配置、持久化目录和日常操作见 [Web Docker 部署](/deploy/web/docker.md)。

## 部署文档范围

这里的 Docker app/allinone 是当前 Web 服务的 Docker 发布包。
