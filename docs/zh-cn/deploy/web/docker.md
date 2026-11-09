# Web Docker 部署

本文说明当前 Web 服务的 Docker app 与 Docker allinone 一键部署包。

## 选择部署包

| 发布包 | 容器内容 | 数据库 | 持久化位置 |
| --- | --- | --- | --- |
| Docker app | Web 应用 | 连接已有 MySQL 8.0 | 包根目录 `resource/`、`logs/` |
| Docker allinone | Web 应用和 MySQL，单容器 | 包内 MySQL | 包根目录 `data/` |

两种包都包含匹配架构的镜像、应用配置、`component-docs/`（已打入镜像）、Compose 文件、环境变量模板和系统启动入口。部署机需使用本机 Docker Engine 或 Docker Desktop 的 Linux 容器引擎、Docker Compose v2.20+，并选择与服务器相符的 `amd64` 或 `arm64` 包；不需要 Node.js、Java 或 JDK。当前启动器不支持远程 Docker 引擎。

## 解压并启动

解压完整发布包后，在包根目录运行对应入口。Linux 示例：

```bash
./deploy_linux.sh
```

Windows 可双击 `deploy_windows.cmd`，也可在 PowerShell 执行 `.\deploy_windows.cmd`。macOS 使用 `deploy_macos.command` 和 Docker Desktop 的 Linux 容器模式。首次运行会在包根目录创建 `.env`，提示填写缺少的数据库配置；不带参数即启动。若包内指定的镜像尚未加载，启动器会从包根目录的 `image.tar` 导入，不会拉取其他镜像。

### Docker app

此包只运行应用容器，数据库需自行提供 MySQL 8.0，并预先准备数据库和应用账号。首次启动提示填写数据库名、用户名和密码，值会保存到包根目录 `.env`。默认连接地址为 `host.docker.internal:3306`；如数据库不在该地址，编辑 `.env` 的 `DB_HOST`、`DB_PORT` 为容器可访问的地址和端口，再启动。数据库账号需要应用运行和迁移所需权限。

应用默认发布在 `0.0.0.0:8080`，可在 `.env` 中用 `APP_BIND_ADDRESS`、`APP_PORT` 调整。上传资源、AI 工作文件和模型密钥保存在 `resource/`；应用文件日志保存在 `logs/`。请保持这两个目录、`.env`、`config/` 和启动脚本在同一发布目录。

### Docker allinone

此包在一个容器中运行应用和 MySQL。首次启动时需填写 `.env` 中的数据库名、用户名和密码；首次输入的密码同时用于应用数据库账号和 MySQL root 初始化密码。已初始化的数据不会因修改 `.env` 自动改密。

两种 Docker 包首次使用空数据库时，启动前还需在包根目录 `config/application.yml` 的 `datavisool:` 下设置 `initial-admin-password`，作为 `admin` 的初始密码（至少 8 个字符、最多 72 个 UTF-8 字节）。初始化成功后删除该配置及可能包含密码的备份。已有数据库不会重置管理员密码。

数据库文件、凭据、上传资源和应用日志保存在包根目录 `data/`。容器重建会继续使用该目录；请把它作为持久化数据保留。应用默认发布在 `0.0.0.0:8080`，MySQL 默认只映射到宿主机 `127.0.0.1:3306`。可通过 `.env` 的 `APP_BIND_ADDRESS`、`APP_PORT`、`MYSQL_BIND_ADDRESS`、`MYSQL_PORT` 修改宿主机映射；修改后运行 `./deploy_linux.sh --restart`（按系统换用对应入口）。

搬迁 allinone 数据前，先用原发布包入口正常停止容器，再复制整个 `data/`、`config/` 和 `.env`。不要复制运行中的数据库目录；应用版本、架构和 MySQL 基础版本需与目标包兼容。更详细的凭据和搬迁约束以同版本发布包内的 `部署说明.md` 为准。

## 日常操作

在发布包根目录通过同一入口检查和管理对应部署：

```bash
./deploy_linux.sh --check
./deploy_linux.sh --status
./deploy_linux.sh --logs
./deploy_linux.sh --restart
./deploy_linux.sh --stop
```

`--check` 是只读检查，不创建配置或导入镜像；`--status` 查看实例，`--logs` 跟随容器日志，`--restart` 重启，`--stop` 停止。Windows 和 macOS 使用各自的包内入口并传入相同参数。Docker app 启动时默认最多等待应用健康检查 300 秒；allinone 默认最多等待 600 秒，可用 `--wait-timeout` 延长。启动失败时容器和持久化数据会保留，便于检查日志。

当前一键入口不提供数据库备份或版本升级命令。升级前应按服务维护流程备份数据，并以目标发布包内对应版本的说明为准。
