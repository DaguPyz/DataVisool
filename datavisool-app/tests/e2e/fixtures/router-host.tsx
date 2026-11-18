/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {AppProviders} from '@/bootstrap/AppProviders.tsx';
import {createAppRuntime} from '@/bootstrap/createAppRuntime.ts';
import {homeRouteId, routeChangedKey, routerKey} from '@/contracts/router.ts';
import {uiKey} from '@/contracts/ui.ts';
import {createErrorUiPlugin} from '@/plugins/error-ui/errorUiPlugin.ts';
import {createLoginPlugin} from '@/plugins/login/loginPlugin.tsx';
import {createRouterPlugin} from '@/plugins/router/routerPlugin.tsx';
import {createSessionPlugin} from '@/plugins/session/sessionPlugin.ts';
import {createUiPlugin} from '@/plugins/ui/uiPlugin.tsx';
import {createWorkbenchPlugin} from '@/plugins/workbench/workbenchPlugin.tsx';
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

function createAlternateLayout(): Plugin {
    return {
        id: 'fixture-layout',
        requires: [routerKey],
        provides: [],
        activate(context) {
            const registration = context.get(routerKey).registerRoutes([
                {id: homeRouteId, path: '/home', render: ({outlet}) => <main aria-label="Alternate layout">{outlet}</main>},
            ]);
            context.onStop(registration);
            context.onDispose(registration.dispose);
        },
    };
}

async function mountFixture() {
    const homePath = '/home/reports';
    const query = new URLSearchParams(window.location.search);
    const layout = query.get('layout') === 'alternate'
        ? createAlternateLayout()
        : createWorkbenchPlugin({homePath, loginPath: '/login'});
    const runtime = await createAppRuntime([
        createReportsPlugin(),
        createUiPlugin({RootProviders: AppProviders, homePath}),
        createErrorUiPlugin(),
        createRouterPlugin({homePath}),
        createSessionPlugin(),
        createLoginPlugin({successPath: homePath}),
        layout,
    ]);
    runtime.get(uiKey).mount(document.getElementById('root')!);
}

void mountFixture();
