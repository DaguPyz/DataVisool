# 前端自动化测试

前端使用 Playwright 驱动浏览器，测试文件放在 `tests/e2e/`。首次运行前，在项目根目录安装依赖和 Chromium：

```sh
pnpm install
pnpm -F datavisool-app exec playwright install chromium
```

在项目根目录运行 `pnpm test`；浏览器默认在后台无界面运行，测试会自动启动前端开发服务器，并在完成后关闭。使用 `pnpm -F datavisool-app test:ui` 可以打开 Playwright 的交互界面。默认用 Playwright 安装的 Chromium；如果已安装 Google Chrome，也可以使用 `PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm test`。

登录页的输入、服务条款和布局测试不依赖后端或账号。涉及登录和数据操作的测试需要准备独立测试环境。

`tests/e2e/login-backend.spec.ts` 需要独立测试后端，并通过 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME` 和 `DATAVISOOL_E2E_PASSWORD` 环境变量提供地址和账号；缺少任一变量时自动跳过。避免使用生产环境或将凭据写入代码。真实后端测试关闭 Playwright 追踪、截图和录像。测试覆盖退出后令牌失效、同一账号的其他登录不受影响，以及模拟退出请求失败时的页面处理。

`tests/component/` 和 `tests/setup/` 是原 Vitest 测试，保留供迁移参考；它们不会被 Playwright 执行，不能视为已通过。后端和构建脚本测试不受此变更影响。

`verify:shared` 目前只运行浏览器最小用例和前端构建，不再运行原共享组件测试；完整覆盖需后续迁移。

控制台用例位于 `tests/e2e/console-dashboard.spec.ts`，可用 `pnpm -F datavisool-app exec playwright test tests/e2e/console-dashboard.spec.ts` 单独运行。测试拦截接口并使用虚构数据，不读写真实项目；它验证前端表现及请求，不代替真实后端联调。布局用例会保存浏览器截图到 `test-results/`。

`tests/e2e/console-backend.spec.ts` 使用真实后端创建并逻辑删除一个测试项目，要求独立且初始无项目的测试数据库；除登录测试的三个环境变量外，还需设置 `DATAVISOOL_E2E_ALLOW_WRITES=isolated`，未设置时跳过。请勿指向现有业务数据库。

`tests/e2e/console-resources-backend.spec.ts` 还会上传 `测试资源/` 中的文件、创建资源和发布记录，并临时写入数据库全零时间；只允许使用本机、全新且名称以 `datavisool_console_test_` 开头的独立测试库。除上述登录与隔离开关外，还需配置 `DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_PASSWORD` 和 `DATAVISOOL_TEST_SERVER_LOG`（临时后端日志路径），可选配置 `DATAVISOOL_TEST_MYSQL_BINARY`。测试会核对异常时间的警告日志；用例不自动删除资源，测试完成后需清理整个隔离测试环境。

`tests/e2e/project-management-backend.spec.ts` 测试项目列表的显示、创建、搜索、分页、重命名、复制、删除和各操作入口，并直接核对数据库。需要本机独立后端、上述登录环境变量和隔离写入开关，以及名称以 `datavisool_project_test_` 开头的独立 MySQL 测试库（通过 `DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_PASSWORD` 提供，可选 `DATAVISOOL_TEST_MYSQL_BINARY`）。测试会创建、修改和删除项目，结束后需清理整个隔离环境；创建和重命名失败场景使用模拟响应，创建重试使用真实后端。测试结果见项目管理测试报告。

数据库管理页的两份用例可用 `pnpm exec playwright test database-management- --workers=1` 运行。请在 `datavisool-app` 下执行。需要本机隔离后端、上述登录变量、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`和 `DATAVISOOL_TEST_MYSQL_PASSWORD`。`DATAVISOOL_TEST_MYSQL_DATABASE` 必须是以 `datavisool_datasource_test_` 开头的独立元库名。元库客户端可用 `DATAVISOOL_TEST_MYSQL_BINARY`、`DATAVISOOL_TEST_MYSQL_USER` 指定，默认用本机 `mysql` 和 `root`。

`database-management-connections.spec.ts` 还读取 `DATAVISOOL_TEST_TARGETS` 指向的本地 JSON 数组。每项提供 `label`、页面类型 `type`、本机地址 `host`、`port`、`database`、`user`、`password`、JDBC 地址 `url`，以及只读查询 `probeSql` 和首行首列的预期值 `probeValue`。MySQL 8.0 可附 `probeCall` 验证只读存储过程；Oracle 可附使用同一测试密码的有效 `longUser` 验证长用户名。连接用例直查元库的端口由 `DATAVISOOL_TEST_MYSQL_CLI_PORT` 指定，默认 3306。将带凭据的配置放在仓库外，限当前用户读取。两份用例会写入隔离环境，测试后清理此次创建的数据库与临时凭据。

控制台另有固定时间、模拟数据的 1440 像素 Chromium 截图对比，基线保存在 `tests/e2e/console-dashboard.spec.ts-snapshots/`。本次基线在 macOS 生成，跨系统运行需建立并核验对应平台的基线。

页面测试报告保存在项目根目录的 `测试报告/<页面名称>/`，内容与格式遵循 [测试报告内容规则](../../测试报告/测试报告内容规则.md)。需要保留的截图放在对应页面目录。报告根据实际测试结果整理，不由测试命令自动生成。

字体管理的模拟接口和布局用例位于 `tests/e2e/font-management.spec.ts`；真实后端用例位于 `tests/e2e/font-management-backend.spec.ts`。在 `datavisool-app` 下运行 `pnpm exec playwright test font-management --workers=1`。真实后端用例要求本机独立后端、全新且名称以 `datavisool_font_test_` 开头的 MySQL 测试库、专用的 `datavisool-font-e2e-` 前缀 Docker 容器和独立资源目录，设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`、`DATAVISOOL_TEST_MYSQL_PASSWORD`。用例上传并删除字体，且不清理全部测试数据或文件；执行后应清理整个隔离环境。模拟接口用例覆盖上传失败等情况，不代替真实后端验证。页面截图和结果见字体管理测试报告。

动态脚本管理页面用例位于 `tests/e2e/dynamic-script-management-backend.spec.ts`，可用 `pnpm -F datavisool-app exec playwright test tests/e2e/dynamic-script-management-backend.spec.ts --workers=1` 运行。必须使用本机独立后端、全新且以 `datavisool_script_test_` 开头的数据库、以 `datavisool-script-e2e-` 开头的专用 MySQL Docker 容器和独立资源目录，并设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`、`DATAVISOOL_TEST_MYSQL_PASSWORD`。每个用例会删除该隔离库中用户 ID 为 1 的全部动态脚本记录，创建文件也不会自动全部清理；结束后必须清理整个隔离环境。部分异常响应使用模拟，其余连接真实后端。页面结果见动态脚本管理测试报告。

视频管理页面用例位于 `tests/e2e/video-management-backend.spec.ts`，可用 `pnpm -F datavisool-app exec playwright test tests/e2e/video-management-backend.spec.ts --workers=1` 运行。必须使用本机独立后端、全新且以 `datavisool_video_test_` 开头的数据库、以 `datavisool-video-e2e-` 开头的专用 MySQL Docker 容器和独立视频资源目录，并设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`、`DATAVISOOL_TEST_MYSQL_PASSWORD`。每个用例会删除该隔离库中用户 ID 为 1 的全部视频记录；用例生成的视频文件不会自动全部清理，结束后必须清理整个隔离环境。部分异常响应使用模拟，其余连接真实后端。页面结果见视频管理测试报告。

3D 模型管理页面用例位于 `tests/e2e/model-management-backend.spec.ts`，可用 `pnpm -F datavisool-app exec playwright test tests/e2e/model-management-backend.spec.ts --workers=1` 运行。必须使用本机独立后端、全新且以 `datavisool_model_test_` 开头的数据库、以 `datavisool-model-e2e-` 开头的专用 MySQL Docker 容器和独立模型资源目录，并设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`、`DATAVISOOL_TEST_MYSQL_PASSWORD`。每个用例会删除该隔离库中用户 ID 为 1 的全部模型记录；上传和解压生成的文件不会自动全部清理，结束后必须清理整个隔离环境。部分异常响应使用模拟，其余连接真实后端。页面结果见 3D 模型管理测试报告。

服务器组件管理页面用例位于 `tests/e2e/remote-component-management-backend.spec.ts`，可用 `pnpm -F datavisool-app exec playwright test tests/e2e/remote-component-management-backend.spec.ts --workers=1` 运行。必须使用本机独立后端、全新且以 `datavisool_remote_test_` 开头的数据库、以 `datavisool-remote-e2e-` 开头的专用 MySQL Docker 容器和独立组件资源目录，并设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`、`DATAVISOOL_TEST_MYSQL_PASSWORD`。每个用例会删除隔离库中用户 ID 为 1 的全部服务器组件及文档索引记录；测试文件不会自动全部清理，结束后须清理整个隔离环境。部分异常响应用模拟，其余连接真实后端。页面结果见服务器组件管理测试报告。

AI 模型管理页面用例位于 `tests/e2e/ai-model-management-backend.spec.ts`，可用 `pnpm -F datavisool-app exec playwright test tests/e2e/ai-model-management-backend.spec.ts --workers=1` 运行。必须使用本机独立后端、名称以 `datavisool_aimodel_test_` 开头的全新隔离数据库、以 `datavisool-aimodel-e2e-` 开头的专用 MySQL Docker 容器和独立资源目录，并设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`、`DATAVISOOL_TEST_MYSQL_PASSWORD`。每个用例会删除隔离库中用户 ID 为 1 的全部 AI 模型配置；测试只使用虚构 API Key，不调用外部 AI 服务。部分错误响应使用模拟，其余连接真实后端。结束后须清理整个隔离环境，页面结果见 AI 模型管理测试报告。

用户管理页面的真实后端测试位于 `tests/e2e/user-management-backend.spec.ts`，可运行 `pnpm -F datavisool-app exec playwright test tests/e2e/user-management-backend.spec.ts --workers=1`。必须使用本机独立后端、名称以 `datavisool_user_test_` 开头的全新隔离 MySQL 数据库、以 `datavisool-user-e2e-` 开头的专用容器和独立资源目录，设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`、`DATAVISOOL_TEST_MYSQL_PASSWORD`。每个用例会删除隔离库中除用户 ID 为 1 之外的全部用户、认证和用户角色数据；不得连接现有业务库，结束后须清理整个隔离环境。部分失败响应使用模拟，其余操作连接真实后端。页面截图和结果见用户管理测试报告。

设置页面用例位于 `tests/e2e/setting-backend.spec.ts`，可运行 `pnpm -F datavisool-app exec playwright test tests/e2e/setting-backend.spec.ts --workers=1`。必须使用本机独立后端、名称以 `datavisool_setting_test_` 开头的全新隔离 MySQL 数据库、以 `datavisool-setting-e2e-` 开头的专用容器及以 `/private/tmp/datavisool-setting-e2e-` 开头的独立资源目录，并设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME=admin`、`DATAVISOOL_E2E_PASSWORD=UserE2e123!`（仅供隔离环境）、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`、`DATAVISOOL_TEST_MYSQL_PASSWORD` 和 `DATAVISOOL_TEST_RESOURCE_ROOT`。每个用例会重置隔离库中管理员资料和密码、删除其他用户及更新跳过记录，并删除独立目录下的品牌图片；不得连接现有业务库或资源目录。部分失败响应使用模拟，其余操作连接真实后端；完成后须清理整个隔离环境。页面截图和结果见设置测试报告。

帮助页面真实后端用例位于 `tests/e2e/help-backend.spec.ts`。在项目根目录运行 `pnpm -F datavisool-app exec playwright test tests/e2e/help-backend.spec.ts --workers=1`，需设置本机隔离后端 `DATAVISOOL_SERVER_DEV_TARGET`、管理员账号 `DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`，以及以 `datavisool_help_test_` 开头的独立 MySQL 数据库名 `DATAVISOOL_TEST_MYSQL_DATABASE` 和以 `datavisool-help-e2e-` 开头的专用容器名 `DATAVISOOL_TEST_MYSQL_CONTAINER`。普通用户用例会通过真实后端创建测试账号，不自动删除；禁止连接业务数据库，结束后须清理整个隔离环境。视频目标由浏览器拦截为本地测试响应，不访问第三方网站。默认测试覆盖内置文档入口；外部文档入口可另设 `DATAVISOOL_HELP_GUIDE_MODE=external` 和 `VITE_USER_GUIDE_URL=https://guide.example.test/help/?source=e2e`，再使用 `--grep '外部文档配置'` 单独运行，目标同样被拦截。页面截图和结果见帮助测试报告。

编辑器组件库的真实后端用例位于 `tests/e2e/component-library-backend.spec.ts`，在 `datavisool-app` 下运行 `pnpm exec playwright test tests/e2e/component-library-backend.spec.ts --workers=1`。必须使用本机独立后端、名称以 `datavisool_component_test_` 开头的全新 MySQL 测试库、以 `datavisool-component-e2e-` 开头的专用容器和独立资源目录，并设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`、`DATAVISOOL_TEST_MYSQL_PASSWORD`。用例强制使用无界面 Chromium，会创建测试项目、上传测试服务器组件，并在每个用例开始时删除隔离库中本套用例指定名称的服务器组件记录。外部网络请求会被阻断，结束后须清理整个隔离环境。页面截图和结果见编辑器组件库测试报告。

编辑器左侧资源库、图层、模板库、全局变量、子项目和 AI 驱动的 Playwright 用例分别位于 `tests/e2e/editor-*-backend.spec.ts`，公共环境代码位于 `tests/e2e/editor-dock/support.ts`；`editor-dock-inventory.spec.ts` 和 `editor-dock-i18n.spec.ts` 分别检查六个入口的显示和英文静态文案。在 `datavisool-app` 目录运行：

```sh
pnpm exec playwright test 'tests/e2e/editor-(dock-inventory|dock-i18n|resource-library-backend|layers-backend|templates-backend|variables-backend|subprojects-backend|ai-driven-backend|ai-canvas-backend).spec.ts' --workers=1
```

必须使用本机独立后端、名称以 `datavisool_dock_test_` 开头的独立 MySQL 库、以 `datavisool-dock-e2e-` 开头的专用 Docker 容器和独立资源目录；设置 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`、`DATAVISOOL_TEST_MYSQL_DATABASE`、`DATAVISOOL_TEST_MYSQL_CONTAINER`。数据库数据源和超过 100 条视频的用例还需要 `DATAVISOOL_TEST_MYSQL_PASSWORD`；数据库数据源用例还需 `DATAVISOOL_TEST_MYSQL_PORT` 指向该隔离 MySQL 对外端口，缺少时这些用例会跳过。用例会创建项目、图片、视频、模板、数据源、变量、子项目和临时模型配置，并修改 AI 运行设置；视频数量用例会在隔离库中复制并删除其专用测试记录。部分失败响应和模型、API、WebSocket、MQTT 服务由测试本地模拟，其余连接真实后端。浏览器强制后台运行；测试结束后须清理整个隔离环境。已发现的问题及截图见各编辑器页面测试报告，存在失败用例时命令会返回非零状态。

编辑器底部辅助工具、缩放与项目状态的用例位于 `tests/e2e/editor-footer-backend.spec.ts`。在 `datavisool-app` 下运行 `pnpm exec playwright test tests/e2e/editor-footer-backend.spec.ts --workers=1`；测试强制使用无头 Chromium。需要设置本机独立后端 `DATAVISOOL_SERVER_DEV_TARGET`、`DATAVISOOL_E2E_USERNAME`、`DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`，以及以 `datavisool_dock_test_` 开头的独立 MySQL 测试库名 `DATAVISOOL_TEST_MYSQL_DATABASE` 和以 `datavisool-dock-e2e-` 开头的专用容器名 `DATAVISOOL_TEST_MYSQL_CONTAINER`。用例会创建并保存测试项目、子项目和组件；仅在隔离环境运行并在结束后清理环境。页面截图及结果见编辑器底部工具栏测试报告。

编辑器顶部工具栏真实后端用例位于 `tests/e2e/editor-toolbar-backend.spec.ts`，在 `datavisool-app` 下运行 `pnpm exec playwright test tests/e2e/editor-toolbar-backend.spec.ts --workers=1`。必须使用本机独立后端 `DATAVISOOL_SERVER_DEV_TARGET`、隔离账号 `DATAVISOOL_E2E_USERNAME` 和 `DATAVISOOL_E2E_PASSWORD`、`DATAVISOOL_E2E_ALLOW_WRITES=isolated`，以及以 `datavisool_dock_test_` 开头的独立 MySQL 测试库 `DATAVISOOL_TEST_MYSQL_DATABASE` 和以 `datavisool-dock-e2e-` 开头的专用容器 `DATAVISOOL_TEST_MYSQL_CONTAINER`。测试强制无头运行，会创建项目、组件、蓝图页面及主题，并修改隔离账号的快捷键后恢复；部分保存失败场景使用模拟响应。也可为顶部工具栏用例使用独立本机 MySQL：设置 `DATAVISOOL_TEST_MYSQL_LOCAL=isolated`、`DATAVISOOL_TEST_MYSQL_PORT`、以 `datavisool_dock_test_toolbar_` 开头的库名，以及以 `/private/tmp/datavisool-toolbar-local-` 开头的专用目录 `DATAVISOOL_TEST_RESOURCE_ROOT`，后端必须连接该实例。不得连接业务数据，测试结束后需清理隔离环境。测试结果和截图见编辑器顶部工具栏测试报告。
