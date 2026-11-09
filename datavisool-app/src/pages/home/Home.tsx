/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {memo, Suspense, useEffect, useMemo, useState} from 'react';
import "@/pages/home/Home.less";
import {Outlet, useLocation} from 'react-router-dom';
import {HomeMenus} from "@/pages/home/menus/HomeMenus.tsx";
import {GlobalModal, Loading} from "@datavisool/ui";
import WebUpdateNotice from "@/pages/home/web-update/WebUpdateNotice.tsx";

const Home = memo(() => {
    const location = useLocation();
    const [routeStage, setRouteStage] = useState<'idle' | 'leaving' | 'entering'>('idle');

    useEffect(() => {
        const onLeave = () => {
            setRouteStage('leaving');
            window.setTimeout(() => {
                setRouteStage((prev) => (prev === 'leaving' ? 'idle' : prev));
            }, 340);
        };
        window.addEventListener('datavisool-home-route-leave', onLeave);
        return () => window.removeEventListener('datavisool-home-route-leave', onLeave);
    }, []);

    useEffect(() => {
        setRouteStage('entering');
        const timer = window.setTimeout(() => setRouteStage('idle'), 420);
        return () => window.clearTimeout(timer);
    }, [location.key]);

    const routeInnerClassName = useMemo(() => {
        if (routeStage === 'leaving') return 'home-route-inner is-leaving';
        if (routeStage === 'entering') return 'home-route-inner is-entering';
        return 'home-route-inner';
    }, [routeStage]);

    return (
        <WebUpdateNotice>
            <div className="datavisool-home">
                <div className="home-left">
                    <div className="home-side-card">
                        <div className={'datavisool-home-body-left'}>
                            <HomeMenus/>
                        </div>
                    </div>
                </div>
                <div className="home-right">
                    <div className="home-main-card">
                        <div className="home-content">
                            <div className="home-route">
                                <div key={location.key} className={routeInnerClassName}>
                                    <Suspense fallback={<Loading/>}>
                                        <Outlet/>
                                    </Suspense>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <GlobalModal/>
            </div>
        </WebUpdateNotice>
    );
})

export default Home;
