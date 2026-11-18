/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useState} from 'react';
import {Down, Logout, User} from '@icon-park/react';
import {Avatar, Dropdown, Menu, type DropdownMenuItem, type MenuItemType} from '@datavisool/ui';
import {RoleType, type IUserInfo} from '@/contracts/session.ts';
import type {WorkbenchMenuEntry} from '@/contracts/workbench.ts';
import {tx} from '@/i18n/miniI18n.ts';
import {useLocaleVersion} from '@/i18n/useLocaleVersion.ts';
import defaultLogo from '@/images/datavisool-logo.webp';
import type {WorkbenchSnapshot} from './Workbench.tsx';
import defaultMainLogo from './assets/default-main-logo.png';
import './HomeMenus.less';

interface HomeMenusProps {
    readonly entries: readonly WorkbenchMenuEntry[];
    readonly userInfo: IUserInfo | null;
    readonly logoRevisions: WorkbenchSnapshot['logoRevisions'];
    readonly matchedRouteIds: readonly string[];
    readonly pendingMenuKey?: string;
    readonly onSelectPage: (routeId: string) => void;
    readonly onSelectAccountPage: (routeId: string) => void;
    readonly onLogout: () => Promise<void>;
}

function getMenus(entries: readonly WorkbenchMenuEntry[], roles: readonly RoleType[]) {
    const topLevel: Array<{order: number; item: MenuItemType}> = [];
    const childrenByGroup = new Map<string, MenuItemType[]>();
    const parentByRouteId = new Map<string, string>();
    const visible = entries.flatMap(({routeId, menu}) => menu && (!menu.roles || menu.roles.some(role => roles.includes(role)))
        ? [{routeId, menu}] : []);
    visible.sort((left, right) => left.menu.order - right.menu.order);

    for (const {routeId, menu} of visible) {
        const item = {key: routeId, label: tx(menu.label), icon: menu.icon, className: 'datavisool-menu-node'};
        const group = menu.group;
        if (!group) {
            topLevel.push({order: menu.order, item});
            continue;
        }
        let children = childrenByGroup.get(group.key);
        if (!children) {
            children = [];
            childrenByGroup.set(group.key, children);
            topLevel.push({order: group.order, item: {key: group.key, label: tx(group.label), icon: group.icon, children}});
        }
        children.push(item);
        parentByRouteId.set(routeId, group.key);
    }

    return {items: topLevel.sort((left, right) => left.order - right.order).map(({item}) => item), parentByRouteId};
}

export function HomeMenus({
    entries, userInfo, logoRevisions, matchedRouteIds, pendingMenuKey, onSelectPage, onSelectAccountPage, onLogout,
}: HomeMenusProps) {
    useLocaleVersion();
    const roles = userInfo?.roles ?? [];
    const {items, parentByRouteId} = getMenus(entries, roles);
    const currentPage = [...matchedRouteIds].reverse().find(id => entries.some(entry => entry.routeId === id));
    const selectedPage = pendingMenuKey ?? currentPage;
    const parent = selectedPage ? parentByRouteId.get(selectedPage) : undefined;
    const [openKeys, setOpenKeys] = useState<string[]>(() => parent ? [parent] : []);

    useEffect(() => setOpenKeys(parent ? [parent] : []), [parent, selectedPage]);

    const mainLogo = '/static/logo/main-logo.png' + (logoRevisions.main ? `?${logoRevisions.main}` : '');
    const iconLogo = '/static/logo/logo.png' + (logoRevisions.icon ? `?${logoRevisions.icon}` : '');
    const [failedMainLogo, setFailedMainLogo] = useState<string>();
    const [failedIconLogo, setFailedIconLogo] = useState<string>();
    const userRoleLabel = roles.some(role => role === RoleType.SYSTEM_ADMIN || role === RoleType.ADMIN)
        ? tx('管理员') : tx('用户');

    const accountItems: DropdownMenuItem[] = entries.flatMap(({routeId, accountMenuLabel}) => accountMenuLabel ? [{
        key: `account:${routeId}`,
        label: tx(accountMenuLabel),
        icon: <User style={{position: 'relative', top: 2}}/>,
        onClick: () => onSelectAccountPage(routeId),
    }] : []);
    accountItems.push({
        key: 'logout',
        label: tx('退出登录'),
        icon: <Logout style={{position: 'relative', top: 2}}/>,
        onClick: onLogout,
    });

    return (
        <div className="datavisool-home-menus">
            <div className="sidebar-brand">
                <img
                    className="sidebar-brand-main"
                    src={failedMainLogo === mainLogo ? defaultMainLogo : mainLogo}
                    onError={() => setFailedMainLogo(mainLogo)}
                    alt={tx('品牌主图')}
                    draggable={false}
                />
                <img
                    className="sidebar-brand-icon"
                    src={failedIconLogo === iconLogo ? defaultLogo : iconLogo}
                    onError={() => setFailedIconLogo(iconLogo)}
                    alt={tx('品牌LOGO')}
                    draggable={false}
                />
            </div>
            <div className="menus-container">
                <Menu onClick={({key}) => { if (key !== currentPage) onSelectPage(key); }}
                      className="home-primary-menu"
                      selectedKeys={selectedPage ? [selectedPage] : []}
                      openKeys={openKeys}
                      onOpenChange={keys => setOpenKeys(keys.slice(-1) as string[])}
                      mode="inline"
                      items={items}/>
            </div>
            <div className="sidebar-footer">
                <div className="user-info">
                    <Dropdown menu={{items: accountItems}} trigger={['hover', 'click']} placement="topLeft">
                        <button className="home-user-avatar-trigger" type="button" aria-label={tx('账号菜单')}>
                            <Avatar className="home-user-avatar" src={userInfo?.avatar} alt="avatar">
                                {(userInfo?.username || 'DV').slice(0, 2).toUpperCase()}
                            </Avatar>
                        </button>
                    </Dropdown>
                    <div className="user-info-copy">
                        <strong>{userInfo?.username || tx('用户')}</strong>
                        <span>{userRoleLabel}</span>
                    </div>
                    <Down className="user-menu-chevron" theme="outline" size={14} fill="currentColor" aria-hidden="true"/>
                </div>
            </div>
        </div>
    );
}
