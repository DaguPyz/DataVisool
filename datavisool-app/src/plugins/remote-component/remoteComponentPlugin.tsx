/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {DataServer} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const RemoteComponentManagement = lazy(() => import('./RemoteComponentManagement.tsx'));

export function createRemoteComponentPlugin(): Plugin {
    return {
        id: 'remote-component',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            registerWorkbenchPage(context, {
                id: 'app:remote-components', path: 'remoteComponent', render: () => <RemoteComponentManagement services={services}/>,
            }, {label: '服务器组件', order: 50, icon: <DataServer {...workbenchIconProps}/>});
        },
    };
}
