/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Send} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const ReleaseManagement = lazy(() => import('./ReleaseManagement.tsx'));

export function createReleaseManagementPlugin(): Plugin {
    return {
        id: 'release-management',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            registerWorkbenchPage(context, {
                id: 'app:release-management', path: 'releaseManagement', render: () => <ReleaseManagement services={services}/>,
            }, {label: '发布管理', order: 60, icon: <Send {...workbenchIconProps}/>});
        },
    };
}
