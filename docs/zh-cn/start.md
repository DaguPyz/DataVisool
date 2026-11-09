# Web 源码开发启动

本页面向 DataVisool Web 源码开发者。仅使用产品或部署成品时，分别查看[快速开始](/quick_start/quick_start.md)和 [Web 部署](/deploy/web.md)。

## 工程与环境

| 目录 | 内容 |
| --- | --- |
| `datavisool-app/` | React、TypeScript 与 Vite 前端应用 |
| `datavisool-server/` | Maven 后端工程，应用模块为 `datavisool-service` |
| `script/build/` | 常规 ZIP、Docker app 与 Docker allinone 发布包构建脚本 |

准备 Git、Node.js、pnpm、JDK 17、Maven 和可用的 MySQL。仅运行前端开发服务器不需要 Docker。统一构建所有发布包时，Node.js 需为 20+；Docker 包还需要 Docker Buildx。

## 安装前端依赖

在仓库根目录安装 pnpm workspace 依赖：

```bash
pnpm install
```

## 启动后端

在仓库根目录的 `datavisool-server/` 中，先安装服务依赖的 `datavisool-common`，再只对 `datavisool-service` 执行 Spring Boot 启动目标：

```bash
cd datavisool-server
mvn -pl datavisool-common -am install -DskipTests
mvn -f datavisool-service/pom.xml spring-boot:run
```

不要将 `spring-boot:run` 与 `-am` 一起用于该多模块工程；`-am` 也会选择 common 模块，而它没有应用启动类。

默认配置激活 `dev` profile，配置文件为 `datavisool-server/datavisool-service/src/main/resources/application-dev.yml`。开发前配置自己的本地或隔离测试库，并设置环境变量 `DB_PASSWORD`。全新数据库首次启动还需设置 `DATAVISOOL_ADMIN_PASSWORD`，用于创建 `admin` 账号；密码至少 8 个字符且不超过 72 个 UTF-8 字节。初始化成功后可移除此变量，已有数据库不会重置密码。默认迁移开关为启用状态，服务启动时会执行数据库检查和迁移；目标库不存在时，数据库检查可能尝试创建它。不要把本地开发连接指向含有真实数据的生产库。

## 启动前端

在仓库根目录另开终端：

```bash
pnpm -F datavisool-app dev
```

使用 Vite 终端打印的地址打开浏览器。开发服务器将 `/api/**` 和 `/static/**` 代理到 `http://127.0.0.1:8080`。如果后端运行在其他地址，启动前端时指定代理目标：

```bash
DATAVISOOL_SERVER_DEV_TARGET=http://127.0.0.1:18080 pnpm -F datavisool-app dev
```

Windows PowerShell：

```powershell
$env:DATAVISOOL_SERVER_DEV_TARGET = "http://127.0.0.1:18080"
pnpm -F datavisool-app dev
```

Vite 只提供开发页面和接口代理。登录、项目保存、资源读写等功能还需要已启动的后端和数据库。

## 构建与检查

从仓库根目录构建前端：

```bash
pnpm -F datavisool-app build
```

此命令先生成 AI 组件规格文档，再运行 TypeScript 检查和 Vite production build。Web 生产包由 `datavisool-service` 同时托管前端、接口和业务资源。构建常规 ZIP 可运行：

```bash
node script/build/native/deploy.js
```

统一构建常规 ZIP 与两种架构的 Docker 发布包可运行：

```bash
node script/build/build-all.mjs
```

统一构建需要 Node.js 20+、JDK 17、Maven、pnpm 和支持 amd64/arm64 的 Docker Buildx。发布命令会在本地构建和打包，不会自动上传到服务器。构建参数和发布包内容见仓库中的 `script/build/README.md`。
