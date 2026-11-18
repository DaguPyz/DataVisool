/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {DynamicScriptsService} from '@datavisool/sdk/plugin/contracts/dynamicScripts';
import {homeRouteId, type RouteDefinition} from '@datavisool/sdk/plugin/contracts/router';

const TemplateMarket = lazy(() => import('@/pages/home/template-market/TemplateMarket.tsx'));
const ResourceManagement = lazy(() => import('@/pages/home/resource-management/ResourceManagement.tsx'));
const ProjectSetting = lazy(() => import('@/pages/home/project-setting/ProjectSetting.tsx'));

export function createLegacyWorkbenchRoutes(dynamicScripts: DynamicScriptsService): readonly RouteDefinition[] {
    return [
        {id: 'app:templates', parentId: homeRouteId, path: 'template', render: () => <TemplateMarket/>},
        {id: 'app:resources', parentId: homeRouteId, path: 'resource', render: () => <ResourceManagement/>},
        {
            id: 'app:project-settings', parentId: homeRouteId, path: 'projectSetting/:id',
            render: () => <ProjectSetting {...dynamicScripts}/>,
        },
    ];
}
