/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ComponentType, ReactNode} from 'react';

export interface HomeLayoutProps {
    /** 工作台传入的导航视图，由布局决定放置位置。 */
    readonly navigation: ReactNode;
    /** 路由匹配出的当前业务页，由布局放入内容区。 */
    readonly content: ReactNode;
}

export interface HomeLayoutService {
    /** 在工作台渲染时接收导航和内容。 */
    readonly Layout: ComponentType<HomeLayoutProps>;
}

declare module '../../plugin.js' {
    interface PluginServices {
        homeLayout: HomeLayoutService;
    }
}
