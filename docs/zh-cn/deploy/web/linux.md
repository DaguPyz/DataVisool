# Linux Web 部署

本文说明常规 Web 发布 ZIP 的 Linux 部署。请从发布 ZIP 解压完整文件，不要只复制 `server.jar`：包内启动脚本还会读取配置和同级的 `component-docs/`。

## 准备目录和数据库

例如将发布包解压到 `/opt/datavisool-web/`。目录中应保留：

- `server.jar`
- `component-docs/`
- `config/application.yml`
- `deploy_linux.sh` 及包内其他文件

部署机需安装 Java 17，并准备可用的 MySQL 实例。启动入口默认使用 `127.0.0.1:3306`，首次运行会交互询问数据库名、用户名和密码；启动账号需具备应用运行和数据库迁移所需权限。

首次使用空数据库时，启动器会提示设置管理员密码（至少 8 个字符、最多 72 个 UTF-8 字节），输入不回显且不会保存到配置文件。非交互启动可设置 `DATAVISOOL_ADMIN_PASSWORD`；已有数据库不会重置管理员密码。

资源根目录可不配置，默认以 Java 进程工作目录为基准。若改用专门的数据目录，在 `config/application.yml` 中配置 `datavisool.resource-path.root`，并确保服务账号有写权限。

## 启动和管理

在发布包根目录运行：

```bash
./deploy_linux.sh
```

首次启动按提示填写数据库连接信息。脚本会在后台运行 Java，并把启动日志写到 `logs/startup.log`。后续可使用：

```bash
./deploy_linux.sh --check
./deploy_linux.sh --status
./deploy_linux.sh --logs
./deploy_linux.sh --restart
./deploy_linux.sh --stop
```

`--check` 只读检查，不会提示或修改配置；缺少数据库值时会报告错误。`--status`、`--stop` 和 `--restart` 管理当前发布目录记录的进程。启动脚本不会安装 Java、注册 systemd 服务或配置开机自启。常驻运行时，可按需把发布目录入口接入你自己的 systemd 配置。

## 手动运行（可选）

若自行管理进程，可在启动前填好 `config/application.yml`，然后使用 Java Agent 启动。示例假设发布包位于 `/opt/datavisool-web/`：

```bash
cd /opt/datavisool-web
java -jar /opt/datavisool-web/server.jar \
  --spring.config.location=file:/opt/datavisool-web/config/application.yml
```

手动启动不会使用包内脚本的进程状态和日志管理。无论采用哪种方式，都要保留 `component-docs/` 与 `server.jar` 同级；更新 JAR 时也要同步本次发布包中的 `component-docs/`。

## 验证

打开 `http://服务器IP:8080/` 检查页面。应用 API 例如 `/api/show/list`；业务资源会通过 `/static/**` 提供。端口默认为 `8080`，可在配置文件的 `server.port` 修改。
