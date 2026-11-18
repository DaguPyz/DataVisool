/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createAppPlugins} from '@/bootstrap/appPlugins.ts';
import {createAppRuntime} from '@/bootstrap/createAppRuntime.ts';
import {homeLayoutKey} from '@/contracts/homeLayout.ts';
import {navigationKey, type NavigationMenuEntry} from '@/contracts/navigation.ts';
import {homeRouteId, routeChangedKey, routerKey} from '@/contracts/router.ts';
import {sessionKey} from '@/contracts/session.ts';
import {uiKey} from '@/contracts/ui.ts';
import type {Plugin} from '@/visloom/index.ts';

function createReportsPlugin(): Plugin {
    return {
        id: 'fixture-reports',
        requires: [navigationKey, routerKey],
        provides: [],
        activate(context) {
            const router = context.get(routerKey);
            const events = document.createElement('output');
            events.id = 'route-events';
            document.body.append(events);
            context.onDispose(() => events.remove());
            context.on(routeChangedKey, location => {
                events.value = location.pathname + location.search + location.hash + ' ' + location.matchedRouteIds.join(' ');
            });
            const registration = router.registerRoutes([
                {id: 'reports:detail', parentId: 'reports:list', path: ':id', render: ({params}) => <h2>Report {params.id}</h2>},
                {
                    id: 'reports:list',
                    parentId: homeRouteId,
                    path: 'reports',
                    render: ({outlet}) => <section>
                        <h1>Reports</h1>
                        <button onClick={() => void router.navigate(router.pathFor('reports:detail', {id: '7/2'}) + '?range=week#summary')}>
                            Open report
                        </button>
                        {outlet}
                    </section>,
                },
            ]);
            context.onStop(registration);
            context.onDispose(registration.dispose);
            const menus = context.get(navigationKey).registerMenuEntries([
                {routeId: 'reports:list', label: 'Reports', order: 200},
            ]);
            context.onStop(menus);
            context.onDispose(menus.dispose);
        },
    };
}

function createAlternateLayoutPlugin(): Plugin {
    return {
        id: 'fixture-layout',
        requires: [],
        provides: [homeLayoutKey],
        activate(context) {
            context.provide(homeLayoutKey, {
                Layout({navigation, content}) {
                    return (
                        <div style={{display: 'grid', gridTemplateRows: '220px minmax(0, 1fr)', height: '100%'}}>
                            <section aria-label="Alternate navigation" style={{overflow: 'auto'}}>{navigation}</section>
                            <main aria-label="Alternate layout" style={{overflow: 'auto'}}>{content}</main>
                        </div>
                    );
                },
            });
        },
    };
}

function createAlternateNavigationPlugin(): Plugin {
    return {
        id: 'fixture-navigation',
        requires: [routerKey, sessionKey],
        provides: [navigationKey],
        activate(context) {
            const router = context.get(routerKey);
            const session = context.get(sessionKey);
            const entries = new Set<NavigationMenuEntry>();
            context.provide(navigationKey, {
                Navigation({runTransition}) {
                    const roles = session.getUserInfo()?.roles ?? [];
                    const active = router.getLocation()?.matchedRouteIds ?? [];
                    const visible = [...entries].filter(entry => !entry.roles || entry.roles.some(role => roles.includes(role)));
                    return <nav aria-label="Alternate menu" style={{overflow: 'auto'}}>
                        {visible.map(({routeId, label}) => (
                            <button key={routeId} aria-current={active.includes(routeId) ? 'page' : undefined}
                                    onClick={() => {
                                        const navigate = () => router.navigate(router.pathFor(routeId));
                                        void (runTransition ? runTransition(navigate) : navigate());
                                    }}>
                                {label}
                            </button>
                        ))}
                    </nav>;
                },
                registerMenuEntries(items) {
                    for (const item of items) entries.add(item);
                    return {
                        prepare() {},
                        dispose() { for (const item of items) entries.delete(item); },
                    };
                },
            });
        },
    };
}

async function mountFixture() {
    const options = new URLSearchParams(window.location.search);
    const plugins = createAppPlugins().map(plugin => {
        if (options.get('layout') === 'alternate' && plugin.provides.includes(homeLayoutKey)) return createAlternateLayoutPlugin();
        if (options.get('navigation') === 'alternate' && plugin.provides.includes(navigationKey)) return createAlternateNavigationPlugin();
        return plugin;
    });
    const runtime = await createAppRuntime([createReportsPlugin(), ...plugins]);
    runtime.get(uiKey).mount(document.getElementById('root')!);
}

void mountFixture();
