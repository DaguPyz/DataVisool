<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# DATAVISOOL WEB SERVER

DataVisool 的单服务后端工程。当前交付形态已经收敛为 `datavisool-service` 单服务：前端构建产物、`/api/**` 接口和 `/static/**` 业务资源都由同一个 Spring Boot 服务提供，不再需要独立前端 Nginx。

- Java 17
- Spring Boot 3.2.5
- MyBatis Plus 3.5.5

## 部署说明

推荐直接查看 [部署说明](../datavisool-doc/部署说明.md)。

直接使用 `prod` 配置启动时，需设置 `DB_URL`（完整 MySQL JDBC 地址）、`DB_USER` 和 `DB_PASSWORD` 环境变量。常规发布包使用其外部配置文件，配置方式见部署说明。

源码开发使用 `dev` 配置时，需设置 `DB_PASSWORD` 环境变量。全新数据库首次初始化前还需设置 `DATAVISOOL_ADMIN_PASSWORD`，用于创建 `admin` 管理员账号；密码至少 8 个字符且不超过 72 个 UTF-8 字节。已有数据库不会重置管理员密码，初始化成功后可移除该环境变量。

## 跨平台发布脚本

常规部署包正常启动或执行 `--restart` 时，若 `JAVA_HOME` 无效、找不到 Java 或版本不是 17，会交互询问 JDK 安装根目录；输入路径只用于本次运行，不保存或修改系统环境变量。无终端或执行 `--check` 时只报错，不询问。

`script/build/native/deploy.js` 按当前单服务链路实现了跨平台发布，可在 Windows 和 macOS 上通过 Node.js 执行：

```bash
node script/build/native/deploy.js --dry-run
node script/build/native/deploy.js
```

默认会执行 `mvn -pl datavisool-service -am clean package -DskipTests`，然后在本机生成 ZIP：`script/build/release/datavisool-web-v<版本号>-release.zip`。包内包含 `server.jar`、`component-docs/`、`部署说明.md`、`config/application.yml` 和四个平台入口脚本。解压后运行对应平台入口：数据库连接模板默认使用本机 `127.0.0.1:3306`，首次运行会依次询问留空的数据库名、用户名和密码，密码输入不回显；已有有效值会保留，只询问缺失项。数据库名写入 JDBC URL 时保留主机、端口和查询参数。远程 MySQL 需先在配置文件中修改主机和端口；URL 格式或主机无效时，需恢复模板或手动修正。修改前会备份原配置。应用随后在后台运行，可查看状态、停止或通过 `--restart` 重启。部署机需要 Java 17 和可用的 MySQL，不需要 Node.js。构建工具在仓库侧使用 Node.js。首次部署及配置细节见[部署说明](../datavisool-doc/部署说明.md)。详细参数可执行 `node script/build/native/deploy.js --help` 查看。

## 资源目录

外部 `application.yml` 中可以按需覆盖资源根目录；未配置时默认使用 Java 进程工作目录。示例：

```yaml
datavisool:
  resource-path:
    root: /usr/app/resource
```

服务会在该根目录下继续使用 `/static/images`、`/static/covers`、`/static/avatar`、`/static/components` 等子路径映射运行时资源。
