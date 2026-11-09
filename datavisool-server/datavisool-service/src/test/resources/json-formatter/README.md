# JSON 格式化测试用例集

A 保存待格式化的原始文本，B 保存人工制定的预期结果。同一编号是一对用例，例如 `A/01.json` 对应 `B/01.json`。共有 96 对，编号为 `01`–`96`。

打开 [comparison.html](comparison.html) 可在同一页面并排查看全部 A/B 原文，支持编号跳转、场景搜索、类型筛选、自动折行与内容展开。页面内嵌当前 96 组文件的完整文本，可离线打开；修改样本文件后需更新页面快照。

默认使用两空格缩进和 LF 结构换行；字符串及注释内部原文保持不变。B 通常没有末尾换行；行注释中已有的换行会保留。错误输入和空输入也使用 `.json` 扩展名，其预期结果保留原有语法错误。

`cases.json` 记录每个编号的场景及是否能被严格 Jackson 解析。`JsonFormatterFixtureTest` 逐字符比较 A 的实际格式化结果与 B，同时检查编号连续且一一对应、非空白字符保留、数据等价、错误仍存在及重复格式化稳定。测试只读取 B，预期文件不会被测试覆盖。

文件用例之外，还覆盖 0–8 空格缩进、非法缩进参数、并发调用、代表性输入逐字符截断，以及原有的 null 输入测试。

运行方式（在项目根目录）：

```sh
cd datavisool-server
mvn -q -pl datavisool-service -am -Dtest=JsonFormatterTest,JsonFormatterFixtureTest -Dsurefire.failIfNoSpecifiedTests=false -Dexec.skip=true -Dmaven.antrun.skip=true test
```

| 编号 | 场景 | 严格解析 | 原始文本 | 预期结果 |
|---|---|---|---|---|
| 01 | 基础对象 | 通过 | [A/01.json](A/01.json) | [B/01.json](B/01.json) |
| 02 | 根数组 | 通过 | [A/02.json](A/02.json) | [B/02.json](B/02.json) |
| 03 | 对象嵌套对象 | 通过 | [A/03.json](A/03.json) | [B/03.json](B/03.json) |
| 04 | 数组嵌套数组 | 通过 | [A/04.json](A/04.json) | [B/04.json](B/04.json) |
| 05 | 根字符串标量 | 通过 | [A/05.json](A/05.json) | [B/05.json](B/05.json) |
| 06 | 根整数标量 | 通过 | [A/06.json](A/06.json) | [B/06.json](B/06.json) |
| 07 | 根空值标量 | 通过 | [A/07.json](A/07.json) | [B/07.json](B/07.json) |
| 08 | 根空对象 | 通过 | [A/08.json](A/08.json) | [B/08.json](B/08.json) |
| 09 | 根空数组 | 通过 | [A/09.json](A/09.json) | [B/09.json](B/09.json) |
| 10 | 属性中的空容器 | 通过 | [A/10.json](A/10.json) | [B/10.json](B/10.json) |
| 11 | 混合换行和空白 | 通过 | [A/11.json](A/11.json) | [B/11.json](B/11.json) |
| 12 | CRLF和制表符空白 | 通过 | [A/12.json](A/12.json) | [B/12.json](B/12.json) |
| 13 | 字符串中的结构符号与转义 | 通过 | [A/13.json](A/13.json) | [B/13.json](B/13.json) |
| 14 | 数字词法原样保留 | 通过 | [A/14.json](A/14.json) | [B/14.json](B/14.json) |
| 15 | 重复键保留原顺序 | 通过 | [A/15.json](A/15.json) | [B/15.json](B/15.json) |
| 16 | 字段顺序原样保留 | 通过 | [A/16.json](A/16.json) | [B/16.json](B/16.json) |
| 17 | 对象数组混合嵌套 | 通过 | [A/17.json](A/17.json) | [B/17.json](B/17.json) |
| 18 | 对象数组和嵌套空值 | 通过 | [A/18.json](A/18.json) | [B/18.json](B/18.json) |
| 19 | 根负小数标量 | 通过 | [A/19.json](A/19.json) | [B/19.json](B/19.json) |
| 20 | 根指数数字标量 | 通过 | [A/20.json](A/20.json) | [B/20.json](B/20.json) |
| 21 | Unicode键和值 | 通过 | [A/21.json](A/21.json) | [B/21.json](B/21.json) |
| 22 | 转义控制字符和Unicode转义 | 通过 | [A/22.json](A/22.json) | [B/22.json](B/22.json) |
| 23 | 重复键中的嵌套值 | 通过 | [A/23.json](A/23.json) | [B/23.json](B/23.json) |
| 24 | 保留原始字段顺序与数字形式 | 通过 | [A/24.json](A/24.json) | [B/24.json](B/24.json) |
| 25 | 普通字符串中的引号和反斜杠 | 通过 | [A/25.json](A/25.json) | [B/25.json](B/25.json) |
| 26 | 字符串中的逗号括号和冒号 | 通过 | [A/26.json](A/26.json) | [B/26.json](B/26.json) |
| 27 | 奇数个反斜杠后跟转义引号 | 通过 | [A/27.json](A/27.json) | [B/27.json](B/27.json) |
| 28 | 偶数个反斜杠后字符串正常结束 | 通过 | [A/28.json](A/28.json) | [B/28.json](B/28.json) |
| 29 | Unicode字面字符混合语言 | 通过 | [A/29.json](A/29.json) | [B/29.json](B/29.json) |
| 30 | Unicode转义序列原样保留 | 通过 | [A/30.json](A/30.json) | [B/30.json](B/30.json) |
| 31 | Unicode代理对转义表情符号 | 通过 | [A/31.json](A/31.json) | [B/31.json](B/31.json) |
| 32 | 字面emoji和变体选择符 | 通过 | [A/32.json](A/32.json) | [B/32.json](B/32.json) |
| 33 | 包含转义引号和反斜杠的键名 | 通过 | [A/33.json](A/33.json) | [B/33.json](B/33.json) |
| 34 | 键名中的Unicode转义和引号转义 | 通过 | [A/34.json](A/34.json) | [B/34.json](B/34.json) |
| 35 | 字符串中的URL注释标记和结构符号 | 通过 | [A/35.json](A/35.json) | [B/35.json](B/35.json) |
| 36 | 字符串中的块注释样式文本 | 通过 | [A/36.json](A/36.json) | [B/36.json](B/36.json) |
| 37 | 单引号字符串及内部结构字符 | 不通过 | [A/37.json](A/37.json) | [B/37.json](B/37.json) |
| 38 | 未闭合字符串中的括号和字段样式文本 | 不通过 | [A/38.json](A/38.json) | [B/38.json](B/38.json) |
| 39 | 字符串中的非法反斜杠转义 | 不通过 | [A/39.json](A/39.json) | [B/39.json](B/39.json) |
| 40 | 字符串中包含原始换行控制字符 | 不通过 | [A/40.json](A/40.json) | [B/40.json](B/40.json) |
| 41 | 字符串中包含原始制表符控制字符 | 不通过 | [A/41.json](A/41.json) | [B/41.json](B/41.json) |
| 42 | Unicode转义包含非十六进制字符 | 不通过 | [A/42.json](A/42.json) | [B/42.json](B/42.json) |
| 43 | 字符串中包含原始U+0001控制字符 | 不通过 | [A/43.json](A/43.json) | [B/43.json](B/43.json) |
| 44 | 合法转义控制字符序列 | 通过 | [A/44.json](A/44.json) | [B/44.json](B/44.json) |
| 45 | 转义引号导致字符串未闭合 | 不通过 | [A/45.json](A/45.json) | [B/45.json](B/45.json) |
| 46 | 字符串外块注释中的逗号和括号 | 不通过 | [A/46.json](A/46.json) | [B/46.json](B/46.json) |
| 47 | 字符串外行注释和CRLF原文 | 不通过 | [A/47.json](A/47.json) | [B/47.json](B/47.json) |
| 48 | 根值后的第二个JSON值 | 不通过 | [A/48.json](A/48.json) | [B/48.json](B/48.json) |
| 49 | 对象成员之间缺少逗号 | 不通过 | [A/49.json](A/49.json) | [B/49.json](B/49.json) |
| 50 | 数组中出现重复逗号 | 不通过 | [A/50.json](A/50.json) | [B/50.json](B/50.json) |
| 51 | 对象成员缺少冒号 | 不通过 | [A/51.json](A/51.json) | [B/51.json](B/51.json) |
| 52 | 对象成员包含重复冒号 | 不通过 | [A/52.json](A/52.json) | [B/52.json](B/52.json) |
| 53 | 对象成员缺少值 | 不通过 | [A/53.json](A/53.json) | [B/53.json](B/53.json) |
| 54 | 对象成员缺少键 | 不通过 | [A/54.json](A/54.json) | [B/54.json](B/54.json) |
| 55 | 对象缺少结束大括号 | 不通过 | [A/55.json](A/55.json) | [B/55.json](B/55.json) |
| 56 | 对象使用错误的结束括号 | 不通过 | [A/56.json](A/56.json) | [B/56.json](B/56.json) |
| 57 | 对象后多出结束大括号 | 不通过 | [A/57.json](A/57.json) | [B/57.json](B/57.json) |
| 58 | 根对象缺少开始大括号 | 不通过 | [A/58.json](A/58.json) | [B/58.json](B/58.json) |
| 59 | 对象键未使用双引号 | 不通过 | [A/59.json](A/59.json) | [B/59.json](B/59.json) |
| 60 | 对象值包含未加引号的单词 | 不通过 | [A/60.json](A/60.json) | [B/60.json](B/60.json) |
| 61 | 数字之间缺少逗号 | 不通过 | [A/61.json](A/61.json) | [B/61.json](B/61.json) |
| 62 | 布尔值之间缺少逗号 | 不通过 | [A/62.json](A/62.json) | [B/62.json](B/62.json) |
| 63 | null与布尔值之间缺少逗号 | 不通过 | [A/63.json](A/63.json) | [B/63.json](B/63.json) |
| 64 | 布尔字面量被空白拆开 | 不通过 | [A/64.json](A/64.json) | [B/64.json](B/64.json) |
| 65 | 数字含有非法前导零 | 不通过 | [A/65.json](A/65.json) | [B/65.json](B/65.json) |
| 66 | 指数部分缺少数字 | 不通过 | [A/66.json](A/66.json) | [B/66.json](B/66.json) |
| 67 | 根级包含多个值 | 不通过 | [A/67.json](A/67.json) | [B/67.json](B/67.json) |
| 68 | 逗号后包含LF行注释 | 不通过 | [A/68.json](A/68.json) | [B/68.json](B/68.json) |
| 69 | 对象值前包含块注释 | 不通过 | [A/69.json](A/69.json) | [B/69.json](B/69.json) |
| 70 | 块注释未闭合 | 不通过 | [A/70.json](A/70.json) | [B/70.json](B/70.json) |
| 71 | 对象值后包含LF行注释 | 不通过 | [A/71.json](A/71.json) | [B/71.json](B/71.json) |
| 72 | 逗号后包含CRLF行注释 | 不通过 | [A/72.json](A/72.json) | [B/72.json](B/72.json) |
| 73 | 逗号后包含CR行注释 | 不通过 | [A/73.json](A/73.json) | [B/73.json](B/73.json) |
| 74 | 冒号后包含NBSP非JSON空白 | 不通过 | [A/74.json](A/74.json) | [B/74.json](B/74.json) |
| 75 | 文档开头包含BOM | 不通过 | [A/75.json](A/75.json) | [B/75.json](B/75.json) |
| 76 | 数组中包含换页符非JSON空白 | 不通过 | [A/76.json](A/76.json) | [B/76.json](B/76.json) |
| 77 | 根级包含CRLF行注释 | 不通过 | [A/77.json](A/77.json) | [B/77.json](B/77.json) |
| 78 | 文件末尾无换行的行注释 | 不通过 | [A/78.json](A/78.json) | [B/78.json](B/78.json) |
| 79 | 对象末尾包含多余逗号 | 不通过 | [A/79.json](A/79.json) | [B/79.json](B/79.json) |
| 80 | 嵌套容器使用错误的结束括号 | 不通过 | [A/80.json](A/80.json) | [B/80.json](B/80.json) |
| 81 | 空文件 | 不通过 | [A/81.json](A/81.json) | [B/81.json](B/81.json) |
| 82 | 仅标准 JSON 空白 | 不通过 | [A/82.json](A/82.json) | [B/82.json](B/82.json) |
| 83 | 仅对象起始括号 | 不通过 | [A/83.json](A/83.json) | [B/83.json](B/83.json) |
| 84 | 仅数组起始括号 | 不通过 | [A/84.json](A/84.json) | [B/84.json](B/84.json) |
| 85 | 仅对象结束括号 | 不通过 | [A/85.json](A/85.json) | [B/85.json](B/85.json) |
| 86 | 仅数组结束括号 | 不通过 | [A/86.json](A/86.json) | [B/86.json](B/86.json) |
| 87 | 仅冒号 | 不通过 | [A/87.json](A/87.json) | [B/87.json](B/87.json) |
| 88 | 仅逗号 | 不通过 | [A/88.json](A/88.json) | [B/88.json](B/88.json) |
| 89 | 仅斜杠 | 不通过 | [A/89.json](A/89.json) | [B/89.json](B/89.json) |
| 90 | 裸值内的 NUL 控制字符 | 不通过 | [A/90.json](A/90.json) | [B/90.json](B/90.json) |
| 91 | 长根字符串及结构字符 | 通过 | [A/91.json](A/91.json) | [B/91.json](B/91.json) |
| 92 | 十万项数字数组 | 通过 | [A/92.json](A/92.json) | [B/92.json](B/92.json) |
| 93 | 两千字段且每项为数组 | 通过 | [A/93.json](A/93.json) | [B/93.json](B/93.json) |
| 94 | 64层嵌套及缩进上限 | 通过 | [A/94.json](A/94.json) | [B/94.json](B/94.json) |
| 95 | 65层嵌套及缩进上限 | 通过 | [A/95.json](A/95.json) | [B/95.json](B/95.json) |
| 96 | 256层嵌套及缩进上限 | 通过 | [A/96.json](A/96.json) | [B/96.json](B/96.json) |
