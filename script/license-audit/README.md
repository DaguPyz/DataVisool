<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# 第三方许可清单

运行 `JAVA_HOME=<JDK 17 路径> python3 script/license-audit/generate-notices.py`，从已安装的 pnpm 生产依赖、离线 Maven 运行依赖 收集许可元数据与随包文本，生成 `third-party/dependency-inventory.json` 和 `THIRD_PARTY_NOTICES.txt`。

`third-party/pinned-sources.json` 记录 npm 注册表标注的源码提交及从对应提交取得的上游许可证；脚本会验证文件哈希。未被关联的本地文本和需要核对的条目不会被自动判定为已授权。

依赖、锁文件或发布产物变更时必须重新生成并人工核对。清单不自动覆盖 Docker 基础镜像、系统包、所有预打包代码、商标及用户自定义的 JAR；`third-party/授权核对记录.md` 中的待核事项解决前，汇总文件不能视为完整的分发授权结论。
