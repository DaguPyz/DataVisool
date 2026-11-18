/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {FileCodeOne} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {DynamicScriptListProps} from '@datavisool/sdk/plugin/contracts/dynamicScripts';
import {resources} from '@/shared/workbench/menuGroups.tsx';
import {createWorkbenchPageServices} from '@/shared/workbench/pageServices.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const DynamicScriptList = lazy(() => import('./DynamicScriptList.tsx'));

export function createDynamicScriptPlugin(): Plugin {
    return {
        id: 'dynamic-script',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: ['dynamicScripts'],
        activate(context) {
            const services = createWorkbenchPageServices(context);
            function ScriptList(props: DynamicScriptListProps) {
                return <DynamicScriptList {...props} services={services}/>;
            }
            context.provide('dynamicScripts', {ScriptList});
            registerWorkbenchPage(context, {
                id: 'app:dynamic-scripts', path: 'dynamicScript',
                render: () => <ScriptList title="动态脚本管理" variant="resource"/>,
            }, {label: '动态脚本', order: 20, icon: <FileCodeOne {...workbenchIconProps}/>, group: resources});
        },
    };
}
