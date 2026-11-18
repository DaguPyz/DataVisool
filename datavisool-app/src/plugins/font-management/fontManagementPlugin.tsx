/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {FontSize} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {resources} from '@/shared/workbench/menuGroups.tsx';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const FontManagement = lazy(() => import('./FontManagement.tsx'));

export function createFontManagementPlugin(): Plugin {
    return {
        id: 'font-management',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            registerWorkbenchPage(context, {
                id: 'app:fonts', path: 'font', render: () => <FontManagement services={services}/>,
            }, {label: '字体', order: 10, icon: <FontSize {...workbenchIconProps}/>, group: resources});
        },
    };
}
