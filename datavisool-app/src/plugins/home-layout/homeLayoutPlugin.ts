/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {homeLayoutKey} from '@/contracts/homeLayout.ts';
import type {Plugin} from '@/visloom/index.ts';

export function createHomeLayoutPlugin(): Plugin {
    const Layout = lazy(() => import('./HomeLayout.tsx'));

    return {
        id: 'home-layout',
        requires: [],
        provides: [homeLayoutKey],
        activate(context) {
            context.provide(homeLayoutKey, {Layout});
        },
    };
}
