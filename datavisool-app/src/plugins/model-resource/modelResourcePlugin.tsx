/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Cube} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {resources} from '@/shared/workbench/menuGroups.tsx';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const ThreeDModelResourceManagement = lazy(() => import('./ThreeDModelResourceManagement.tsx'));

export function createModelResourcePlugin(): Plugin {
    return {
        id: 'model-resource',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            registerWorkbenchPage(context, {
                id: 'app:models', path: 'modelResource', render: () => <ThreeDModelResourceManagement services={services}/>,
            }, {label: '3D模型', order: 40, icon: <Cube {...workbenchIconProps}/>, group: resources});
        },
    };
}
