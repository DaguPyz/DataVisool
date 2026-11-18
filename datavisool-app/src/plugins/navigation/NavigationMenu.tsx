/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef, useState} from 'react';
import {globalMessage, Menu, type MenuItemType} from '@datavisool/ui';
import type {NavigationMenuEntry, NavigationProps} from '@/contracts/navigation.ts';
import type {RouteLocation} from '@/contracts/router.ts';
import {tx} from '@/i18n/miniI18n.ts';
import {useLocaleVersion} from '@/i18n/useLocaleVersion.ts';
import './NavigationMenu.less';

interface NavigationMenuProps extends NavigationProps {
    readonly entries: readonly NavigationMenuEntry[];
    readonly location: RouteLocation | undefined;
    readonly navigate: (routeId: string, locationKey: string | undefined) => Promise<void>;
    readonly canNavigate: () => boolean;
}

const routeKey = (routeId: string) => `route:${routeId}`;

function buildMenu(entries: readonly NavigationMenuEntry[]) {
    const topLevel: Array<{order: number; item: MenuItemType}> = [];
    const childrenByGroup = new Map<string, MenuItemType[]>();
    const parentByRouteId = new Map<string, string>();

    for (const {routeId, label, order, icon, group} of [...entries].sort((left, right) => left.order - right.order)) {
        const item = {key: routeKey(routeId), label: tx(label), icon, className: 'datavisool-menu-node'};
        if (!group) {
            topLevel.push({order, item});
            continue;
        }
        const groupKey = `group:${group.key}`;
        let children = childrenByGroup.get(groupKey);
        if (!children) {
            children = [];
            childrenByGroup.set(groupKey, children);
            topLevel.push({order: group.order, item: {key: groupKey, label: tx(group.label), icon: group.icon, children}});
        }
        children.push(item);
        parentByRouteId.set(routeId, groupKey);
    }

    return {items: topLevel.sort((left, right) => left.order - right.order).map(({item}) => item), parentByRouteId};
}

export default function NavigationMenu({entries, location, navigate, canNavigate, runTransition}: NavigationMenuProps) {
    useLocaleVersion();
    const {items, parentByRouteId} = buildMenu(entries);
    const entriesByKey = new Map(entries.map(entry => [routeKey(entry.routeId), entry]));
    const currentPage = location?.matchedRouteIds.slice().reverse().find(id => entriesByKey.has(routeKey(id)));
    const pending = useRef<symbol>();
    const [pendingPage, setPendingPage] = useState<string>();
    const selectedPage = pendingPage && entriesByKey.has(routeKey(pendingPage)) ? pendingPage : currentPage;
    const parent = selectedPage ? parentByRouteId.get(selectedPage) : undefined;
    const [openKeys, setOpenKeys] = useState<string[]>(() => parent ? [parent] : []);

    useEffect(() => setOpenKeys(parent ? [parent] : []), [parent, selectedPage]);
    useEffect(() => {
        setPendingPage(undefined);
        return () => { pending.current = undefined; };
    }, [location?.key]);

    const selectPage = async (key: string) => {
        const entry = entriesByKey.get(key);
        if (!canNavigate() || !entry || entry.routeId === currentPage) return;
        const request = Symbol();
        pending.current = request;
        setPendingPage(entry.routeId);
        const go = async () => {
            if (pending.current === request) await navigate(entry.routeId, location?.key);
        };
        try {
            if (runTransition) await runTransition(go);
            else await go();
        } catch (error) {
            if (pending.current === request) {
                console.error('Menu navigation failed.', error);
                globalMessage.messageApi?.error(tx('无法打开页面'));
            }
        } finally {
            if (pending.current === request) {
                pending.current = undefined;
                setPendingPage(undefined);
            }
        }
    };

    return (
        <div className="home-navigation">
            <Menu onClick={({key}) => void selectPage(key)}
                  className="home-primary-menu"
                  selectedKeys={selectedPage ? [routeKey(selectedPage)] : []}
                  openKeys={openKeys}
                  onOpenChange={keys => setOpenKeys(keys.slice(-1) as string[])}
                  mode="inline"
                  items={items}/>
        </div>
    );
}
