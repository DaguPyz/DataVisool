# 项目包测试夹具

`desktop-writer-v2.zip` 和 `desktop-writer-v3.zip` 使用 Desktop 源码提交 `1666c1f` 中的 `datavisool-archive` 打包代码和 `datavisool-project-format` 结构生成。内容均为自建数据：一个图片占位文件、一个不执行的组件脚本和一个或两个项目数据文件。图片占位内容不是真实图片，仅用于检查文件及路径映射。

这些夹具用于 Web 导入回归测试，不包含用户提供的测试包，也不证明 Desktop 应用完整导出或组件运行已经验证。

`desktop-dvz1.txt` 由 Desktop 的 TypeScript 项目数据压缩工具生成，内容是自建 JSON `{"name":"synthetic","values":["alpha","beta"]}`，用于检查 Web 后端能否读取 Desktop 的 `DVZ1:gzip:` 编码。
