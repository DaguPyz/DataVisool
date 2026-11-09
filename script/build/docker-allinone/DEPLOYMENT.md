<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# DataVisool Web Docker allinone 部署说明

本发布包包含应用与 MySQL 镜像 `{{IMAGE}}`，版本 `{{VERSION}}`，目标平台 `{{PLATFORM}}`（架构 `{{ARCHITECTURE}}`）。`amd64` 适用于 x86_64 Intel/AMD 服务器；`arm64` 适用于 ARM64 服务器。服务器架构必须匹配本包。

镜像内包含应用和 MySQL。首次启动时入口会询问数据库名称、用户名和密码，并初始化数据库；整个服务只需一个容器。MySQL 在容器内监听 `0.0.0.0`，Compose 默认仅将宿主机 `127.0.0.1:3306` 映射到容器 `3306`，可在 `.env` 中用 `MYSQL_BIND_ADDRESS` 和 `MYSQL_PORT` 调整宿主机绑定地址与端口。

部署机需要本机 Docker Engine 或 Docker Desktop 的 Linux 容器引擎，以及 Docker Compose v2.20+；不支持远程 Docker 引擎。部署不需要 Node.js、Java 或 JDK。Windows 使用 Docker Desktop 的 Linux containers 模式；生产环境建议使用 Linux 服务器。

## 提示语言 / Prompt language

启动脚本根据系统语言自动选择中文或英文；其他语言默认显示中文。可在启动前设置 `DATAVISOOL_LANG=zh-CN` 或 `DATAVISOOL_LANG=en-US` 覆盖自动选择。Linux/macOS 示例：`DATAVISOOL_LANG=en-US ./deploy_linux.sh`；Windows CMD 示例：`set DATAVISOOL_LANG=en-US`，然后运行 `deploy_windows.cmd`。应用、数据库和 Docker 自身输出的日志不受此设置控制。

The launcher selects Chinese or English from the system language and falls back to Chinese. Set `DATAVISOOL_LANG=zh-CN` or `DATAVISOOL_LANG=en-US` to override it. On Linux/macOS, run `DATAVISOOL_LANG=en-US ./deploy_linux.sh`; in Windows CMD, run `set DATAVISOOL_LANG=en-US` before `deploy_windows.cmd`. Application, database and Docker logs are not translated by this setting.

## 启动

首次初始化数据库前，在包内 `config/application.yml` 的现有 `datavisool:` 下添加 `initial-admin-password`，填写自己设置的管理员密码（至少 8 个字符、最多 72 个 UTF-8 字节；特殊字符按 YAML 规则引用或转义）。初始化成功后删除该配置及可能包含密码的备份。已有数据库不会重置管理员密码。

解压发布包后，在包根目录运行对应系统入口：Linux 执行 `./deploy_linux.sh`，macOS 执行 `./deploy_macos.command`，Windows 双击 `deploy_windows.cmd`。入口通过包内启动脚本和 Compose 管理容器。

首次启动会从包内 `docker-allinone/.env.example` 生成根目录 `.env`，写入当前包的镜像标签和稳定的 Compose 项目名；`DB_NAME`、`DB_USER`、`DB_PASSWORD` 初始为空，入口会提示填写缺失项。密码输入时隐藏；保存到 `.env` 后后续启动不再询问，直接回车会取消本次输入。首次填写的密码同时用于应用数据库账号和 MySQL root 初始化密码。首次启动使用包根目录的宿主机 `data/`，不存在时自动创建，再将其映射到容器 `/data`；Docker 中已有的同名数据卷不会被使用、修改或删除，仅存在数据卷不会阻止首次部署。已有同名容器仍须通过归属和挂载检查。运行时凭据保存在 `data/config/database.json`（容器内 `/data/config/database.json`，权限 600）。

`.env` 中声明的变量（包括自定义引用变量）不会被启动终端的同名变量覆盖；隔离仅作用于 Docker 子进程，不修改终端环境。`DOCKER_*`、`HOME`、`USERPROFILE`、`HOMEDRIVE` 和 `HOMEPATH` 控制 Docker 连接或配置目录，不能写入 `.env`，需要时在启动环境中设置。Windows 启动时会将 `.env` 及新建备份的访问权限限制为当前用户、SYSTEM 和 Administrators；`--check` 不修改权限。

已有数据库凭据不会自动改密，`.env` 中的三项必须与 `data/config/database.json` 中已保存的数据库名、用户名和应用密码一致；修改 `.env` 不会修改已有 MySQL 账号。已有数据库文件但凭据文件丢失时，容器会拒绝重新生成密码。启用宿主机 MySQL 端口后，已有数据若没有 `root@%`，runtime 会尝试用已保存的 root 密码添加同密码账号；已有 `root@%` 账号、密码和权限不会被修改。补建账号失败只输出通用警告，应用仍会启动。

已停止的实例若缺少根目录 `.env`，再次启动会从模板重新生成配置，并沿用 `run/` 记录的项目身份和宿主机 `data/` 路径；其余自定义设置需重新填写。不会创建空数据目录替代已记录但缺失的目录，不要删除原 `run/` 身份记录。

如果本机缺少包内指定的精确镜像，脚本会导入包根目录的 `image.tar`，不会执行 `pull`。启动前会检查镜像的 `io.datavisool.deployment=allinone` 和 `io.datavisool.mysql.base` 标签。当前数据记录的 MySQL 基础版本必须与镜像一致；不一致时服务拒绝启动，不会自动迁移数据库。

新脚本和镜像使用 `io.datavisool.*` 标签，不识别仅带 `io.lcp.*` 标签的旧镜像；不要直接用新脚本升级旧部署，需先确认部署和数据处理方案。

发布包根目录的 `data/` bind mount 到容器 `/data`，保存 MySQL 数据、数据库凭据、上传资源和应用日志：`data/mysql/` 是数据库文件，`data/resource/` 是资源，`data/config/database.json` 是凭据和数据库版本记录（权限 600），`data/logs/` 是应用文件日志。`config/application.yml` 位于包根目录并只读挂载到容器；`.env` 保存数据库连接、端口和运行设置。启动器在 `run/data.path` 记录 `data/` 的绝对路径。

保持 `data/`、`config/` 和 `.env` 一起，便于恢复或迁移。搬到新发布目录或新机器前，先用原包入口 `--stop` 正常停止并确认 MySQL 正常关闭，再复制数据；不要复制运行中的数据库。目标使用相同架构、相同应用版本和相同 MySQL 基础版本的发布包，复制整个 `data/`、`config/`、`.env`；将目标 `.env` 中的 `DATAVISOOL_PROJECT_NAME` 恢复为 `datavisool-web-allinone`，让新路径生成新项目身份。不要复制 `run/` 或 `.datavisool-deployment`，也不要在原部署目录随意修改项目名。`data/` 必须是真实目录，不能是符号链接；Docker Desktop 仍会挂载包目录中的该目录。

## 日常操作

以下示例使用 Linux 入口；macOS 替换为 `./deploy_macos.command`，Windows 在 CMD 使用 `deploy_windows.cmd`，或在 PowerShell 使用 `.\deploy_windows.cmd`，参数相同。

```bash
./deploy_linux.sh --check
./deploy_linux.sh --status
./deploy_linux.sh --logs
./deploy_linux.sh --stop
./deploy_linux.sh --restart
./deploy_linux.sh --help
```

不带参数即启动。`--check` 只读，不创建 `.env` 或 `data/`、不导入镜像、不提示数据库密码；首次尚无 `.env` 或数据库参数未填齐时会报错。它不探测端口是否被其他进程占用，也不代替启动后的健康检查。

`--status` 查看容器与数据库端口状态，`--logs` 跟随日志。`--restart` 停止成功后按当前 `.env` 重新启动；修改端口映射后应使用此命令。启动和重启默认最多等待健康检查 600 秒，可用 `--wait-timeout 900` 延长；该参数仅用于启动或重启。健康检查验证 MySQL 查询与应用 HTTP 端点。启动失败时会保留容器和宿主机数据目录。

停止运行中的容器时，脚本最多等待 120 秒，再确认容器退出正常及 `data/config/clean-shutdown` 标记。该标记确认 MySQL 正常关闭，不确认应用进程组是否优雅退出。对于已运行过的容器，异常退出或缺少标记会阻止 `--restart` 继续；尚未启动的 `created` 容器不要求该标记，可以修正配置后重试。

## 端口配置与占用处理

在包根目录 `.env` 修改宿主机的监听地址和端口：

| 配置项 | 默认值 | 用途 |
| --- | --- | --- |
| `APP_BIND_ADDRESS` | `0.0.0.0` | 应用在宿主机的监听地址 |
| `APP_PORT` | `8080` | 映射到容器内应用端口 `8080` |
| `MYSQL_BIND_ADDRESS` | `127.0.0.1` | MySQL 在宿主机的监听地址 |
| `MYSQL_PORT` | `3306` | 映射到容器内 MySQL 端口 `3306` |

两个端口均须为 `1–65535` 的十进制整数，不支持用 `0` 分配随机端口；`MYSQL_BIND_ADDRESS` 必须是 IPv4 地址。应用与数据库不能占用冲突的宿主机地址和端口。

若报 `bind: address already in use` 或 `ports are not available`，说明请求的宿主机端口无法绑定。以 MySQL 的 `3306` 被占用为例，在 `.env` 中改为一个未占用的端口：

```dotenv
MYSQL_PORT=3307
```

保存后执行当前系统入口的 `--restart`。macOS 示例：

```bash
./deploy_macos.command --restart
```

Linux 使用 `./deploy_linux.sh --restart`；Windows 在 CMD 使用 `deploy_windows.cmd --restart`，PowerShell 使用 `.\deploy_windows.cmd --restart`。外部客户端相应连接 `127.0.0.1:3307`（仍使用默认绑定地址时）。容器内 MySQL 保持 `3306`，无需修改 `config/application.yml` 中的数据库地址。

端口冲突可能让容器停留在 `created`、健康状态显示 `none`，并伴随启动器的“未通过健康检查”提示；此时应用尚未运行，日志可能为空。先处理 Docker 输出的端口错误，再重启即可，无需删除容器或 `data/`。

## 连接数据库与访问应用

数据库排查时，先用 `docker ps` 找到容器名，再在容器内运行 MySQL 客户端。替换尖括号占位符；`-p` 会交互提示密码，不要把密码写在命令中：

```bash
docker exec -it <容器名> mysql --protocol=TCP -h127.0.0.1 -u<用户> -p <库名>
```

宿主机 GUI 默认可连接 `127.0.0.1:3306`，使用 `.env` 中填写的数据库名、用户名和密码；如修改了 `MYSQL_PORT` 或 `MYSQL_BIND_ADDRESS`，连接对应的宿主机地址和端口。默认只允许本机访问。远程管理建议通过 SSH 隧道；如需直接远程连接，在 `.env` 中将 `MYSQL_BIND_ADDRESS` 显式设为服务器 IP，并限制防火墙来源。MySQL 监听 `0.0.0.0` 是容器内设置，是否能从宿主机或远程访问仍由 Compose 端口映射和宿主机网络规则决定。

普通停止不会删除宿主机 `data/`；删除或覆盖该目录会永久删除数据库、凭据、资源和日志。当前一键启动入口不提供升级或备份命令。

浏览器访问 `http://服务器地址:8080`。如需更换宿主机端口，可修改 `.env` 中的 `APP_PORT`；容器端口固定为 `8080`。
