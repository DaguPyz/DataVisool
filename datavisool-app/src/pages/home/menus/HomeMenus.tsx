/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import { useLocation, useNavigate } from "react-router-dom";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Api, Box, Brain, Cube, DashboardOne, DatabaseSetting, DataOne, DataServer, FileCodeOne, FolderClose, FontSize, Help, Logout, Send, Setting, User, VideoOne, Down } from "@icon-park/react";
import {Avatar, Dropdown, Menu, globalMessage, type DropdownMenuItem, type MenuItemType} from "@datavisool/ui";
import AuthTools, {RoleType} from "@/util/AuthTools.ts";
import "@/pages/home/menus/HomeMenus.less";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import defaultMainLogo from "@/images/brand-candidates/01.png";
import defaultLogo from "@/images/datavisool-logo.webp";

export const HomeMenus = memo(() => {
    useLocaleVersion();

    const navigate = useNavigate();
    const location = useLocation();
    const navigateTimerRef = useRef<number>();
    const [userInfo, setUserInfo] = useState(AuthTools.getUserInfo());
    const [mainLogoSrc, setMainLogoSrc] = useState('/static/logo/main-logo.png');
    const [logoSrc, setLogoSrc] = useState('/static/logo/logo.png');
    const userRoleLabel = userInfo?.roles?.some((role) => role === RoleType.SYSTEM_ADMIN || role === RoleType.ADMIN)
        ? tx('管理员')
        : tx('用户');
    const { pathname } = location;
    const currentMenu = pathname.substring(pathname.lastIndexOf('/') + 1, pathname.length);
    const routeSwitchDelay = 260;
    const menuParentMap = useMemo<Record<string, string>>(() => ({
        database: 'datasource',
        api: 'datasource',
        font: 'resourceManagement',
        dynamicScript: 'resourceManagement',
        videoResource: 'resourceManagement',
        modelResource: 'resourceManagement'
    }), []);
    const [openKeys, setOpenKeys] = useState<string[]>(() => {
        const parent = menuParentMap[currentMenu];
        return parent ? [parent] : [];
    });
    const [activeMenuKey, setActiveMenuKey] = useState(currentMenu);

    useEffect(() => {
        const parent = menuParentMap[currentMenu];
        setOpenKeys(parent ? [parent] : []);
        setActiveMenuKey(currentMenu);
    }, [currentMenu, menuParentMap]);

    useEffect(() => {
        return () => {
            if (navigateTimerRef.current) {
                window.clearTimeout(navigateTimerRef.current);
            }
        }
    }, []);

    useEffect(() => {
        const updateUserInfo = () => setUserInfo(AuthTools.getUserInfo());
        window.addEventListener('datavisool-user-info-updated', updateUserInfo);
        return () => window.removeEventListener('datavisool-user-info-updated', updateUserInfo);
    }, []);

    useEffect(() => {
        const updateMainLogo = () => setMainLogoSrc(`/static/logo/main-logo.png?${Date.now()}`);
        const updateLogo = () => setLogoSrc(`/static/logo/logo.png?${Date.now()}`);
        window.addEventListener('datavisool-main-logo-updated', updateMainLogo);
        window.addEventListener('datavisool-logo-updated', updateLogo);
        return () => {
            window.removeEventListener('datavisool-main-logo-updated', updateMainLogo);
            window.removeEventListener('datavisool-logo-updated', updateLogo);
        };
    }, []);

    const changeMenu = (menu: { key: string }) => {
        if (menu.key === currentMenu) return;
        if (navigateTimerRef.current) {
            window.clearTimeout(navigateTimerRef.current);
        }
        setActiveMenuKey(menu.key);
        const parent = menuParentMap[menu.key];
        setOpenKeys(parent ? [parent] : []);
        window.dispatchEvent(new CustomEvent('datavisool-home-route-leave'));
        navigateTimerRef.current = window.setTimeout(() => navigate(`${menu.key}`), routeSwitchDelay);
    }

    const getMenus = () => {
        const baseMenus: MenuItemType[] = [
            {
                key: 'console',
                className: 'datavisool-menu-node datavisool-menu-node-console',
                icon: <DashboardOne theme="outline" size={18} fill="currentColor" />,
                label: tx('控制台')
            },
            {
                key: 'server',
                className: 'datavisool-menu-node datavisool-menu-node-server',
                icon: <FolderClose theme="outline" size={18} fill="currentColor" />,
                label: tx('项目列表')
            },
            {
                key: 'datasource',
                icon: <DataOne theme="outline" size={18} fill="currentColor" />,
                label: tx('数据源管理'),
                children: [
                    {
                        key: 'database',
                        className: 'datavisool-menu-node datavisool-menu-node-database',
                        icon: <DatabaseSetting theme="outline" size={18} fill="currentColor" />,
                        label: tx('数据库管理')
                    },
                    {
                        key: 'api',
                        className: 'datavisool-menu-node datavisool-menu-node-api',
                        icon: <Api theme="outline" size={18} fill="currentColor" />,
                        label: tx('API管理')
                    }
                ]
            },
            {
                key: 'resourceManagement',
                icon: <Box theme="outline" size={18} fill="currentColor" />,
                label: tx('资源管理'),
                children: [
                    {
                        key: 'font',
                        className: 'datavisool-menu-node datavisool-menu-node-font',
                        icon: <FontSize theme="outline" size={18} fill="currentColor" />,
                        label: tx('字体'),
                    },
                    {
                        key: 'dynamicScript',
                        className: 'datavisool-menu-node datavisool-menu-node-dynamicScript',
                        icon: <FileCodeOne theme="outline" size={18} fill="currentColor" />,
                        label: tx('动态脚本'),
                    },
                    {
                        key: 'videoResource',
                        className: 'datavisool-menu-node datavisool-menu-node-videoResource',
                        icon: <VideoOne theme="outline" size={18} fill="currentColor" />,
                        label: tx('视频'),
                    },
                    {
                        key: 'modelResource',
                        className: 'datavisool-menu-node datavisool-menu-node-modelResource',
                        icon: <Cube theme="outline" size={18} fill="currentColor" />,
                        label: tx('3D模型'),
                    }
                ]
            },
            {
                key: 'remoteComponent',
                className: 'datavisool-menu-node datavisool-menu-node-remoteComponent',
                icon: <DataServer theme="outline" size={18} fill="currentColor" />,
                label: tx('服务器组件')
            },
            {
                key: 'releaseManagement',
                className: 'datavisool-menu-node datavisool-menu-node-releaseManagement',
                icon: <Send theme="outline" size={18} fill="currentColor" />,
                label: tx('发布管理')
            },
            {
                key: 'aiModel',
                className: 'datavisool-menu-node datavisool-menu-node-aiModel',
                icon: <Brain theme="outline" size={18} fill="currentColor" />,
                label: tx('AI模型管理')
            },
            {
                key: 'more',
                className: 'datavisool-menu-node datavisool-menu-node-more',
                icon: <Help theme="outline" size={18} fill="currentColor" />,
                label: tx('帮助')
            }
        ]

        if (userInfo?.roles.includes(RoleType.SYSTEM_ADMIN)) {
            baseMenus.splice(baseMenus.length - 1, 0, {
                key: 'user',
                className: 'datavisool-menu-node datavisool-menu-node-user',
                icon: <User theme="outline" size={18} fill="currentColor" />,
                label: tx('用户管理')
            });
            baseMenus.splice(baseMenus.length - 1, 0, {
                key: 'setting',
                className: 'datavisool-menu-node datavisool-menu-node-setting',
                icon: <Setting theme="outline" size={18} fill="currentColor" />,
                label: tx('设置')
            });
        }
        return baseMenus;
    }

    const items: DropdownMenuItem[] = [
        {
            key: 'user-info',
            label: tx("账号设置"),
            icon: <User style={{ position: 'relative', top: 2 }} />,
            onClick: () => navigate('setting'),
        },
        {
            key: 'logout',
            label: tx("退出登录"),
            icon: <Logout style={{ position: 'relative', top: 2 }} />,
            onClick: async () => {
                try {
                    await AuthFetchUtil.postOrThrow('/api/authenticate/logout', {}, {suppressErrorMessage: true});
                    AuthTools.removeUser();
                    navigate('/login');
                } catch {
                    // 请求失败时保留登录信息，以便重试退出。
                    globalMessage.messageApi?.error(tx('退出失败，请重试'));
                }
            },
        },
    ];
    return (
        <div className={'datavisool-home-menus'}>
            <div className="sidebar-brand">
                <img
                    className="sidebar-brand-main"
                    src={mainLogoSrc}
                    onError={() => setMainLogoSrc(defaultMainLogo)}
                    alt={tx('品牌主图')}
                    draggable={false}
                />
                <img
                    className="sidebar-brand-icon"
                    src={logoSrc}
                    onError={() => setLogoSrc(defaultLogo)}
                    alt={tx('品牌LOGO')}
                    draggable={false}
                />
            </div>
            <div className="menus-container">
                <Menu onClick={changeMenu}
                    className="home-primary-menu"
                    defaultSelectedKeys={[activeMenuKey]}
                    selectedKeys={[activeMenuKey]}
                    openKeys={openKeys}
                    onOpenChange={(keys) => {
                        setOpenKeys(keys.slice(-1) as string[]);
                    }}
                    mode="inline"
                    items={getMenus()}
                />
            </div>
            <div className="sidebar-footer">
                <div className={'user-info'}>
                    <Dropdown menu={{ items }} trigger={['hover', 'click']} placement="topLeft">
                        <button className="home-user-avatar-trigger" type="button" aria-label={tx("账号菜单")}>
                            <Avatar className="home-user-avatar" src={userInfo?.avatar} alt="avatar">
                                {(userInfo?.username || 'DV').slice(0, 2).toUpperCase()}
                            </Avatar>
                        </button>
                    </Dropdown>
                    <div className="user-info-copy">
                        <strong>{userInfo?.username || tx('用户')}</strong>
                        <span>{userRoleLabel}</span>
                    </div>
                    <Down className="user-menu-chevron" theme="outline" size={14} fill="currentColor" aria-hidden="true" />
                </div>
            </div>
        </div>
    );
})
