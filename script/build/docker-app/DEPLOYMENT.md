<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# DataVisool Web Docker app 部署说明

本发布包包含应用镜像 `{{IMAGE}}`，版本 `{{VERSION}}`，目标平台 `{{PLATFORM}}`（架构 `{{ARCHITECTURE}}`）。`amd64` 适用于 x86_64 Intel/AMD 服务器；`arm64` 适用于 ARM64 服务器。服务器架构必须匹配本包。

部署机需要 Docker Engine 或 Docker Desktop 的 Linux 容器引擎，以及 Docker Compose v2.20+。部署不需要 Node.js、Java 或 JDK。应用连接已有的 MySQL 8.0；数据库和账号需预先创建，并允许应用容器访问。

## 提示语言 / Prompt language

启动脚本根据系统语言自动选择中文或英文；其他语言默认显示中文。可在启动前设置 `DATAVISOOL_LANG=zh-CN` 或 `DATAVISOOL_LANG=en-US` 覆盖自动选择。Linux/macOS 示例：`DATAVISOOL_LANG=en-US ./deploy_linux.sh`；Windows CMD 示例：`set DATAVISOOL_LANG=en-US`，然后运行 `deploy_windows.cmd`。应用、数据库和 Docker 自身输出的日志不受此设置控制。

The launcher selects Chinese or English from the system language and falls back to Chinese. Set `DATAVISOOL_LANG=zh-CN` or `DATAVISOOL_LANG=en-US` to override it. On Linux/macOS, run `DATAVISOOL_LANG=en-US ./deploy_linux.sh`; in Windows CMD, run `set DATAVISOOL_LANG=en-US` before `deploy_windows.cmd`. Application, database and Docker logs are not translated by this setting.

## 启动

首次连接空数据库前，在包内 `config/application.yml` 的现有 `datavisool:` 下添加 `initial-admin-password`，填写自己设置的管理员密码（至少 8 个字符、最多 72 个 UTF-8 字节；特殊字符按 YAML 规则引用或转义）。初始化成功后删除该配置及可能包含密码的备份。已有数据库不会重置管理员密码。

解压发布包后，在包根目录运行对应系统入口：Linux 执行 `./deploy_linux.sh`，macOS 执行 `./deploy_macos.command`，Windows 双击 `deploy_windows.cmd`。Windows 和 macOS 使用 Docker Desktop 的 Linux 容器模式。

首次启动会在包根目录创建 `.env`，并依次询问数据库名、用户名和密码；密码输入不回显。已存在的有效连接值及其他设置会保留，只询问缺失项。数据库连接地址默认是 `host.docker.internal:3306`，可按实际环境修改 `.env` 中的 `DB_HOST` 和 `DB_PORT`。`config/application.yml` 中的 `${DB_*}` 配置由这些值提供。

Linux/macOS 首次启动时，留空的 `APP_UID` 和 `APP_GID` 自动使用当前用户的身份，以便应用写入资源和日志目录；以 root 启动时使用容器默认身份。已填写的值会保留。旧配置若仍填写 `10001` 且目录不可写，需要将其改为目录所有者对应的身份；已有部署请保持原身份，避免无法访问原数据。Windows 使用容器默认身份。

`.env` 中声明的变量（包括自定义引用变量）不会被启动终端的同名变量覆盖；隔离仅作用于 Docker 子进程，不修改终端环境。`DOCKER_*`、`HOME`、`USERPROFILE`、`HOMEDRIVE` 和 `HOMEPATH` 控制 Docker 连接或配置目录，不能写入 `.env`，需要时在启动环境中设置。Windows 启动时会将 `.env` 及新建备份的访问权限限制为当前用户、SYSTEM 和 Administrators；`--check` 不修改权限。

已停止的实例若缺少根目录 `.env`，再次启动会沿用 `run/project.name` 记录的原项目名，从模板重新补齐配置。模板中已有的值会直接使用，缺少的数据库值会提示输入；其余自定义设置需重新填写。不要删除原 `run/` 身份记录。

如果本机没有包内指定的镜像，启动脚本会从包根目录的 `image.tar` 导入该镜像，不会拉取其他镜像。脚本会在启动前检查部署配置，并等待应用健康检查；默认最多等待 300 秒，可用 `--wait-timeout 600` 延长。

```bash
./deploy_linux.sh --check
./deploy_linux.sh --status
./deploy_linux.sh --logs
./deploy_linux.sh --stop
./deploy_linux.sh --restart
```

根目录入口支持 `--check`、`--status`、`--stop`、`--restart`、`--logs`、`--help`；不带参数即启动。`--check` 只读，不提示、不创建文件、不导入镜像。健康检查失败时容器会保留，便于查看日志。停止最多等待 60 秒，之后 Docker 会按容器停止策略结束进程。

## 数据保存

上传资源、AI 工作文件及模型密钥保存在包根目录的 `resource/`；应用文件日志保存在 `logs/`。容器将这两个目录挂载到应用的持久化路径，容器重建不会删除目录内容。`.env` 和 `config/application.yml` 也位于包根目录；保持发布包目录在原位置，不要删除 `.datavisool-deployment` 或 `run/` 身份记录，也不要手动更换 `.env` 中固定的 `DATAVISOOL_PROJECT_NAME`。

应用使用外部 MySQL，发布包不会创建或管理数据库。数据库账号需具备应用运行所需的读写和数据库迁移权限。

当前一键启动入口暂不提供升级或备份命令。
