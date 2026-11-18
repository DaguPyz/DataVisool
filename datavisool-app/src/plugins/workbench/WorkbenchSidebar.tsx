/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useState, type ReactNode} from 'react';
import {Down, Logout, User} from '@icon-park/react';
import {Avatar, Dropdown, type DropdownMenuItem} from '@datavisool/ui';
import {useDataVisoolUITranslate} from '@datavisool/ui/basic';
import {RoleType, type IUserInfo} from '@datavisool/sdk/plugin/contracts/session';
import type {WorkbenchAccountEntry} from '@datavisool/sdk/plugin/contracts/workbench';
import defaultLogo from '@/images/datavisool-logo.webp';
import type {WorkbenchSnapshot} from './Workbench.tsx';
import defaultMainLogo from './assets/default-main-logo.png';
import './WorkbenchSidebar.less';

interface WorkbenchSidebarProps {
    readonly navigation: ReactNode;
    readonly accountEntries: readonly WorkbenchAccountEntry[];
    readonly userInfo: IUserInfo | null;
    readonly logoRevisions: WorkbenchSnapshot['logoRevisions'];
    readonly onSelectAccountPage: (routeId: string) => void;
    readonly onLogout: () => Promise<void>;
}

export function WorkbenchSidebar({
    navigation, accountEntries, userInfo, logoRevisions, onSelectAccountPage, onLogout,
}: WorkbenchSidebarProps) {
    const tx = useDataVisoolUITranslate();
    const roles = userInfo?.roles ?? [];

    const mainLogo = '/static/logo/main-logo.png' + (logoRevisions.main ? `?${logoRevisions.main}` : '');
    const iconLogo = '/static/logo/logo.png' + (logoRevisions.icon ? `?${logoRevisions.icon}` : '');
    const [failedMainLogo, setFailedMainLogo] = useState<string>();
    const [failedIconLogo, setFailedIconLogo] = useState<string>();
    const userRoleLabel = roles.some(role => role === RoleType.SYSTEM_ADMIN || role === RoleType.ADMIN)
        ? tx('管理员') : tx('用户');

    const accountItems: DropdownMenuItem[] = accountEntries.map(({routeId, label}) => ({
        key: `account:${routeId}`,
        label: tx(label),
        icon: <User style={{position: 'relative', top: 2}}/>,
        onClick: () => onSelectAccountPage(routeId),
    }));
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
            <div className="workbench-navigation">{navigation}</div>
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
