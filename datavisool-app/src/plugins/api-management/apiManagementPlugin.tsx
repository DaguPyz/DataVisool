/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Api} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {dataSources} from '@/shared/workbench/menuGroups.tsx';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const ApiManagement = lazy(() => import('./ApiManagement.tsx'));

export function createApiManagementPlugin(): Plugin {
    return {
        id: 'api-management',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            registerWorkbenchPage(context, {
                id: 'app:api', path: 'api', render: () => <ApiManagement services={services}/>,
            }, {label: 'API管理', order: 20, icon: <Api {...workbenchIconProps}/>, group: dataSources});
        },
    };
}
