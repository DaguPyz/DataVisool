# DataVisool 插件开发模板

解压模板后运行 `npm install` 和 `npm run build`。模板自带宿主公开的插件接口和能力契约。使用路由服务时，以 `import type {} from '@datavisool/plugin-api/contracts/router'` 引入路由声明，再通过 `requires: ['router']` 声明依赖，即可调用 `ctx.router`。宿主在启动时调用插件的默认导出创建实例，再交给 Visloom。

## 导出自己的能力

示例插件 A 在 `src/contracts/report.ts` 中定义 `ReportService`，并通过 `declare module` 把 `reports: ReportService` 加到公共的 `PluginServices` 接口里。插件在 `provides` 声明 `'reports'`，再在 `src/index.ts` 调用 `ctx.provide('reports', service)`。同一能力的提供方和使用方须使用相同的名字。

从 A 的 `dist/contracts` 取出 `report.d.ts`，放进 B 的 `src/types/`。B 的 TypeScript 会读取这份声明，为 `ctx.reports` 提供方法和参数补全。A 的接口变更后，同步这份声明即可。

## 在另一个插件里使用

如果 B 也从模板创建，请移除 B 工程自带的示例 `src/contracts/report.ts`。在 B 的入口声明 `requires: ['reports']`，宿主激活 A 后，B 就可以直接调用 `ctx.reports`。

```ts
import type {Plugin} from '@datavisool/plugin-api';

export default function createConsumerPlugin(): Plugin {
    return {
        id: 'example/report-consumer',
        requires: ['reports'],
        provides: [],
        activate(ctx) {
            console.log(ctx.reports.formatTitle('Monthly sales'));
        },
    };
}
```
