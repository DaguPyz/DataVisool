<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# DataVisool Web - Project Overview

## 1. Project Introduction
**DataVisool Web** is a modern, high-performance **Low-Code/No-Code Data Visualization Screen Designer** based on the React technology stack.
- **Architecture**: Monorepo (Single Repository) managed via `pnpm workspace`.
- **Core Capability**: Provides WYSIWYG interface building, Blueprint logical orchestration, and multi-source data integration (HTTP, WebSocket, MQTT).

## 2. Technology Stack

### Core Framework
- **Frontend**: [React 18](package.json) + [TypeScript](package.json)
- **Build Tool**: [Vite 5](package.json) (Fast development and build experience)
- **Package Manager**: **pnpm** (Workspace support)

### State Management & Logic
- **State Management**: [MobX 6](package.json) (Responsive state handling for designer and runtime)
- **Logic Orchestration**: **Blueprint System** (Node-based visual logic editing)

### Visualization & UI
- **Charts**: 
    - [ECharts 5](package.json) (Core chart engine)
    - [@antv/g2plot](package.json) (Statistical charts)
- **UI Components**:
    - [Ant Design (antd)](package.json): General UI components
    - **@datavisool/ui@0.1.0**: Shared UI components installed from npm
- **Component SDK**: `@datavisool/sdk@0.1.0`, shared with Desktop for types, component contracts, and utilities
- **Canvas Interaction**:
    - `@datavisool/interaction-engine`: Component interaction and selection

## 3. Project Structure

The project follows a Monorepo structure defined in `pnpm-workspace.yaml`.

### Workspace Packages

| Package Name | Path | Description |
| :--- | :--- | :--- |
| **datavisool-app** | `datavisool-app/` | **Main Application Core**. Contains the Designer, Blueprint system, Renderer, and entry points. |

Web-specific authentication, permissions, and other capabilities absent from the shared SDK are maintained by the App.

### Core Application Modules (`datavisool-app/src`)

- **`src/designer`**: The heart of the editor.
    - **Canvas**: Main rendering area (`DesignerCanvas.tsx`).
    - **Blueprint**: Logic editor (`BluePrint.tsx`).
    - **Header/Footer/Left/Right**: Layout panels.
- **`src/comps`**: Visualization components.
    - Contains definitions for Charts (ECharts, AntV) and Basic Components.
- **`src/lc`**: DataVisool specific base components.
- **`src/framework`**: Application framework and initialization logic.

## 4. Readiness
This document serves as the alignment baseline for future development tasks, including component expansion, blueprint enhancements, and bug fixes.
