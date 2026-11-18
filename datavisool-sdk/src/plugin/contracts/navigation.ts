/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ComponentType, ReactNode} from 'react';
import type {PluginStopScope} from '../../plugin.js';
import type {RoleType} from './session.js';

export interface NavigationMenuGroup {
    readonly key: string;
    readonly label: string;
    readonly order: number;
    readonly icon?: ReactNode;
}

export interface NavigationMenuEntry {
    /** 已向 router 登记的路由 ID。 */
    readonly routeId: string;
    readonly label: string;
    readonly order: number;
    readonly icon?: ReactNode;
    readonly group?: NavigationMenuGroup;
    /** 存在匹配角色时显示。省略时向所有用户展示。 */
    readonly roles?: readonly RoleType[];
}

export interface NavigationProps {
    /** 可在执行跳转前播放过场。过场结束或取消后都应结束返回的 Promise。 */
    readonly runTransition?: (navigate: () => Promise<void>) => Promise<void>;
}

export interface NavigationMenuRegistration {
    /** 通过 context.onStop 登记，关闭前检查界面是否可以撤回。 */
    prepare(scope: PluginStopScope): void;
    /** 通过 context.onDispose 登记，撤回本批菜单。 */
    dispose(): void;
}

export interface NavigationService {
    readonly Navigation: ComponentType<NavigationProps>;
    /** 在插件激活时登记菜单，同一菜单列表中的路由 ID 必须唯一。 */
    registerMenuEntries(entries: readonly NavigationMenuEntry[]): NavigationMenuRegistration;
}

declare module '../../plugin.js' {
    interface PluginServices {
        navigation: NavigationService;
    }
}
