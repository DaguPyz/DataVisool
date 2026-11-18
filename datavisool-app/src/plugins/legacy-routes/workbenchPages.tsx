/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {
    Api, Box, Brain, Cube, DashboardOne, DatabaseSetting, DataOne, DataServer, FileCodeOne,
    FolderClose, FontSize, Help, Send, Setting as SettingsIcon, User, VideoOne,
} from '@icon-park/react';
import {lazy} from 'react';
import type {BrandLogo} from '@/contracts/brand.ts';
import type {RouteDefinition} from '@/contracts/router.ts';
import {RoleType} from '@/contracts/session.ts';
import type {WorkbenchMenuEntry, WorkbenchMenuGroup} from '@/contracts/workbench.ts';

const ConsoleDashboard = lazy(() => import('@/pages/home/console/ConsoleDashboard.tsx'));
const ProjectList = lazy(() => import('@/pages/home/project-list/ProjectList.tsx'));
const DataBaseList = lazy(() => import('@/pages/home/database/DataBaseList.tsx'));
const ApiManagement = lazy(() => import('@/pages/home/api-management/ApiManagement.tsx'));
const AiModelManagement = lazy(() => import('@/pages/home/ai-model-management/AiModelManagement.tsx'));
const TemplateMarket = lazy(() => import('@/pages/home/template-market/TemplateMarket.tsx'));
const UserManagement = lazy(() => import('@/pages/home/user-management/UserManagement.tsx'));
const ResourceManagement = lazy(() => import('@/pages/home/resource-management/ResourceManagement.tsx'));
const RemoteComponentManagement = lazy(() => import('@/pages/home/remote-component/RemoteComponentManagement.tsx'));
const ReleaseManagement = lazy(() => import('@/pages/home/release-management/ReleaseManagement.tsx'));
const FontManagement = lazy(() => import('@/pages/home/font-management/FontManagement.tsx'));
const VideoResourceManagement = lazy(() => import('@/pages/home/video-resource/VideoResourceManagement.tsx'));
const ThreeDModelResourceManagement = lazy(() => import('@/pages/home/model-resource/ThreeDModelResourceManagement.tsx'));
const DynamicScriptManagement = lazy(() => import('@/pages/home/dynamic-script/DynamicScriptManagement.tsx'));
const Setting = lazy(() => import('@/pages/home/setting/Setting.tsx'));
const MoreInfo = lazy(() => import('@/pages/home/more-info/MoreInfo.tsx'));
const ProjectSetting = lazy(() => import('@/pages/home/project-setting/ProjectSetting.tsx'));

const iconProps = {theme: 'outline', size: 18, fill: 'currentColor'} as const;
const dataSources: WorkbenchMenuGroup = {
    key: 'datasource', label: '数据源管理', order: 30, icon: <DataOne {...iconProps}/>,
};
const resources: WorkbenchMenuGroup = {
    key: 'resourceManagement', label: '资源管理', order: 40, icon: <Box {...iconProps}/>,
};
const systemAdmins = [RoleType.SYSTEM_ADMIN] as const;

interface LegacyWorkbenchPage extends Omit<WorkbenchMenuEntry, 'routeId'> {
    readonly route: RouteDefinition;
}

export function createLegacyWorkbenchPages(onBrandLogoChanged: (logo: BrandLogo) => void): readonly LegacyWorkbenchPage[] {
    return [
        {
            route: {id: 'app:console', path: 'console', render: () => <ConsoleDashboard/>},
            menu: {label: '控制台', order: 10, icon: <DashboardOne {...iconProps}/>},
        },
        {
            route: {id: 'app:projects', path: 'server', render: () => <ProjectList/>},
            menu: {label: '项目列表', order: 20, icon: <FolderClose {...iconProps}/>},
        },
        {
            route: {id: 'app:database', path: 'database', render: () => <DataBaseList/>},
            menu: {label: '数据库管理', order: 10, icon: <DatabaseSetting {...iconProps}/>, group: dataSources},
        },
        {
            route: {id: 'app:api', path: 'api', render: () => <ApiManagement/>},
            menu: {label: 'API管理', order: 20, icon: <Api {...iconProps}/>, group: dataSources},
        },
        {
            route: {id: 'app:ai-models', path: 'aiModel', render: () => <AiModelManagement/>},
            menu: {label: 'AI模型管理', order: 70, icon: <Brain {...iconProps}/>},
        },
        {route: {id: 'app:templates', path: 'template', render: () => <TemplateMarket/>}},
        {
            route: {id: 'app:users', path: 'user', render: () => <UserManagement/>},
            menu: {label: '用户管理', order: 80, icon: <User {...iconProps}/>, roles: systemAdmins},
        },
        {route: {id: 'app:resources', path: 'resource', render: () => <ResourceManagement/>}},
        {
            route: {id: 'app:remote-components', path: 'remoteComponent', render: () => <RemoteComponentManagement/>},
            menu: {label: '服务器组件', order: 50, icon: <DataServer {...iconProps}/>},
        },
        {
            route: {id: 'app:release-management', path: 'releaseManagement', render: () => <ReleaseManagement/>},
            menu: {label: '发布管理', order: 60, icon: <Send {...iconProps}/>},
        },
        {route: {id: 'app:user-info', path: 'userInfo', redirectTo: '../setting'}},
        {
            route: {id: 'app:fonts', path: 'font', render: () => <FontManagement/>},
            menu: {label: '字体', order: 10, icon: <FontSize {...iconProps}/>, group: resources},
        },
        {
            route: {id: 'app:videos', path: 'videoResource', render: () => <VideoResourceManagement/>},
            menu: {label: '视频', order: 30, icon: <VideoOne {...iconProps}/>, group: resources},
        },
        {
            route: {id: 'app:models', path: 'modelResource', render: () => <ThreeDModelResourceManagement/>},
            menu: {label: '3D模型', order: 40, icon: <Cube {...iconProps}/>, group: resources},
        },
        {
            route: {id: 'app:dynamic-scripts', path: 'dynamicScript', render: () => <DynamicScriptManagement/>},
            menu: {label: '动态脚本', order: 20, icon: <FileCodeOne {...iconProps}/>, group: resources},
        },
        {
            route: {id: 'app:settings', path: 'setting', render: () => <Setting onBrandLogoChanged={onBrandLogoChanged}/>},
            menu: {label: '设置', order: 90, icon: <SettingsIcon {...iconProps}/>, roles: systemAdmins},
            accountMenuLabel: '账号设置',
        },
        {
            route: {id: 'app:help', path: 'more', render: () => <MoreInfo/>},
            menu: {label: '帮助', order: 100, icon: <Help {...iconProps}/>},
        },
        {route: {id: 'app:project-settings', path: 'projectSetting/:id', render: () => <ProjectSetting/>}},
    ];
}
