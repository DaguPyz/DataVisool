/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createAppPlugins} from '@/bootstrap/appPlugins.ts';
import {createAppRuntime} from '@/bootstrap/createAppRuntime.ts';
import {homeLayoutKey} from '@/contracts/homeLayout.ts';
import {homeRouteId, routeChangedKey, routerKey} from '@/contracts/router.ts';
import {uiKey} from '@/contracts/ui.ts';
import type {Plugin} from '@/visloom/index.ts';

function createReportsPlugin(): Plugin {
    return {
        id: 'fixture-reports',
        requires: [routerKey],
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

async function mountFixture() {
    const useAlternateLayout = new URLSearchParams(window.location.search).get('layout') === 'alternate';
    const plugins = createAppPlugins().map(plugin =>
        useAlternateLayout && plugin.provides.includes(homeLayoutKey) ? createAlternateLayoutPlugin() : plugin,
    );
    const runtime = await createAppRuntime([createReportsPlugin(), ...plugins]);
    runtime.get(uiKey).mount(document.getElementById('root')!);
}

void mountFixture();
