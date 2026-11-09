<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# 常规部署（不使用 Docker）

正常启动或 `--restart` 时，若 `JAVA_HOME` 无效、找不到 Java，或版本不是 17，脚本会交互询问 JDK 安装根目录。Linux/macOS 输入包含 `bin/java` 的目录，Windows 输入包含 `bin/java.exe` 的目录；macOS 可输入 JDK 包内的 `Contents/Home`。验证 Java 17 后继续，无效路径或版本可重新输入，空输入或取消则终止。路径只用于本次运行，不会保存或修改系统环境变量；无终端或 `--check` 时只报错、不询问。

`deploy.js` 在本机执行常规构建（JDK 17、Maven、pnpm），生成 `server.jar` 和 `datavisool-server/datavisool-service/target/component-docs`，再生成 ZIP 发布包。统一构建入口会先完成这一次常规构建，再让 Docker app 和 Docker allinone 共用相同产物，避免重复编译。

在仓库根目录执行：

```bash
# 查看参数
node script/build/native/deploy.js --help

# 预览本地构建和打包命令
node script/build/native/deploy.js --dry-run

# 构建 ZIP 发布包
node script/build/native/deploy.js
```

每个常规部署产物单独生成一个 ZIP：`script/build/release/datavisool-web-v<版本号>-release.zip`，包内包含应用 `server.jar`、同次构建的 `component-docs/`、对应部署说明、`config/application.yml` 和四个平台入口脚本。组件文档只打包 `current.json` 指向的内置版本及其索引引用的文件；缺失或内容校验失败时停止打包。默认读取本地 JAR 同目录的 `component-docs`，使用 `--local-jar` 复用其他位置的 JAR 时，也可用 `--component-docs DIR` 显式指定同次构建的文档。部署机需预先安装 Java 17，并准备可用的 MySQL 数据库；部署机不需要 Node.js。

打包使用每次独立的临时目录，清理时只移除本次创建的目录；不会删除输出目录下已有的同名文件夹。ZIP 完整生成后才发布到最终路径，归档失败不会留下占用正式文件名的半成品；已存在的最终 ZIP（包括并发构建刚生成的文件）不会被覆盖。

单独运行 Docker 构建脚本时，必须先准备好同一次常规构建生成的 JAR 与 `datavisool-server/datavisool-service/target/component-docs`；Docker 脚本默认读取这两处，不会自动编译，缺少时直接报错。可用 `--jar PATH` 和 `--component-docs DIR` 指定产物路径。Docker 镜像使用专用 JAR 副本，其中不含内置 `application*.yml`；常规 ZIP 仍使用常规部署 JAR。

解压后启动：Windows 双击 `deploy_windows.cmd`；macOS 双击 `deploy_macos.command`，若系统拦截则在终端运行 `sh deploy_linux.sh`；Linux 运行 `sh deploy_linux.sh`。模板默认连接本机 MySQL（`127.0.0.1:3306`），数据库名、用户名和密码均留空；首次启动会依次询问这三项，密码输入不回显。已有有效值会保留，只询问缺失项；数据库名写入 JDBC URL 时会保留主机、端口和查询参数。数据库名称限 1–64 位字母、数字、下划线或短横线。若 URL 行缺失、格式无效或主机无效（包括旧占位地址 `mysql-host`），请恢复模板或手动修正；脚本不会猜测地址。写入前生成 `config/application.yml.bak.<时间戳>.<唯一后缀>`，已有备份会保留。之后 Java 会在后台运行，关闭启动窗口不会停止应用。

应用启动时会在数据库初始化前检查实际解析后的 HTTP 监听端口和地址；如果无法绑定，会提示端口可能被占用或地址不可用。`server.port=0` 使用系统分配的端口，跳过固定端口检查。检查不会预留端口；`--check` 不启动应用，也不会检查端口。

入口支持无参数启动、`--help/-h`、`--check`、`--status`、`--stop` 和 `--restart`。无参数启动会检查 Java 17、交互补齐缺失配置并启动；`--check` 只读检查，缺项时报错提示，不询问或修改文件；`--status` 查看、`--stop` 停止由当前发布目录记录的实例，这两个操作不要求 Java 或数据库配置通过检查。`--restart` 会先停止该目录记录的实例，成功后再按正常启动流程运行；未运行时直接启动；停止失败或 Linux/macOS 等待超过 15 秒时不会启动第二个实例。例如 Linux/macOS 执行 `sh deploy_linux.sh --restart`，Windows 执行 `deploy_windows.cmd --restart`。同一目录重复启动不会创建第二个实例。PID 保存在 `run/application.pid`；Linux/macOS 的实例信息保存在 `run/application.start`，Windows 的实例信息保存在 `run/application.json`。Linux/macOS 启动日志位于 `logs/startup.log`，Windows 的标准输出和错误日志分别位于 `logs/startup.stdout.log`、`logs/startup.stderr.log`。Linux/macOS 停止时发送 TERM 并最多等待 15 秒，不会强制结束；Windows 直接终止 Java 进程，不保证 Java 关闭钩子执行，执行前应确认没有重要请求或数据写入。首次使用空数据库时，启动器会提示输入管理员密码，输入不会回显或写入配置。启动时等待应用及本机 HTTP 接口就绪，最长 120 秒；超时后仍可使用 --status 和 --stop 管理进程。Linux/macOS 需要 curl。脚本不会安装 Java、注册系统服务或配置开机自启。版本来自 `package.json`，默认 JAR 来源仍是 `datavisool-server/datavisool-service/target/server.jar`。

脚本会立即显示当前操作，并在检查运行条件、启动后台进程、发送停止请求和等待退出时给出阶段提示；`--restart` 会依次显示停止和重新启动的进度。应用和本机 HTTP 接口就绪后才显示访问地址。

模板中的 `datavisool.license`、`datavisool.ai.storage-path` 和 `datavisool.resource-path` 都已注释，默认无需配置。常规部署默认以 Java 进程工作目录为路径基准；两类 AI workspace 默认使用的子目录不同，详见[部署说明](../../../datavisool-doc/部署说明.md)。

自定义本地相对路径按执行命令时的工作目录解析。将完整 ZIP 交付至部署机后，按部署说明解压和启动。

服务器运行环境、配置以及状态、停止和重启命令见[部署说明](../../../datavisool-doc/部署说明.md)。
