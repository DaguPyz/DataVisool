<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# DataVisool Web UI 风格规范

本规范基于 `设计稿/` 目录中的项目列表、控制台、资源管理、设置页与新建弹框视觉稿制定。后续新增页面优先复用 `datavisool-app/src/style/AppTheme.less` 中的 `--datavisool-*` token；基础组件使用 npm 包 `@datavisool/ui`，同一主题文件将应用 token 映射到组件库的 `--datavisool-ui-*` 变量。

## 1. 风格定位

DataVisool Web 是面向桌面端的可视化设计与资源管理工具，界面应保持“深色沉浸、冷色科技、信息密度高、操作明确”的工作台气质。

* **深色底座**: 页面底色使用近黑蓝，不使用浅色大面积容器。
* **玻璃质感面板**: 主容器、卡片、弹框使用半透明深蓝渐变、1px 冷色描边和柔和阴影。
* **蓝紫主光**: 主要操作、选中态、焦点态使用蓝到紫的渐变；粉紫只做高亮端点或次级强调。
* **视觉资产承载氛围**: 首页、项目、新建、设置等核心页允许使用科技插画、点阵波形、网格地形作为弱背景，但不能压过信息层级。

## 2. 颜色 Token

核心变量定义在 `datavisool-app/src/style/AppTheme.less`。

| 用途 | Token | 色值/效果 |
| --- | --- | --- |
| 应用背景 | `--datavisool-color-bg-app` | `#050916` |
| 侧栏/大面板 | `--datavisool-color-bg-panel` | `#071022` |
| 卡片 | `--datavisool-color-bg-card` | `#0f172a` |
| 浮层 | `--datavisool-color-bg-elevated` | `#111a31` |
| 主色 | `--datavisool-color-primary` | `#3b82ff` |
| 主色渐变尾端 | `--datavisool-color-primary-end` | `#7c3aed` |
| 次强调 | `--datavisool-color-accent` | `#ec4899` |
| 信息/链接 | `--datavisool-color-info` | `#38bdf8` |
| 成功 | `--datavisool-color-success` | `#22d3a6` |
| 警告 | `--datavisool-color-warning` | `#fbbf24` |
| 危险 | `--datavisool-color-danger` | `#fb7185` |
| 主文本 | `--datavisool-color-text-primary` | `#ffffff` |
| 次文本 | `--datavisool-color-text-secondary` | `#a8b3cf` |
| 弱文本 | `--datavisool-color-text-tertiary` | `#7783a0` |
| 默认边框 | `--datavisool-color-border` | `rgba(86, 110, 161, 0.42)` |
| 焦点光环 | `--datavisool-color-ring` | `rgba(89, 134, 255, 0.72)` |

主按钮统一使用 `--datavisool-gradient-primary: linear-gradient(135deg, #3b82ff 0%, #6d5efc 52%, #ec4899 100%)`。

## 3. 排版

* 字体: `Inter`, `PingFang SC`, `Microsoft YaHei`, `Helvetica Neue`, Arial, sans-serif。
* 页面标题: 30-36px / 700，桌面端用于每个一级页面的主标题。
* 分组标题: 18-22px / 650，用于卡片组、弹框区块、设置页分组。
* 正文: 14-16px / 400，行高 1.5。
* 标签与辅助说明: 12-14px / 500，使用次文本或弱文本。
* 数字指标: 32-42px / 700，使用 tabular numbers，避免卡片内数值跳动。

## 4. 布局与间距

* 桌面优先，主要设计基准宽度 1440-1600px；页面不可横向溢出。
* 外层页面留白 32-40px；主卡片内部留白 24px。
* 控制台/资源管理类页面使用 12 列栅格，列间距 12-24px。
* 设置与弹框使用左右结构时，左侧导航/插画区固定宽度，右侧内容自适应。
* 列表卡片最小点击区域 44px；图标按钮视觉尺寸可小于 44px，但命中区域不能小于 44px。

## 5. 组件规范

### 面板与卡片

* 圆角: 普通卡片 8-10px，大面板与弹框 12px。
* 背景: `--datavisool-gradient-card` 或 `--datavisool-gradient-panel`。
* 边框: `1px solid var(--datavisool-color-border)`；选中态边框提升为蓝紫或紫粉渐变效果。
* 阴影: `--datavisool-shadow-panel` 为容器阴影，局部强调可使用 `--datavisool-shadow-glow-blue`。
* 禁止卡片套卡片造成多层边框堆叠；嵌套内容优先使用分割线或弱背景块。

### 按钮

* 主按钮: 蓝紫粉渐变背景，白字，8px 圆角，hover 时提升亮度和蓝紫光晕。
* 次按钮: 透明或弱背景，1px 冷色边框，白字或次文本。
* 危险按钮: 不使用大面积红色渐变，默认保持 outline 或 ghost，仅在确认弹框内强化。
* 图标按钮: 优先使用现有图标体系，必须提供可访问名称。

### 表单

* 输入框高度 44-56px；弹框里的关键字段优先 52px。
* 输入背景为近黑蓝，边框默认冷色低透明；focus 使用蓝紫光环或边框渐变。
* label 始终可见，辅助说明放在控件下方，不把 placeholder 当 label。
* 字符计数右对齐放在输入框内部或底部角落，颜色使用弱文本。

### 导航

* 侧栏选中态使用蓝紫渐变面和外发光；未选中项保持透明背景和次文本。
* 顶部工具区保持克制，只放搜索、通知、用户、一级操作。
* 每个页面只保留一个最强主操作，例如“新建项目”“新建 API”。

### 数据与图表

* 图表线条使用蓝、青、紫、粉四色序列，不只依赖颜色表达状态。
* 卡片内趋势线作为辅助信息时保持低高度和低对比，不抢主指标。
* 表格、资源列表、API 卡片优先支持搜索、分页、批量操作和空状态。

## 6. 自研组件库约定

* 主应用依赖 npm 包 `@datavisool/ui`，从包入口导入组件，并在应用入口引入 `@datavisool/ui/style.css`。
* 可复用组件的更新通过组件库发布及依赖升级接入，新增组件必须从项目真实场景抽象，不引入第三方 UI 生成器约定。
* 组件 class 拼接可以使用包入口导出的 `cn()`。
* 组件库通过 `DataVisoolUIProvider` 接收应用的 `locale` 和 `translate`，保持语言切换有效。
* 组件通过映射后的 `--datavisool-ui-*` 变量调色，业务页面使用 `--datavisool-*` token，不在组件内散落原始 hex。
* 现有 Ant Design/Less 页面继续可用，但新增业务组件优先复用同一套 `--datavisool-*` token，避免形成第二套视觉语言。

## 7. 动效与可访问性

* hover、focus、展开、弹框进入等微交互动效控制在 150-300ms。
* 动效只使用 opacity、transform、filter，避免动画修改 width、height、top、left。
* 必须保留清晰 focus ring；正文与背景对比度至少满足 WCAG AA。
* 支持 `prefers-reduced-motion: reduce`，关键页面切换和背景装饰动画要能降级。
