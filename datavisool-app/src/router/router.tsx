/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */


import {lazy} from "react";
import {Navigate, RouteObject, useLocation} from "react-router-dom";

const DesignerViewPage = lazy(() => import('../pages/preview/DesignerViewPage.tsx'));
const DesignerReleasePage = lazy(() => import('../pages/release/DesignerReleasePage.tsx'));
const DesignerPage = lazy(() => import('../pages/designer/DesignerPage.tsx'));
const Login = lazy(() => import('../pages/login/Login'));
const Home = lazy(() => import('../pages/home/Home'));
const DataBaseList = lazy(() => import('../pages/home/database/DataBaseList.tsx'));
const TemplateMarket = lazy(() => import('../pages/home/template-market/TemplateMarket.tsx'));
const MoreInfo = lazy(() => import('../pages/home/more-info/MoreInfo.tsx'));
const DocsPage = lazy(() => import('../pages/docs/DocsPage.tsx'));
const LegacyDocsRedirect = lazy(() => import('../pages/docs/LegacyDocsRedirect.tsx'));
const Demo = lazy(() => import('../test/Demo'));
const UserManagement = lazy(() => import('../pages/home/user-management/UserManagement.tsx'));
const NotFound = lazy(() => import('../pages/result/NotFound.tsx'));
const NoAuth = lazy(() => import('../pages/result/NoAuth.tsx'));
const Error = lazy(() => import('../pages/result/Error.tsx'));
const ResourceManagement = lazy(() => import('../pages/home/resource-management/ResourceManagement.tsx'));
const RemoteComponentManagement = lazy(() => import('../pages/home/remote-component/RemoteComponentManagement.tsx'));
const ApiManagement = lazy(() => import('../pages/home/api-management/ApiManagement.tsx'));
const AiModelManagement = lazy(() => import('../pages/home/ai-model-management/AiModelManagement.tsx'));
const ReleaseManagement = lazy(() => import('../pages/home/release-management/ReleaseManagement.tsx'));
const FontManagement = lazy(() => import('../pages/home/font-management/FontManagement.tsx'));
const VideoResourceManagement = lazy(() => import('../pages/home/video-resource/VideoResourceManagement.tsx'));
const ThreeDModelResourceManagement = lazy(() => import('../pages/home/model-resource/ThreeDModelResourceManagement.tsx'));
const DynamicScriptManagement = lazy(() => import('../pages/home/dynamic-script/DynamicScriptManagement.tsx'));
const Setting = lazy(() => import('../pages/home/setting/Setting.tsx'));
const ProjectSetting = lazy(() => import('../pages/home/project-setting/ProjectSetting.tsx'));
const ProjectList = lazy(() => import('../pages/home/project-list/ProjectList.tsx'));
const ConsoleDashboard = lazy(() => import('../pages/home/console/ConsoleDashboard.tsx'));

function DocsRoute() {
    const {search} = useLocation();
    return new URLSearchParams(search).has('legacy') ? <LegacyDocsRedirect/> : <DocsPage/>;
}

export default [
    {path: '/docs', element: <LegacyDocsRedirect/>},
    {path: '/docs/zh-cn/*', element: <DocsRoute/>},
    {path: '/docs/*', element: <LegacyDocsRedirect/>},
    {path: '/preview', element: <DesignerViewPage/>},
    {path: '/release/:id', element: <DesignerReleasePage/>},
    {path: '/login', element: <Login/>},
    {path: '/test', element: <Demo/>},
    {path: '/designer', element: <DesignerPage/>},
    {
        path: '/home',
        element: <Home/>,
        id: '首页',
        children: [
            {path: 'console', element: <ConsoleDashboard/>, id: "控制台"},
            {path: 'server', element: <ProjectList/>, id: "项目列表"},
            {path: 'database', element: <DataBaseList/>, id: "数据库列表"},
            {path: 'api', element: <ApiManagement/>, id: "接口管理"},
            {path: 'aiModel', element: <AiModelManagement/>, id: "AI模型管理"},
            {path: 'template', element: <TemplateMarket/>, id: "模板市场"},
            {path: 'user', element: <UserManagement/>, id: "用户管理"},
            {path: 'resource', element: <ResourceManagement/>, id: "资源管理"},
            {path: 'remoteComponent', element: <RemoteComponentManagement/>, id: "服务器组件"},
            {path: 'releaseManagement', element: <ReleaseManagement/>, id: "发布管理"},
            {path: 'userInfo', element: <Navigate to="../setting" replace/>, id: "用户信息"},
            {path: 'font', element: <FontManagement/>, id: "字体管理"},
            {path: 'videoResource', element: <VideoResourceManagement/>, id: "视频资源管理"},
            {path: 'modelResource', element: <ThreeDModelResourceManagement/>, id: "3D模型资源管理"},
            {path: 'dynamicScript', element: <DynamicScriptManagement/>, id: "动态脚本管理"},
            {path: 'setting', element: <Setting/>, id: "系统设置"},
            {path: 'more', element: <MoreInfo/>, id: "更多信息"},
            {path: 'projectSetting/:id', element: <ProjectSetting/>, id: "项目设置"},
            {index: true, element: <Navigate to="console" replace/>}
        ],
    },
    {path: '/', element: <Login/>},
    {path: '/notFound', element: <NotFound/>},
    {path: '/noAuth', element: <NoAuth/>},
    {path: '/error', element: <Error/>},
    {path: '*', element: <NotFound/>}
] as RouteObject[];
