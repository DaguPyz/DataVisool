<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# 构建与部署

## 统一构建

从仓库根目录运行：

```bash
node script/build/build-all.mjs
```

统一入口使用 `package.json` 中的版本号，依次生成常规部署 ZIP、Docker app 的 amd64/arm64 包，以及 Docker allinone 的 amd64/arm64 包，文件输出到 `script/build/release/`。任一产物已存在时会停止，避免覆盖；某一步失败时停止后续步骤并保留已生成的产物。发布包完整生成后才出现在最终路径，这要求输出目录所在文件系统支持硬链接。构建流程只写本地文件，不会上传或部署到服务器。

构建机需要 Node.js 20+、JDK 17、Maven、pnpm，以及支持 amd64 和 arm64 的 Docker Buildx。常规构建在本机生成一次 `datavisool-server/datavisool-service/target/server.jar` 和 `datavisool-server/datavisool-service/target/component-docs`；Docker app 和 Docker allinone 复用这组产物，不重复编译前后端。Docker 构建仍需下载 Java/MySQL 运行基础镜像并安装系统包，因此需要访问相应镜像仓库和软件包仓库。单独运行 Docker 构建脚本时仍需 Node.js 20+、Docker/Buildx 和已生成的 JAR、组件文档，不需要本机 JDK、Maven 或 pnpm。

单独运行 Docker 构建脚本：

```bash
# Docker app
node script/build/docker-app/build-app.mjs

# Docker allinone
node script/build/docker-allinone/build-allinone.mjs
```

Docker 构建脚本默认读取上述 JAR 和组件文档路径；也可用 `--jar PATH`、`--component-docs DIR` 指定同次常规构建的另一组产物。缺少构建产物时脚本会报错，不会退回到容器内编译。常规和 Docker 打包都会检查 JAR 的 Spring Boot 入口和前端资源。Docker 镜像使用移除内置 `application*.yml` 的 JAR 副本；原常规 JAR 不修改。统一入口还支持 `--target-jdk`、`--maven-home`、`--mvn-command`、`--no-cache` 和 `--dry-run`。

常规构建说明见 [常规部署文档](native/README.md)。Docker allinone 的构建与运行细节见 [Docker allinone 文档](README-allinone.md)。

## 发布包部署

Docker app 和 Docker allinone 压缩包只保留包根目录的一键启动方式，包含匹配架构的镜像、配置、部署说明、四个平台入口、对应的 `launch` helper、Compose 文件及环境变量模板。部署服务器不需要 Node.js、Java 或 JDK，但需要 Docker Engine 或 Docker Desktop 的 Linux 容器引擎和 Docker Compose v2.20+。Windows 和 macOS 使用 Docker Desktop 的 Linux 容器模式。服务器架构必须与发布包标注的 `amd64` 或 `arm64` 一致。

解压后运行包根目录入口：Linux 执行 `./deploy_linux.sh`，macOS 执行 `./deploy_macos.command`，Windows 双击 `deploy_windows.cmd`。无参数启动服务，也可使用 `--check`、`--status`、`--logs`、`--stop`、`--restart` 查看和控制服务。入口使用发布包内指定的镜像；本机未加载时会导入包内 `image.tar`，不会拉取其他版本。

Docker app 只运行应用容器，连接用户提供的 MySQL 8.0。上传资源、AI 文件和模型密钥保存在发布目录的 `resource/`，应用文件日志保存在 `logs/`；保持该目录不变以保留数据。首次启动提示补齐数据库配置，数据库配置保存在包根目录 `.env`。

Docker allinone 在单容器内运行应用和 MySQL。首次启动时入口会询问 `.env` 中为空的 `DB_NAME`、`DB_USER`、`DB_PASSWORD`；密码输入隐藏，保存后不再询问。首次填写的密码用于应用数据库账号和 MySQL root 初始化密码；已有数据库凭据不会改密，`.env` 必须与其一致。已有数据若缺少 `root@%`，runtime 会尝试使用保存的 root 密码添加账号，不会修改已有 `root@%` 账号、密码或权限。

Docker allinone 默认发布应用端口 `0.0.0.0:8080` 和数据库端口 `127.0.0.1:3306`，在包根目录 `.env` 用 `APP_BIND_ADDRESS`、`APP_PORT`、`MYSQL_BIND_ADDRESS`、`MYSQL_PORT` 调整。宿主机 `3306` 被占用时，可设为未占用的端口，例如 `MYSQL_PORT=3307`，再执行当前系统入口的 `--restart`（macOS：`./deploy_macos.command --restart`）。容器内 MySQL 仍使用 `3306`，外部客户端改连配置后的宿主机地址和端口；容器因端口冲突停在 `created` 时也可这样重试。详见[端口配置与占用处理](docker-allinone/DEPLOYMENT.md#端口配置与占用处理)。

Docker allinone 首次启动使用宿主机 `data/`，不存在时自动创建，并 bind mount 到容器 `/data`，保存数据库、凭据、上传资源和日志；`data/config/database.json` 权限为 600。Docker 中已有的同名数据卷不会被使用、修改或删除，仅存在数据卷不会阻止首次部署；已有同名容器仍须通过归属和挂载检查。搬迁前先用原入口 `--stop` 正常停机并确认 MySQL 正常关闭，再复制整个 `data/`、`config/` 和 `.env` 到同架构、同应用版本且 MySQL 基础版本相同的包，保留数据库凭据。仅在目标包中将 `DATAVISOOL_PROJECT_NAME` 恢复为 `datavisool-web-allinone`，不复制 `run/` 或 `.datavisool-deployment`。

当前 Docker 一键入口不提供升级或备份命令。详细参数、数据位置及停止行为见各发布包内的 `部署说明.md`；Docker allinone 的构建和数据说明也见 [README-allinone.md](README-allinone.md)。
