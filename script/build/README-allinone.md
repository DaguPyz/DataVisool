<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# Docker allinone：应用和 MySQL 在一个容器中运行

`datavisool-web-allinone:<版本>` 同时包含前端、Java 后端和 MySQL。首次启动会初始化数据库，需填写数据库名、用户名和密码；无需另外启动 MySQL 容器。

## 构建镜像和发布包

统一构建入口先在本机完成一次常规构建，再将 `datavisool-server/datavisool-service/target/server.jar` 和 `datavisool-server/datavisool-service/target/component-docs` 提供给 Docker app 和 Docker allinone 共用。Docker 构建不会重复编译前后端，也不在镜像构建阶段运行 Node、pnpm 或 Maven；仍需下载 Java/MySQL 运行基础镜像并安装系统包。

完整统一构建机需要 Node.js 20+、JDK 17、Maven、pnpm、Docker Linux 容器引擎和 Buildx。单独运行本页构建脚本时，需要 Node.js 20+、Docker/Buildx 和已生成的 JAR、组件文档，不需要本机 JDK、Maven 或 pnpm；Docker 仍需能访问镜像仓库和系统包仓库。

在仓库根目录执行：

```bash
# 默认构建 amd64、arm64 并分别导出发布包
node script/build/docker-allinone/build-allinone.mjs

# 只构建 ARM64；在 Apple Silicon 本机验证时可跳过发布包
node script/build/docker-allinone/build-allinone.mjs --platform linux/arm64 --skip-export

# 使用同次常规构建生成的其他 JAR 和组件文档
node script/build/docker-allinone/build-allinone.mjs \
  --jar datavisool-server/datavisool-service/target/server.jar \
  --component-docs datavisool-server/datavisool-service/target/component-docs
```

单独运行构建脚本时默认复用上述路径中的产物，不会自动编译；缺少文件会直接报错。Docker 构建会制作移除内置 `application*.yml` 的专用 JAR 副本，并将对应的 `component-docs` 一起放入镜像。原常规 JAR 不会被修改。

版本号默认取自 `package.json`。发布包分别为 `script/build/release/datavisool-web-allinone-VERSION-linux-amd64.tar.gz` 和 `script/build/release/datavisool-web-allinone-VERSION-linux-arm64.tar.gz`，每包只含对应架构的镜像。构建机的 Buildx builder 需能原生构建或模拟执行 amd64 与 arm64。构建成功不等于两个架构都已完成真实容器验收。

## 发布包部署

部署机需要本机 Docker Engine 或 Docker Desktop 的 Linux 容器引擎，以及 Docker Compose v2.20+；不支持远程 Docker 引擎，不需要 Node.js、Java 或 JDK。解压匹配服务器架构的发布包，在包根目录运行对应入口：Linux 执行 `./deploy_linux.sh`，macOS 执行 `./deploy_macos.command`，Windows 双击 `deploy_windows.cmd`。Windows 和 macOS 使用 Docker Desktop 的 Linux 容器模式。

首次启动从包内 `docker-allinone/.env.example` 生成根目录 `.env`，写入当前包的镜像标签和稳定 Compose 项目名；`DB_NAME`、`DB_USER`、`DB_PASSWORD` 初始为空，入口会提示补齐缺失项。密码输入时隐藏；保存到 `.env` 后后续启动不再询问。首次填写的密码同时用于应用数据库账号和 MySQL root 初始化密码。运行时凭据保存在 `data/config/database.json`（权限 600）。

已有数据库凭据不会自动改密，`.env` 中三项必须与 `data/config/database.json` 的数据库名、用户和应用密码相符。已有数据库文件但凭据文件丢失时，容器会拒绝重新生成密码。启用宿主机 MySQL 端口后，已有数据若没有 `root@%`，runtime 会尝试用已保存的 root 密码添加同密码账号；已有 `root@%` 账号、密码和权限不会被修改，补建失败只显示通用警告并继续启动应用。

排查数据库时，在容器内运行客户端；将尖括号占位符替换为实际值，`-p` 会交互提示密码：

```bash
docker exec -it <容器名> mysql --protocol=TCP -h127.0.0.1 -u<用户> -p <库名>
```

MySQL 在容器内监听 `0.0.0.0`，Compose 默认只将宿主机 `127.0.0.1:3306` 映射到容器 `3306`，可用 `.env` 中的 `MYSQL_BIND_ADDRESS` 和 `MYSQL_PORT` 调整宿主机监听地址与端口。默认绑定地址下，宿主机 GUI 可连接 `127.0.0.1:<MYSQL_PORT>` 并填写 `.env` 中的数据库名、用户名和密码；若更改绑定地址，客户端需连接对应的宿主机 IP。默认映射仅本机可访问；远程管理建议使用 SSH 隧道，如需直接远程连接，应显式绑定服务器 IP 并限制防火墙来源。MySQL 只在容器的网络命名空间中运行，宿主机和远程是否能访问由 Compose 端口映射与宿主机网络规则决定。

宿主机 `3306` 被占用时，在包根目录 `.env` 将 `MYSQL_PORT` 改为未占用的端口，例如 `MYSQL_PORT=3307`，再执行对应系统入口的 `--restart`（macOS：`./deploy_macos.command --restart`）。默认绑定地址下，客户端改连 `127.0.0.1:3307`；容器内部仍为 `3306`，无需修改应用数据库地址。应用默认监听宿主机 `0.0.0.0:8080`，用 `APP_BIND_ADDRESS` 和 `APP_PORT` 调整，两个端口均须为 `1–65535`。即使端口冲突后容器处于 `created`、健康状态为 `none`，也可改端口后重试；具体配置和各系统命令见[端口配置与占用处理](docker-allinone/DEPLOYMENT.md#端口配置与占用处理)。

本机没有包内指定镜像时，入口会导入 `image.tar`，不会执行 `pull`。启动前会校验镜像的部署类型和 MySQL 基础版本；当前数据对应的 MySQL 基础版本与镜像不一致时会拒绝启动，不会自动迁移数据库。

`--check`、`--status`、`--logs`、`--stop`、`--restart` 可用于检查和日常操作；不带参数即启动。`--check` 只读，不创建 `.env` 或 `data/`、不导入镜像、不提示数据库密码；缺少 `.env` 或必要数据库参数时会报错，也不探测其他进程是否占用宿主机端口。启动和重启最多等待健康检查 600 秒，可用 `--wait-timeout 900` 延长；检查 MySQL 查询与应用 HTTP 端点。启动失败时会保留容器和数据供排查。

停止运行中的容器时，脚本最多等待 120 秒，再确认正常退出及 `data/config/clean-shutdown` 标记。该标记只确认 MySQL 正常关闭，不确认应用进程组是否优雅退出。对于已运行过的容器，异常退出或缺少标记会阻止 `--restart` 继续；尚未启动的 `created` 容器不要求该标记，可以修正配置后重试。

## 数据保存

首次启动使用发布包根目录的宿主机 `data/`，不存在时自动创建，并以 Docker bind mount 映射到容器 `/data`。Docker 中已有的同名数据卷不会被使用、修改或删除，仅存在数据卷不会阻止首次部署。已有同名容器仍须通过归属和挂载检查。目录内容如下：

| 宿主机路径 | 容器路径 | 内容 |
| --- | --- | --- |
| `data/mysql/` | `/data/mysql/` | MySQL 数据文件 |
| `data/resource/` | `/data/resource/` | 上传资源、AI 工作文件及模型密钥 |
| `data/config/database.json` | `/data/config/database.json` | 数据库凭据和数据库版本记录，权限 600 |
| `data/logs/` | `/data/logs/` | 应用文件日志 |

容器重建后仍使用同一 `data/` 目录。迁移到另一发布目录或机器前，先用原包入口 `--stop` 正常停止并确认 MySQL 正常关闭，不要复制运行中的数据库。随后复制整个 `data/`、`config/` 和 `.env` 到相同架构、相同应用版本且 MySQL 基础版本相同的发布包，保留 `data/config/database.json`；将目标 `.env` 中的 `DATAVISOOL_PROJECT_NAME` 恢复为 `datavisool-web-allinone`，让新路径生成新的项目身份。不要复制 `run/` 或 `.datavisool-deployment`，也不要在原部署目录随意修改项目名。包目录中的 `config/application.yml` 以只读方式挂载到容器，不在 `data/` 中。

`run/data.path` 记录宿主机上的绝对 `data/` 路径；如果该目录丢失，入口会停止并报错，避免静默创建空库。停止容器不会删除宿主机 `data/`；删除或覆盖它会永久丢失数据库、凭据、资源和日志。当前一键入口不提供升级或备份命令。

## 验证

仓库中提供部署脚本回归测试：

```bash
node --test script/build/tests/docker-allinone-launcher.test.mjs

# 使用本机 Docker/BuildKit 验证 Dockerfile 的 COPY 文件未被忽略（不拉取基础镜像）
DATAVISOOL_TEST_DOCKER_CONTEXT=1 node --test script/build/tests/docker-build-context.test.mjs
```

真实镜像验收应在目标 Docker 环境中检查首次启动、应用首页与 API、业务读写、上传资源和容器重建后的数据保留。每种镜像架构需分别验收，不能从构建成功推断另一架构也通过。
