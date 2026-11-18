/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Brain} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const AiModelManagement = lazy(() => import('./AiModelManagement.tsx'));

export function createAiModelManagementPlugin(): Plugin {
    return {
        id: 'ai-model-management',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            registerWorkbenchPage(context, {
                id: 'app:ai-models', path: 'aiModel', render: () => <AiModelManagement services={services}/>,
            }, {label: 'AI模型管理', order: 70, icon: <Brain {...workbenchIconProps}/>});
        },
    };
}
