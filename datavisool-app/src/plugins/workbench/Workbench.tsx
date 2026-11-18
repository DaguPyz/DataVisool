/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {memo, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode} from 'react';
import {GlobalModal, Loading, globalMessage} from '@datavisool/ui';
import type {BrandLogo} from '@/contracts/brand.ts';
import type {HomeLayoutService} from '@/contracts/homeLayout.ts';
import type {NavigationService} from '@/contracts/navigation.ts';
import type {RouteLocation, RouterService} from '@/contracts/router.ts';
import {RoleType, type SessionService} from '@/contracts/session.ts';
import type {WorkbenchAccountEntry} from '@/contracts/workbench.ts';
import {tx} from '@/i18n/miniI18n.ts';
import {WorkbenchSidebar} from './WorkbenchSidebar.tsx';
import {useWorkbenchRequests, type WorkbenchRequest} from './useWorkbenchRequests.ts';
import WebUpdateNotice from './WebUpdateNotice.tsx';
import './WorkbenchTransition.less';

export interface WorkbenchSnapshot {
    readonly signal: AbortSignal;
    readonly logoRevisions: Readonly<Partial<Record<BrandLogo, number>>>;
}

interface WorkbenchProps {
    readonly Layout: HomeLayoutService['Layout'];
    readonly Navigation: NavigationService['Navigation'];
    readonly accountEntries: readonly WorkbenchAccountEntry[];
    readonly outlet: ReactNode;
    readonly location: RouteLocation;
    readonly router: Pick<RouterService, 'navigate' | 'pathFor'>;
    readonly session: SessionService;
    readonly loginPath: string;
    readonly canOperate: () => boolean;
    readonly subscribe: (listener: () => void) => () => void;
    readonly getSnapshot: () => WorkbenchSnapshot;
}

const Workbench = memo(({
    Layout, Navigation, accountEntries, outlet, location, router, session, loginPath, canOperate, subscribe, getSnapshot,
}: WorkbenchProps) => {
    const {signal, logoRevisions} = useSyncExternalStore(subscribe, getSnapshot);
    const userInfo = session.getUserInfo();
    const updateToken = userInfo?.roles?.includes(RoleType.SYSTEM_ADMIN) ? userInfo.token : undefined;
    const beginRequest = useWorkbenchRequests(signal, canOperate);
    const logoutRequest = useRef<WorkbenchRequest>();
    const cancelPendingTransition = useRef<() => void>();
    const leaveTimer = useRef<number>();
    const enterTimer = useRef<number>();
    const [routeStage, setRouteStage] = useState<'idle' | 'leaving' | 'entering'>('idle');

    useEffect(() => {
        const clearTimers = () => {
            cancelPendingTransition.current?.();
            window.clearTimeout(leaveTimer.current);
            window.clearTimeout(enterTimer.current);
        };
        signal.addEventListener('abort', clearTimers, {once: true});
        return () => {
            signal.removeEventListener('abort', clearTimers);
            clearTimers();
        };
    }, [signal]);

    useEffect(() => {
        cancelPendingTransition.current?.();
        window.clearTimeout(leaveTimer.current);
        if (signal.aborted) return;
        setRouteStage('entering');
        const timeout = window.setTimeout(() => setRouteStage(prev => prev === 'entering' ? 'idle' : prev), 420);
        enterTimer.current = timeout;
        return () => window.clearTimeout(timeout);
    }, [location.key, signal]);

    const openAccountPage = (routeId: string) => {
        if (canOperate() && !signal.aborted) void router.navigate(router.pathFor(routeId));
    };

    const runTransition = async (navigate: () => Promise<void>) => {
        if (!canOperate() || signal.aborted) return;
        cancelPendingTransition.current?.();
        window.clearTimeout(leaveTimer.current);
        setRouteStage('leaving');
        leaveTimer.current = window.setTimeout(() => {
            setRouteStage(prev => prev === 'leaving' ? 'idle' : prev);
        }, 340);

        const ready = await new Promise<boolean>(resolve => {
            const timer = window.setTimeout(() => {
                cancelPendingTransition.current = undefined;
                resolve(true);
            }, 260);
            cancelPendingTransition.current = () => {
                window.clearTimeout(timer);
                cancelPendingTransition.current = undefined;
                resolve(false);
            };
        });
        if (ready && canOperate() && !signal.aborted) await navigate();
    };

    const handleLogout = async () => {
        if (logoutRequest.current && !logoutRequest.current.signal.aborted) return;
        const request = beginRequest();
        if (!request) return;
        logoutRequest.current = request;
        try {
            if (await session.logout(request.signal) && !request.signal.aborted) await router.navigate(loginPath);
        } catch {
            if (!request.signal.aborted) globalMessage.messageApi?.error(tx('退出失败，请重试'));
        } finally {
            request.finish();
            if (logoutRequest.current === request) logoutRequest.current = undefined;
        }
    };

    const handleSessionExpiry = useCallback((token: string) => {
        if (session.getUserInfo()?.token !== token) return;
        session.removeUser();
        void router.navigate(loginPath);
    }, [session, router, loginPath]);

    const routeInnerClassName = routeStage === 'idle' ? 'home-route-inner' : `home-route-inner is-${routeStage}`;

    return (
        <>
            <Layout
                navigation={
                    <WorkbenchSidebar
                        navigation={<Navigation runTransition={runTransition}/>}
                        accountEntries={accountEntries} userInfo={userInfo} logoRevisions={logoRevisions}
                        onSelectAccountPage={openAccountPage} onLogout={handleLogout}
                    />
                }
                content={
                    <div key={location.key} className={routeInnerClassName}>
                        <Suspense fallback={<Loading/>}>
                            {outlet}
                        </Suspense>
                    </div>
                }
            />
            <GlobalModal/>
            <WebUpdateNotice token={updateToken} beginRequest={beginRequest} onSessionExpiry={handleSessionExpiry}/>
        </>
    );
})

export default Workbench;
