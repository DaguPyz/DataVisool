<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# DataVisool Web 项目文档

## 1. 项目概述 (Project Overview)

**DataVisool Web (LC Pro)** 是一款基于 React 技术的现代化**低代码/无代码数据可视化大屏设计器**。它旨在帮助开发者和业务人员通过图形化界面，快速构建专业级的数据仪表盘、大屏展示和人机交互界面（HMI）。

**核心价值：**
- **所见即所得**：通过拖拽组件、配置属性即可完成页面搭建。
- **逻辑编排**：内置“蓝图”系统，通过节点连线实现复杂的交互逻辑，无需编写代码。
- **多数据源**：支持 HTTP、WebSocket、MQTT 等多种数据接入方式。

## 2. 技术架构 (Technical Architecture)

项目采用现代前端 Monorepo 架构构建：

- **包管理器**：**pnpm** (使用 Workspace 管理多包依赖)
- **核心框架**：React 18 + TypeScript
- **构建工具**：Vite
- **状态管理**：MobX (用于管理设计器复杂的全局状态)
- **UI 组件库**：
    - `antd`: 通用 UI 组件
    - `@datavisool/ui@0.1.0`: 从 npm 安装的共享 UI 组件库
- **组件 SDK**：`@datavisool/sdk@0.1.0`，与 Desktop 共用类型、组件接口和工具
- **图表渲染**：ECharts, @antv/g2plot
- **画布交互**：`@datavisool/interaction-engine`
- **本地存储**：localforage (IndexedDB)

## 3. 目录结构与 Workspace (Directory Structure)

前端工作区在 `pnpm-workspace.yaml` 中配置：

### 3.1 Workspace Packages

| 包名 (Package) | 目录 | 说明 |
| :--- | :--- | :--- |
| **datavisool-app** | `/datavisool-app` | **主应用核心**。包含设计器主体、画布、蓝图系统及运行时逻辑。 |

Web 专用的登录、权限及其他共享 SDK 未提供的能力由 App 自行维护。

### 3.2 核心应用模块 (`datavisool-app/src`)

主应用 (`datavisool-app`) 是项目的大脑，其 `src` 目录结构如下：

- **`src/designer` (设计器核心)**:
    - **Canvas**: 画布区域。
    - **Header**: 顶部工具栏。
    - **Left/Right**: 左右侧面板（组件库、图层、属性配置）。
    - **Blueprint**: 蓝图逻辑编排模块。
- **`src/comps` (可视化组件库)**:
    - 包含所有可拖拽到画布上的组件（图表、文本、媒体等）。
    - 每个组件包含 Definition (元数据), Controller (逻辑), Component (视图), Config (配置面板)。
- **`src/designer/blueprint` (蓝图系统)**:
    - 可视化逻辑编辑器，处理组件交互和事件流。

## 4. 数据流与状态管理 (Data Flow)

### 4.1 状态管理 (MobX)
- `ProjectManager`: 管理项目整体配置。
- `DesignerManager`: 管理画布交互状态。
- `LayerListStore`: 管理组件图层树。

### 4.2 数据持久化
- **自动保存**: 利用 `localforage` 将快照存入 IndexedDB。
- **项目文件**: 保存为 JSON 格式，包含画布配置、组件树 (Layer) 和蓝图逻辑 (Blueprint)。

## 5. 核心功能特性 (Key Features)

1.  **Monorepo 架构**: 模块解耦，便于维护和复用。
2.  **可视化拖拽**: 自由布局，支持成组、锁定、快捷键操作。
3.  **蓝图交互**: 节点式逻辑编排，支持复杂业务场景。
4.  **多源数据**: 支持静态 JSON、API、WebSocket、MQTT。
5.  **插件化组件**: 组件结构标准化，易于扩展。

## 6. 开发指南 (Development Guide)

### 环境准备
- Node.js (推荐 LTS)
- **pnpm** (必须安装: `npm install -g pnpm`)

### 安装与启动

1. **安装依赖** (在根目录执行):
   ```bash
   pnpm install
   ```

2. **启动开发环境**:
   当前开发态已经收敛为单后端联调模式。先启动 `datavisool-service`，再启动 Vite；Vite 只会把 `/api/**` 和 `/static/**` 代理到 `datavisool-service`，不再依赖其他转发服务。
   ```bash
   # 1) 启动后端（需要 JDK 17 和可用的数据源配置）
   cd backend
   mvn -pl datavisool-service -am spring-boot:run

   # 2) 新开终端启动前端 Vite
   # 在项目根目录运行
   pnpm --F datavisool-app dev
   ```

   如果本地 `datavisool-service` 不是运行在 `http://127.0.0.1:8080`，可以在启动前端前临时指定：
   ```bash
   DATAVISOOL_SERVER_DEV_TARGET=http://127.0.0.1:18080 pnpm --F datavisool-app dev
   ```

3. **构建项目**:
   ```bash
   pnpm --F datavisool-app build
   ```

   共享 SDK 或 UI 版本调整后，可运行以下命令检查 Web 相关行为并执行生产构建：

   ```bash
   pnpm --filter datavisool-app verify:shared
   ```

   只运行共享包相关的前端测试，可使用 `pnpm --filter datavisool-app test:shared`。两项命令不能替代 Desktop 测试或真实项目验证。

   生产部署不再单独发布前端静态站点。前端产物会在 `datavisool-service` Maven 打包阶段自动并入后端 jar，由同一个服务对外提供。
