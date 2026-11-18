/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Box, DataOne} from '@icon-park/react';
import type {NavigationMenuGroup} from '@datavisool/sdk/plugin/contracts/navigation';
import {workbenchIconProps} from './registerWorkbenchPage.ts';

export const dataSources: NavigationMenuGroup = {
    key: 'datasource', label: '数据源管理', order: 30, icon: <DataOne {...workbenchIconProps}/>,
};

export const resources: NavigationMenuGroup = {
    key: 'resourceManagement', label: '资源管理', order: 40, icon: <Box {...workbenchIconProps}/>,
};
