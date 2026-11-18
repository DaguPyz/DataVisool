# datavisool-ui

`@datavisool/ui` 是 DataVisool 的自研组件库模块，用于沉淀项目基础组件、图标、样式 token 与交互规范。

## 目录约定

* `src/components`: DataVisool 的正式业务组件，每个组件独立文件实现。
* `src/components/Icon.tsx`: 自有 SVG 图标组件，基础控件默认从这里取图标。
* `src/lib`: 自有工具函数，例如 `cn()`。
* `src/styles/index.css`: 组件库样式入口，使用独立的 `datavisool-ui.*` 样式层。
* `src/main.ts`: 组件库统一导出入口。
* `src/demo`: 本地开发预览入口，不参与 library 构建。

## 样式控制

组件默认使用设计稿风格：深色半透明面板、蓝紫渐变主按钮、细描边控件、聚焦光晕和紧凑后台信息密度。

组件样式只针对组件自身的 class，不设置 `:root`、`.dark`、`body` 或页面通配规则，也不对传入的 `children` 做通配重置。页面字体、背景和全局变量由使用方自己提供。

主题变量使用 `--datavisool-ui-*` 命名，每个引用都有默认值，无需依赖 App 样式。可以在组件或外层容器设置这些变量；使用方也可以通过浮层的 class 设置对应主题变量。

CodeMirror 的默认样式限定在库的编辑器及其专属补全容器内，不会修改使用方的其他 CodeMirror 实例。

组件库不读取 App 全局对象，也不监听 App 专用事件。用 `DataVisoolUIProvider` 为子树提供 `locale` 和 `translate`，即可翻译各组件的内置默认文案、提示、错误信息和无障碍名称。`DatavisoolGUI`、`ControlGroup` 的显式 `translate` 优先于 Provider，并会传给内部控件。没有配置翻译函数，或翻译函数返回 `null`/`undefined` 时，保留原文。`locale` 改变时会通知 Context 消费者更新，即使 `translate` 函数引用不变。

使用方传入的普通文案 props 保持原样；内置默认文案才由组件翻译。`DatavisoolGUI` 仍会翻译 schema 中的控件 `label`、`tip`，以及配置中的 `placeholder`、字符串 `children`、选项 `label` 和 `title`。动态文案采用模板键，例如可将 `共 {total} 条` 翻译为 `Total {total} items`，组件在翻译后填入变量，因此词序可调整。词典与翻译函数由使用方提供，组件库不内置目标语言词典。

```tsx
<DataVisoolUIProvider locale={locale} translate={tx}>
  <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
</DataVisoolUIProvider>
```

表单类组件支持通过 props 覆盖主要 CSS：

```tsx
<Input
  label="名称"
  width={360}
  height={56}
  borderRadius={16}
  background="rgba(20, 32, 64, 0.92)"
  fontSize={15}
  controlStyle={{boxShadow: 'none'}}
  controlClassName="custom-input"
/>
```

常用覆盖项包括 `width`、`height`、`background`、`border`、`borderColor`、`borderRadius`、`boxShadow`、`color`、`fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`padding`、`margin`、`style`、`controlStyle`、`className`、`controlClassName`。

## 常用命令

```bash
pnpm -F @datavisool/ui dev
pnpm -F @datavisool/ui check
pnpm -F @datavisool/ui build
```

## 发布 npm 包

在仓库根目录的交互式终端运行：

```bash
pnpm release:datavisool-ui
```

也可以在 `datavisool-ui` 目录运行 `pnpm release`。

脚本会检查 npm 登录账号；未登录时可确认执行 `npm login --auth-type=legacy`，由 npm 在终端提示输入登录信息。随后查询已发布版本，让你输入版本号和发布标签，自动构建 `dist` 并执行发布预演。预演成功后，输入 `y` 或 `yes` 才会正式公开发布到 `https://registry.npmjs.org/`，并查询本次版本验证结果。npm 身份验证保留原生交互。

版本号默认使用尚未发布的本地版本；已发布的版本必须换成新版本。正式版本默认使用 `latest` 标签，预发布版本默认使用 `beta`、`rc` 等对应标签。输入的新版本号会写入 `datavisool-ui/package.json`，取消或失败后保留，方便修正后重试。

脚本使用 `--no-git-checks` 跳过 Git 状态检查，不会自动提交或打标签。查询或预演失败时停止。上传命令成功后，每 10 秒查询本次版本及下载地址，最多等待 10 分钟，期间显示当前状态和已等待时间。版本信息可见且下载地址返回 HTTP 200 后，才显示发布完成。

等待期间的 404 只表示版本或下载地址暂不可见，可能仍在 npm 处理中；网络或权限异常会单独提示为查询异常。等待超时或无法继续查询时，脚本正常退出并明确显示“上传命令已完成、可安装状态尚未确认”，不会把它当作发布失败，也不会重复上传。

对已上传的版本，可运行以下命令仅查询 `datavisool-ui/package.json` 中当前版本的状态，无需再次构建或发布：

```bash
pnpm release:datavisool-ui --verify-only
```

发布包包含 `dist`、`licenses`、`package.json`、`README.md` 和 `LICENSE`。

业务侧使用组件时，需要引入组件库样式：

```ts
import '@datavisool/ui/style.css';
```


## 公开子入口

- `@datavisool/ui/basic`：基础控件，不加载代码编辑器。
- `@datavisool/ui/schema`：DatavisoolGUI 与默认控件表（包含代码编辑器）。
- `@datavisool/ui/code-editor`：代码编辑器及全屏编辑器。
- `@datavisool/ui/feedback`：渲染错误边界和错误提示，无全库样式导入。

原根入口继续提供全部组件，样式入口仍为 `@datavisool/ui/style.css`。
