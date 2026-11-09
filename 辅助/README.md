<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# Web Agent 调试查看器

直接用浏览器打开 `agent-history-viewer.html`，导入后端启动目录下的 `logs/ai-agent-debug.log`。也可以先导入 `agent-trace-example.log` 查看效果；该文件是人工构造的演示数据。

后端使用项目规定的 JDK 17，启用 `dev` Spring profile 后，现有 Log4j2 配置会把结构化记录写入上述日志。生产环境默认不收集这类 DEBUG 数据。新记录从代码更新后的运行开始产生；旧版对象字符串日志无法还原成每轮请求。

## 使用

- 可拖入文件、选择多个轮转日志，或粘贴日志 / JSON / JSONL；先解压 `.log.gz` 再导入。
- 同一任务的不同运行合并为连续的对话。任务列表显示用户需求；重复导入按记录 ID 去重。
- **对话过程**按发生顺序编号，显示系统提示词、用户需求、追加要求、Agent 回复和工具调用。系统提示词全文默认展开，相同提示词在后续请求和恢复中不重复展示，变化时在对应位置展示新版本；摘要模型的提示词单独标明。桌面历史支持读取 `systemPreamble` 和 system 消息。工具调用参数与最终结果默认展开；浏览器回执合入对应工具的执行结果，等待期间明确显示等待，缺失结果不会被推断为成功。Agent 分析默认折叠在回复下方；只有分析和工具调用时，分析附在工具内，不另占一步。
- 初始返回、检查信息、浏览器完整回执和调用 / 运行 ID 可展开工具内的**调试详情**查看。恢复、挂起、压缩和上下文等内部记录保留在**原始记录**中，不插入对话；恢复时不会重复展示已有用户消息和回复。
- **产物处理**展示 Agent 的写入内容、返回给 Agent 的校验错误、修复补丁和最终 JSON 状态；错误下可展开 **返回给 Agent 的原始反馈**，保留字段位置、实际值、正常要求、文件路径、版本及修复说明全部原始字段。普通工具行也可展开 **原始工具回执** 和 **原始浏览器回执**。同一次写入的提交与保存合为一条。在“写入后的文件内容”下方可展开 **AI 原始输出**，查看该次写入对应的完整模型响应（日志记录），包含分析、正文和模型声明的方法调用参数；修复补丁也可查看对应响应。按运行 ID 和调用 ID 关联，缺失时明确提示，不用实际工具参数代替。对话过程使用相同的记录，隐藏重复的纯产物方法调用回复。最终文件可展开查看，缺少回执时显示“未确认”；提交后工作区修订号变化但内容 SHA-256 相同时，保留完整文件及对应校验结果。JSON 语法通过与组件配置校验失败分别判断。
- **模型请求**逐次展示主模型、摘要模型以及同步回退请求的实际消息、工具定义、请求参数和响应。
- **原始记录**用于核对；可搜索、复制或导出当前任务 JSON，导出文件可重新导入。
- 碎片、缺失片段和无法解析的记录会提示，其他有效记录仍可查看。可用 `Ctrl/Cmd+O` 导入、`/` 搜索。

## 记录格式

每条结构化日志都是固定前缀 `==================Agent轨迹=================` 加单行 JSON，版本为 `datavisool-agent-trace/v1`；查看器仍可读取旧版 `lcp-agent-trace/v1` 日志：

- `recordId`：去重依据；服务事件复用数据库事件 ID。
- `projectId / threadId / turnId / runId`：运行归属。服务事件通过会话和轮次关联，不额外查询数据库。
- `segmentId / sequence`：一次 `AiAgentRuntime.run()` 的执行片段和内部顺序。挂起后再次进入运行循环会生成新片段。
- `processId / processOrder`：同一后端进程内的顺序；`eventSequence` 保留数据库事件顺序。
- `recordedAt`：UTC 时间；显示时转换为浏览器本地时间。
- `type / payload`：步骤类型和数据。模型按 `callId` 配对，工具按 `runId + requestId` 配对，浏览器回执按 `runId + operationId` 配对。

查看器优先使用上述序号、恢复来源和调用关系排序，时间仅用于没有依赖关系的记录。日志丢失时缺失内容无法重建；需一起导入相关轮转文件。

模型请求快照记录 LangChain4j `ChatRequest` 和已解析的模型配置，不是供应商 HTTP 报文。图片及其它媒体正文省略，模型密钥不记录，结构字段中的密码、密钥和鉴权信息脱敏；自然语言正文保持原文。模型未返回分析内容时不会生成分析。

浏览器请求、回执和生命周期事件只在事务提交后记录。调试记录失败不会中止 Agent，关闭 DEBUG 时不执行消息序列化。支持桌面端 `lcp-agent-history/v1` 格式；桌面历史没有每轮请求快照时，模型请求视图会说明缺失。

## 验证

查看器解析、关联与排序测试，无需安装依赖：

```sh
node --test 辅助/agent-history-viewer.test.cjs
```

后端使用 JDK 17，在仓库根目录执行：

```sh
pnpm -F datavisool-app docs:generate
mvn -f datavisool-server/pom.xml -pl datavisool-service -am -Dexec.skip=true -Dmaven.antrun.skip=true -Dtest=AiAgentDebugTraceTest,AiAgentContextRuntimeTest,AiAgentToolSchedulingRuntimeTest,AiAgentStreamingFailureTest,AiAgentResumeTest,AiAgentFrontendBatchTest,AiAgentRuntimeAlignmentTest -Dsurefire.failIfNoSpecifiedTests=false test
```
