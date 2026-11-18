/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {DatabaseSetting} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {dataSources} from '@/shared/workbench/menuGroups.tsx';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const DataBaseList = lazy(() => import('./DataBaseList.tsx'));

export function createDatabasePlugin(): Plugin {
    return {
        id: 'database',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            registerWorkbenchPage(context, {
                id: 'app:database', path: 'database', render: () => <DataBaseList services={services}/>,
            }, {label: '数据库管理', order: 10, icon: <DatabaseSetting {...workbenchIconProps}/>, group: dataSources});
        },
    };
}
