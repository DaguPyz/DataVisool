/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Help} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const MoreInfo = lazy(() => import('./MoreInfo.tsx'));

export function createHelpPlugin(): Plugin {
    return {
        id: 'help',
        requires: ['i18n', 'navigation', 'router', 'workbench'],
        provides: [],
        activate(context) {
            const {translate} = context.i18n;
            registerWorkbenchPage(context, {
                id: 'app:help', path: 'more', render: () => <MoreInfo translate={translate}/>,
            }, {label: '帮助', order: 100, icon: <Help {...workbenchIconProps}/>});
        },
    };
}
