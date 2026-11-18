/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {VideoOne} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {resources} from '@/shared/workbench/menuGroups.tsx';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const VideoResourceManagement = lazy(() => import('./VideoResourceManagement.tsx'));

export function createVideoResourcePlugin(): Plugin {
    return {
        id: 'video-resource',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            registerWorkbenchPage(context, {
                id: 'app:videos', path: 'videoResource', render: () => <VideoResourceManagement services={services}/>,
            }, {label: '视频', order: 30, icon: <VideoOne {...workbenchIconProps}/>, group: resources});
        },
    };
}
