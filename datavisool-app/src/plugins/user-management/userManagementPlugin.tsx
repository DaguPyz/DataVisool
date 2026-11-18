/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {User} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {RoleType} from '@datavisool/sdk/plugin/contracts/session';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const UserManagement = lazy(() => import('./UserManagement.tsx'));

export function createUserManagementPlugin(): Plugin {
    return {
        id: 'user-management',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            registerWorkbenchPage(context, {
                id: 'app:users', path: 'user', render: () => <UserManagement services={services}/>,
            }, {label: '用户管理', order: 80, icon: <User {...workbenchIconProps}/>, roles: [RoleType.SYSTEM_ADMIN]});
        },
    };
}
