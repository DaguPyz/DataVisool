/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {Plugin} from '@/visloom/index.ts';

/**
 * 提供工作台的布局组件。替代实现通过 `homeLayout` 提供 `Layout`，由工作台传入导航和当前业务页。
 * @pluginDocs
 */
export function createHomeLayoutPlugin(): Plugin {
    const Layout = lazy(() => import('./HomeLayout.tsx'));

    return {
        id: 'home-layout',
        requires: [],
        provides: ['homeLayout'],
        activate(context) {
            context.provide('homeLayout', {Layout});
        },
    };
}
